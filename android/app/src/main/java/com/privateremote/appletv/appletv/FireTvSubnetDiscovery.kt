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
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import kotlin.coroutines.resume

/** Bounded fallback for networks that do not forward SSDP or mDNS. */
internal class FireTvSubnetDiscovery(context: Context) {
    private val connectivity = context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val lastActivation = ConcurrentHashMap<String, Long>()

    suspend fun scan(skipAddresses: Set<String> = emptySet(), onResolved: (AppleTvDevice) -> Unit) = withContext(Dispatchers.IO) {
        val network = connectivity.activeNetwork ?: return@withContext
        if (connectivity.getNetworkCapabilities(network)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) != true) return@withContext
        val links = connectivity.getLinkProperties(network)?.linkAddresses.orEmpty()
        val addresses = links.flatMap { link ->
            val address = link.address as? Inet4Address ?: return@flatMap emptyList()
            subnetCandidates(address, link.prefixLength)
        }.distinct()
        scanFireTvSubnet(addresses.filterNot { it in skipAddresses }, lastActivation, onResolved)
    }
}

internal suspend fun scanFireTvSubnet(
    addresses: List<String>,
    lastActivation: MutableMap<String, Long> = ConcurrentHashMap(),
    onResolved: (AppleTvDevice) -> Unit,
) {
    withTimeoutOrNull(7_000) {
        coroutineScope {
            val slots = Semaphore(48)
            addresses.forEach { address ->
                launch {
                    slots.withPermit {
                        try { probeFireTv(address, lastActivation = lastActivation)?.let(onResolved) }
                        catch (e: CancellationException) { throw e }
                        catch (_: Exception) { }
                    }
                }
            }
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

private val discoveryTrust = object : X509TrustManager {
    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
}

private val certificateExecutor = Executors.newFixedThreadPool(8) { task -> Thread(task, "fire-tv-certificate").apply { isDaemon = true } }

private val discoveryClient: OkHttpClient by lazy {
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(discoveryTrust), null) }
    OkHttpClient.Builder().sslSocketFactory(ssl.socketFactory, discoveryTrust)
        .hostnameVerifier { _, _ -> true }.followRedirects(false).followSslRedirects(false)
        .connectTimeout(500, TimeUnit.MILLISECONDS).readTimeout(500, TimeUnit.MILLISECONDS)
        .callTimeout(1500, TimeUnit.MILLISECONDS).build()
}

private suspend fun <T> fetch(request: Request, read: (Response) -> T?): T? = suspendCancellableCoroutine { cont ->
    val call = discoveryClient.newCall(request)
    cont.invokeOnCancellation { call.cancel() }
    call.enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) { if (cont.isActive) cont.resume(null) }
        override fun onResponse(call: Call, response: Response) {
            val value = response.use { runCatching { read(it) }.getOrNull() }
            if (cont.isActive) cont.resume(value)
        }
    })
}

internal suspend fun probeFireTv(
    address: String,
    dialPort: Int = 8009,
    remotePort: Int = 8080,
    lastActivation: MutableMap<String, Long> = ConcurrentHashMap(),
): AppleTvDevice? {
    val dialUrl = "http://$address:$dialPort/apps/FireTVRemote"
    val isRemote = fetch(Request.Builder().url(dialUrl).build()) { response ->
        response.isSuccessful && response.body?.byteStream()?.use { isFireTvRemoteService(it.readBytesLimited(65536)) } == true
    } == true
    if (!isRemote) return null

    suspend fun certificate(): String? = withTimeoutOrNull(1500) {
        suspendCancellableCoroutine { cont ->
            val socket = Socket()
            cont.invokeOnCancellation { runCatching { socket.close() } }
            certificateExecutor.execute {
                val result = runCatching {
                    socket.use {
                        it.connect(InetSocketAddress(address, remotePort), 500)
                        it.soTimeout = 500
                        val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(discoveryTrust), null) }
                        (ssl.socketFactory.createSocket(it, address, remotePort, true) as SSLSocket).use { tls ->
                            tls.startHandshake()
                            MessageDigest.getInstance("SHA-256").digest(tls.session.peerCertificates.first().encoded)
                                .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
                        }
                    }
                }.getOrNull()
                if (cont.isActive) cont.resume(result)
            }
        }
    }
    var fingerprint = certificate()
    if (fingerprint == null) {
        val now = java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime())
        val previous = lastActivation[address]
        if (previous != null && now - previous < 60_000) return null
        lastActivation[address] = now
        val launched = fetch(Request.Builder().url(dialUrl).post(ByteArray(0).toRequestBody()).build()) { it.isSuccessful } == true
        if (!launched) return null
        repeat(3) {
            if (fingerprint == null) { delay(400); fingerprint = certificate() }
        }
    }
    return fingerprint?.let { AppleTvDevice("Fire TV", address, 8080, model = "Fire TV", identifier = "firetv:cert:$it") }
}
