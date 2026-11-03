package com.privateremote.appletv.appletv

import dev.atvremote.protocol.discovery.AppleTvDevice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.URL
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

class FireTvAuthenticationException : IOException("Fire TV pairing was rejected. Pair it again.")

val AppleTvDevice.isFireTv: Boolean get() = identifier?.startsWith("firetv:") == true

/** The receiver uses a self-signed certificate. Keep the first certificate for the
 * duration of pairing and pin it alongside the token for subsequent requests. */
class FireTvRemote(private val device: AppleTvDevice, certificate: String? = null, private val token: String? = null, private val dialPort: Int = 8009) {
    private var fingerprint: String? = certificate

    suspend fun startPairing() {
        withActivation { request("/v1/FireTV/pin/display", JSONObject().put("friendlyName", "Android Remote")) }
    }

    suspend fun completePairing(pin: String): Pair<String, String> {
        require(pin.matches(Regex("[0-9]{4}"))) { "Enter the four-digit code" }
        val body = request("/v1/FireTV/pin/verify", JSONObject().put("pin", pin))
        val newToken = JSONObject(body).optString("description").takeIf { it.isNotBlank() }
            ?: throw IOException("Fire TV did not accept the pairing code")
        return Pair(newToken, fingerprint ?: throw IOException("Fire TV certificate unavailable"))
    }

    suspend fun verify() { JSONObject(withActivation { request("/v1/FireTV/status", method = "GET") }) }

    private suspend fun <T> withActivation(block: suspend () -> T): T {
        try { return block() } catch (e: java.net.ConnectException) {
            activate()
            kotlinx.coroutines.delay(1000)
            return block()
        }
    }

    private suspend fun activate() = withContext(Dispatchers.IO) {
        val host = if (device.address.contains(':')) "[${device.address}]" else device.address
        val conn = URL("http://$host:$dialPort/apps/FireTVRemote").openConnection() as java.net.HttpURLConnection
        try {
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 4000
            conn.readTimeout = 4000
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setFixedLengthStreamingMode(0)
            conn.outputStream.close()
            if (conn.responseCode !in 200..299) throw IOException("Fire TV activation failed (HTTP ${conn.responseCode})")
        } finally { conn.disconnect() }
    }

    suspend fun press(name: String) {
        val action = when (name.uppercase()) {
            "UP" -> "dpad_up"
            "DOWN" -> "dpad_down"
            "LEFT" -> "dpad_left"
            "RIGHT" -> "dpad_right"
            "SELECT" -> "select"
            "BACK", "MENU" -> "back"
            "HOME", "TV" -> "home"
            "PLAY_PAUSE" -> { request("/v1/media?action=play", method = "POST"); return }
            else -> throw UnsupportedOperationException("This control is not supported on Fire TV")
        }
        val path = "/v1/FireTV?action=$action"
        if (action.startsWith("dpad_") || action == "select") {
            request(path, JSONObject().put("keyActionType", "keyDown"))
            kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) { request(path, JSONObject().put("keyActionType", "keyUp")) }
        } else request(path, method = "POST")
    }

    private suspend fun request(path: String, body: JSONObject? = null, method: String = "POST"): String = withContext(Dispatchers.IO) {
        val trust = object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
                if (chain.isEmpty()) throw CertificateException("Missing Fire TV certificate")
                val actual = MessageDigest.getInstance("SHA-256").digest(chain[0].encoded)
                    .joinToString("") { "%02x".format(it.toInt() and 0xff) }
                val expected = fingerprint
                if (expected != null && expected != actual) throw CertificateException("Fire TV certificate changed")
                fingerprint = actual
            }
        }
        val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
        val urlHost = if (device.address.contains(':')) "[${device.address}]" else device.address
        val conn = URL("https://$urlHost:${device.port}$path").openConnection() as HttpsURLConnection
        try {
            conn.sslSocketFactory = ssl.socketFactory
            conn.hostnameVerifier = javax.net.ssl.HostnameVerifier { _, _ -> true }
            conn.connectTimeout = 4000
            conn.readTimeout = 4000
            conn.instanceFollowRedirects = false
            conn.requestMethod = method
            conn.setRequestProperty("X-Api-Key", "0987654321")
            token?.let { conn.setRequestProperty("X-Client-Token", it) }
            if (method == "POST") {
                val bytes = body?.toString()?.toByteArray(Charsets.UTF_8) ?: ByteArray(0)
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.setFixedLengthStreamingMode(bytes.size)
                conn.outputStream.use { it.write(bytes) }
            }
            val status = conn.responseCode
            if (status == 401 || status == 403) throw FireTvAuthenticationException()
            if (status !in 200..299) throw IOException("Fire TV request failed (HTTP $status)")
            conn.inputStream.use { input ->
                val bytes = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(4096)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (bytes.size() + count > 65536) throw IOException("Fire TV response too large")
                    bytes.write(buffer, 0, count)
                }
                bytes.toString("UTF-8")
            }
        } finally { conn.disconnect() }
    }
}
