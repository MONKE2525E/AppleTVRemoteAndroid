package com.privateremote.appletv.appletv

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import dev.atvremote.protocol.discovery.AppleTvDevice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.security.MessageDigest
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager

/** Bounded fallback for networks that do not forward SSDP or mDNS. */
internal class FireTvSubnetDiscovery(context: Context) {
    private val connectivity = context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    suspend fun scan(onResolved: (AppleTvDevice) -> Unit) = withContext(Dispatchers.IO) {
        val network = connectivity.activeNetwork ?: return@withContext
        if (connectivity.getNetworkCapabilities(network)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) != true) return@withContext
        val links = connectivity.getLinkProperties(network)?.linkAddresses.orEmpty()
        val addresses = links.flatMap { link ->
            val address = link.address as? Inet4Address ?: return@flatMap emptyList()
            subnetCandidates(address, link.prefixLength)
        }.distinct()
        scanFireTvSubnet(addresses, onResolved)
    }
}

internal suspend fun scanFireTvSubnet(addresses: List<String>, onResolved: (AppleTvDevice) -> Unit) = coroutineScope {
    val slots = Semaphore(48)
    addresses.forEach { address ->
        launch(Dispatchers.IO) {
            slots.withPermit { runCatching { probeFireTv(address) }.getOrNull()?.let(onResolved) }
        }
    }
}

internal fun subnetCandidates(address: Inet4Address, prefixLength: Int): List<String> {
    if (!address.isSiteLocalAddress || prefixLength !in 1..30) return emptyList()
    val prefix = maxOf(prefixLength, 24)
    val bytes = address.address
    val ip = bytes.fold(0L) { value, byte -> (value shl 8) or (byte.toLong() and 255) }
    val mask = (0xffffffffL shl (32 - prefix)) and 0xffffffffL
    val first = (ip and mask) + 1
    val last = (ip or (mask xor 0xffffffffL)) - 1
    return (first..last).filter { it != ip }.map { value ->
        listOf(24, 16, 8, 0).joinToString(".") { shift -> ((value shr shift) and 255).toString() }
    }
}

internal fun probeFireTv(address: String, dialPort: Int = 8009, remotePort: Int = 8080): AppleTvDevice? {
    val url = URL("http", address, dialPort, "/apps/FireTVRemote")
    fun request(method: String): ByteArray? {
        val conn = url.openConnection() as java.net.HttpURLConnection
        return try {
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 500
            conn.readTimeout = 500
            conn.requestMethod = method
            if (method == "POST") { conn.doOutput = true; conn.setFixedLengthStreamingMode(0); conn.outputStream.close() }
            if (conn.responseCode !in 200..299) null else conn.inputStream.use { it.readBytesLimited(65536) }
        } finally { conn.disconnect() }
    }
    if (!isFireTvRemoteService(request("GET") ?: return null)) return null
    if (request("POST") == null) return null
    val trust = object : X509TrustManager {
        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
    }
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
    val fingerprint = (0..2).firstNotNullOfOrNull { attempt ->
        if (attempt > 0) Thread.sleep(400)
        runCatching {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(address, remotePort), 1000)
                socket.soTimeout = 1000
                (ssl.socketFactory.createSocket(socket, address, 8080, true) as SSLSocket).use { tls ->
                    tls.startHandshake()
                    MessageDigest.getInstance("SHA-256").digest(tls.session.peerCertificates.first().encoded)
                        .joinToString("") { "%02x".format(it.toInt() and 0xff) }
                }
            }
        }.getOrNull()
    } ?: return null
    return AppleTvDevice("Fire TV", address, 8080, model = "Fire TV", identifier = "firetv:cert:$fingerprint")
}
