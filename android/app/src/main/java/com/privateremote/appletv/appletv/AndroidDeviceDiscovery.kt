package com.privateremote.appletv.appletv

import android.content.Context
import android.net.wifi.WifiManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.util.Log
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.discovery.COMPANION_SERVICE_TYPE
import dev.atvremote.protocol.discovery.DeviceDiscovery
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

/**
 * [DeviceDiscovery] backed by Android's NsdManager — the protocol module
 * itself stays platform-agnostic (see android/protocol/UPSTREAM.md).
 *
 * Services are resolved one at a time (overlapping `resolveService` calls
 * fail with ALREADY_ACTIVE on older platform versions), but each one as soon
 * as it is found rather than after the whole scan window, so an Apple TV shows
 * up within a second or two instead of after [scan]'s full timeout.
 */
class AndroidDeviceDiscovery(context: Context) : DeviceDiscovery {

    private val appContext = context.applicationContext
    private val nsd = appContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifi = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

    override suspend fun scan(timeoutMs: Long): List<AppleTvDevice> = scan(timeoutMs) {}

    /** Reports each device as it resolves, rather than only at the end. */
    suspend fun scan(timeoutMs: Long, onResolved: (AppleTvDevice) -> Unit): List<AppleTvDevice> =
        withContext(Dispatchers.IO) {
            val pending = Channel<NsdServiceInfo>(Channel.UNLIMITED)
            val seen = ConcurrentHashMap.newKeySet<String>()
            val resolved = mutableListOf<AppleTvDevice>()
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
                    // IPv4 and IPv6 each report the same service name.
                    if (seen.add(serviceInfo.serviceName)) pending.trySend(serviceInfo)
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

            try {
                nsd.discoverServices(COMPANION_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
                withTimeoutOrNull(timeoutMs) {
                    for (info in pending) {
                        val device = withTimeoutOrNull(3000) { resolve(info) } ?: continue
                        Log.i(TAG, "NSD resolved ${device.name} ${device.address}:${device.port}")
                        resolved.add(device)
                        onResolved(device)
                    }
                }
            } finally {
                pending.close()
                runCatching { nsd.stopServiceDiscovery(listener) }
                runCatching { if (multicast.isHeld) multicast.release() }
            }
            resolved
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
            // A timed-out resolve must not leave the next one failing with ALREADY_ACTIVE.
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
