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

/**
 * [DeviceDiscovery] backed by Android's NsdManager. The protocol module stays
 * platform-agnostic (see android/protocol/UPSTREAM.md).
 *
 * Services are resolved one at a time while discovery and multicast reception
 * remain active. Android 14+ uses service-info callbacks instead of the
 * deprecated resolver.
 */
class AndroidDeviceDiscovery(context: Context) : DeviceDiscovery {

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

            val listener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(serviceType: String) {
                    Log.i(TAG, "NSD started for $serviceType")
                }
                override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                    Log.i(TAG, "NSD found ${serviceInfo.serviceName} type=${serviceInfo.serviceType}")
                    // IPv4 and IPv6 can report the same service name.
                    synchronized(seen) {
                        if (seen.add(serviceInfo.serviceName)) found.trySend(serviceInfo)
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
                            if (Build.VERSION.SDK_INT >= 34) resolveUpdated(info) else resolve(info)
                        }?.also { device ->
                            devices[device.credentialKey] = device
                            Log.i(TAG, "NSD resolved ${device.name} ${device.address}:${device.port}")
                            onResolved(device)
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Log.w(TAG, "NSD resolution failed", e)
                    }
                }
            }

            try {
                nsd.discoverServices(COMPANION_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
                delay(timeoutMs)
                found.close()
                resolver.join()
            } finally {
                found.close()
                resolver.cancel()
                runCatching { nsd.stopServiceDiscovery(listener) }
                runCatching { if (multicast.isHeld) multicast.release() }
            }
            devices.values.toList()
        } } }

    @androidx.annotation.RequiresApi(34)
    private suspend fun resolveUpdated(info: NsdServiceInfo): AppleTvDevice? {
        val result = CompletableDeferred<AppleTvDevice?>()
        val callback = object : NsdManager.ServiceInfoCallback {
            override fun onServiceUpdated(serviceInfo: NsdServiceInfo) {
                val host = hostAddress(serviceInfo) ?: return
                if (serviceInfo.port > 0) result.complete(AppleTvDevice(
                    name = serviceInfo.serviceName,
                    address = host,
                    port = serviceInfo.port,
                    model = serviceInfo.txt("rpMd"),
                    identifier = serviceInfo.txt("rpMRtID"),
                ))
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

    private suspend fun resolve(info: NsdServiceInfo): AppleTvDevice? =
        suspendCancellableCoroutine { cont: CancellableContinuation<AppleTvDevice?> ->
            val listener = object : NsdManager.ResolveListener {
                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    Log.w(TAG, "NSD resolve failed ${serviceInfo.serviceName} code=$errorCode")
                    if (cont.isActive) cont.resume(null)
                }

                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    if (!cont.isActive) return
                    val host = hostAddress(serviceInfo)
                    cont.resume(
                        if (host == null) null else AppleTvDevice(
                            name = serviceInfo.serviceName,
                            address = host,
                            port = serviceInfo.port,
                            model = serviceInfo.txt("rpMd"),
                            identifier = serviceInfo.txt("rpMRtID"),
                        ),
                    )
                }
            }
            nsd.resolveService(info, listener)
            // Android 14 added a cancellation API for in-flight resolutions.
            if (Build.VERSION.SDK_INT >= 34) {
                cont.invokeOnCancellation { runCatching { nsd.stopServiceResolution(listener) } }
            }
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

    private fun NsdServiceInfo.txt(key: String): String? =
        attributes[key]?.toString(Charsets.UTF_8)

    companion object {
        private const val TAG = "AtvDiscovery"
    }
}
