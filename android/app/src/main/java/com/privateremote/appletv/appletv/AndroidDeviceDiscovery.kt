package com.privateremote.appletv.appletv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.util.Log
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.discovery.COMPANION_SERVICE_TYPE
import dev.atvremote.protocol.discovery.DeviceDiscovery
import dev.atvremote.protocol.discovery.deviceFromService
import dev.atvremote.protocol.discovery.DeviceKind
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * [DeviceDiscovery] backed by Android's NsdManager. The protocol module stays
 * platform-agnostic (see android/protocol/UPSTREAM.md).
 *
 * Services are resolved one at a time while discovery and multicast reception
 * remain active. Android 14+ uses service-info callbacks instead of the
 * deprecated resolver.
 */
class AndroidDeviceDiscovery(context: Context, private val fireTv: Boolean = false) : DeviceDiscovery {

    private val appContext = context.applicationContext
    private val nsd = appContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifi = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private val scanMutex = Mutex()

    override suspend fun scan(timeoutMs: Long): List<AppleTvDevice> = scan(timeoutMs) {}

    /** Reports each device as it resolves, rather than only at the end. */
    suspend fun scan(timeoutMs: Long, onResolved: (AppleTvDevice) -> Unit): List<AppleTvDevice> =
        withContext(Dispatchers.IO) { scanMutex.withLock { coroutineScope {
            val found = Channel<NsdServiceInfo>(Channel.UNLIMITED)
            val seen = HashSet<String>()
            val devices = LinkedHashMap<String, AppleTvDevice>()
            val multicast = wifi.createMulticastLock("atv-companion-nsd").apply {
                setReferenceCounted(true)
                acquire()
            }

            fun listener() = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(serviceType: String) {
                    Log.i(TAG, "NSD started for $serviceType")
                }
                override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                    Log.i(TAG, "NSD found ${serviceInfo.serviceName} type=${serviceInfo.serviceType}")
                    // IPv4 and IPv6 can report the same service name.
                    synchronized(seen) {
                        if (seen.add("${serviceInfo.serviceType}:${serviceInfo.serviceName}")) found.trySend(serviceInfo)
                    }
                }
                override fun onServiceLost(serviceInfo: NsdServiceInfo) = Unit
                override fun onDiscoveryStopped(serviceType: String) = Unit
                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                    Log.e(TAG, "NSD start failed type=$serviceType code=$errorCode")
                }
                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                    Log.w(TAG, "NSD stop failed type=$serviceType code=$errorCode")
                }
            }

            val resolver = launch {
                for (info in found) {
                    try {
                        withTimeoutOrNull(3000) {
                            if (Build.VERSION.SDK_INT >= 34) resolveUpdated(info) else resolveLegacy(info)
                        }?.also { device ->
                            devices["${info.serviceType}:${device.credentialKey}"] = device
                            Log.i(TAG, "NSD resolved ${device.name} ${device.address}:${device.port}")
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Log.w(TAG, "NSD resolution failed", e)
                    }
                }
            }

            val listeners = mutableListOf<NsdManager.DiscoveryListener>()
            try {
                (if (fireTv) listOf("_amzn-fireTv._tcp") else listOf(COMPANION_SERVICE_TYPE, "_airplay._tcp", "_googlecast._tcp")).forEach { type ->
                    val discoveryListener = listener()
                    try {
                        nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
                        listeners.add(discoveryListener)
                    } catch (e: Exception) {
                        Log.w(TAG, "NSD start failed type=$type", e)
                    }
                }
                delay(timeoutMs)
                found.close()
                resolver.join()
            } finally {
                found.close()
                resolver.cancel()
                listeners.forEach { runCatching { nsd.stopServiceDiscovery(it) } }
                runCatching { if (multicast.isHeld) multicast.release() }
            }
            val companion = devices.filterKeys { it.contains(COMPANION_SERVICE_TYPE, ignoreCase = true) }.values.toList()
            val airplay = devices.filterKeys { it.contains("_airplay._tcp", ignoreCase = true) }.values.toList()
            val merged = companion.map { device ->
                val receiver = airplay.firstOrNull { it.address == device.address }
                if (receiver == null) device else device.copy(
                    outputUid = receiver.outputUid, airplayPort = receiver.airplayPort,
                    kind = if (receiver.kind == DeviceKind.HOMEPOD) DeviceKind.HOMEPOD else device.kind,
                )
            }
            val companionHosts = companion.map { it.address }.toSet()
            val cast = devices.filterKeys { it.contains("_googlecast._tcp", ignoreCase = true) }.values
            (if (fireTv) devices.values.toList() else merged + airplay.filter { it.address !in companionHosts } + cast).also { it.forEach(onResolved) }
        } } }

    @androidx.annotation.RequiresApi(34)
    private suspend fun resolveUpdated(info: NsdServiceInfo): AppleTvDevice? {
        val result = CompletableDeferred<AppleTvDevice?>()
        val callback = object : NsdManager.ServiceInfoCallback {
            override fun onServiceUpdated(serviceInfo: NsdServiceInfo) {
                val host = hostAddress(serviceInfo) ?: return
                if (serviceInfo.port > 0) result.complete(parseService(serviceInfo, host))
            }
            override fun onServiceInfoCallbackRegistrationFailed(errorCode: Int) {
                Log.w(TAG, "NSD service-info registration failed code=$errorCode")
                result.complete(null)
            }
            override fun onServiceLost() { result.complete(null) }
            override fun onServiceInfoCallbackUnregistered() = Unit
        }
        nsd.registerServiceInfoCallback(info, Executor { it.run() }, callback)
        try {
            return result.await()
        } finally {
            runCatching { nsd.unregisterServiceInfoCallback(callback) }
        }
    }

    private class ResolutionAlreadyActive : Exception()

    private suspend fun resolveLegacy(info: NsdServiceInfo): AppleTvDevice? =
        legacyResolutionMutex.withLock {
            while (true) {
                try {
                    return@withLock resolve(info)
                } catch (_: ResolutionAlreadyActive) {
                    delay(250)
                }
            }
            @Suppress("UNREACHABLE_CODE")
            null
        }

    private suspend fun resolve(info: NsdServiceInfo): AppleTvDevice? =
        suspendCancellableCoroutine { cont: CancellableContinuation<AppleTvDevice?> ->
            val listener = object : NsdManager.ResolveListener {
                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    Log.w(TAG, "NSD resolve failed ${serviceInfo.serviceName} code=$errorCode")
                    if (cont.isActive) {
                        if (errorCode == NsdManager.FAILURE_ALREADY_ACTIVE) cont.resumeWithException(ResolutionAlreadyActive())
                        else cont.resume(null)
                    }
                }

                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    if (!cont.isActive) return
                    val host = hostAddress(serviceInfo)
                    cont.resume(
                        if (host == null) null else parseService(serviceInfo, host),
                    )
                }
            }
            nsd.resolveService(info, listener)
        }

    private fun hostAddress(info: NsdServiceInfo): String? {
        if (Build.VERSION.SDK_INT >= 34) {
            val addrs = info.hostAddresses
            val v4 = addrs.firstOrNull { it.hostAddress?.contains(':') != true }
            val picked = v4 ?: addrs.firstOrNull()
            if (picked != null) return picked.hostAddress
        }
        @Suppress("DEPRECATION")
        return info.host?.hostAddress
    }

    private fun parseService(info: NsdServiceInfo, host: String): AppleTvDevice =
        if (fireTv) AppleTvDevice(info.serviceName, host, info.port, model = "Fire TV", identifier = "firetv:mdns:${info.serviceName}")
        else deviceFromService(info.serviceName, host, info.port, info.serviceType,
            info.attributes.mapValues { it.value.toString(Charsets.UTF_8) })

    companion object {
        private const val TAG = "AtvDiscovery"
        private val legacyResolutionMutex = Mutex()
    }
}
