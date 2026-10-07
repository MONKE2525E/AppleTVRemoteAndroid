package com.privateremote.appletv.appletv

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.NowPlaying
import dev.atvremote.protocol.mrp.PlaybackState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.w3c.dom.Element
import java.io.ByteArrayInputStream
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URL
import javax.xml.parsers.DocumentBuilderFactory

val AppleTvDevice.isRoku: Boolean get() = identifier?.startsWith("roku:") == true

class RokuHttpException(val statusCode: Int, message: String) : IOException(message) {
    val isRetryable: Boolean
        get() = statusCode == 408 || statusCode == 429 ||
            (statusCode in 500..599 && statusCode !in DEFINITIVE_SERVER_ERRORS)

    private companion object {
        val DEFINITIVE_SERVER_ERRORS = setOf(501, 505, 506, 508, 510, 511)
    }
}

/** Roku ECP stays in the integration layer; it does not use Apple's pairing protocol. */
class RokuRemote(private val device: AppleTvDevice, private val ecpPort: Int = 8060) {
    suspend fun press(name: String) {
        val key = when (name.uppercase()) {
            "UP" -> "Up"
            "DOWN" -> "Down"
            "LEFT" -> "Left"
            "RIGHT" -> "Right"
            "SELECT" -> "Select"
            "MENU", "BACK" -> "Back"
            "HOME", "TV" -> "Home"
            "PLAY_PAUSE" -> "Play"
            "VOLUME_UP" -> "VolumeUp"
            "VOLUME_DOWN" -> "VolumeDown"
            "MUTE" -> "VolumeMute"
            "SLEEP" -> "PowerOff"
            "WAKE" -> "PowerOn"
            else -> throw IllegalArgumentException("$name is not supported on Roku")
        }
        request("keypress/$key", "POST")
    }

    suspend fun playback(): NowPlaying = parsePlayback(request("query/media-player"))

    suspend fun verify(): AppleTvDevice = parseDevice(request("query/device-info"), device.address)

    private suspend fun request(path: String, method: String = "GET"): String = withContext(Dispatchers.IO) {
        val connection = URL("http://${device.address}:$ecpPort/$path").openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 3000
            connection.readTimeout = 3000
            connection.instanceFollowRedirects = false
            connection.requestMethod = method
            if (method == "POST") {
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(0)
                connection.outputStream.close()
            }
            val status = connection.responseCode
            if (status !in 200..299) {
                throw RokuHttpException(status, if (status == 401 || status == 403)
                    "Enable Control by mobile apps in your Roku's advanced system settings."
                    else "Roku returned HTTP $status")
            }
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        private fun xml(text: String): Element {
            // Android's DOM factory does not support Xerces' disallow-doctype-decl feature.
            // Reject DTDs before parsing so entity declarations remain forbidden on both runtimes.
            if (text.contains("<!DOCTYPE", ignoreCase = true)) {
                throw IOException("Roku XML must not contain a document type")
            }
            val factory = DocumentBuilderFactory.newInstance()
            return factory.newDocumentBuilder().parse(ByteArrayInputStream(text.toByteArray())).documentElement
        }

        private fun Element.text(tag: String): String? = getElementsByTagName(tag).item(0)?.textContent
            ?.trim()?.takeIf { it.isNotEmpty() }

        fun parseDevice(text: String, address: String): AppleTvDevice {
            val root = xml(text)
            val serial = root.text("serial-number") ?: throw IOException("Roku did not identify itself")
            return AppleTvDevice(
                name = root.text("user-device-name") ?: root.text("friendly-device-name") ?: "Roku",
                address = address, port = 8060,
                model = "Roku ${root.text("model-name") ?: "TV"}", identifier = "roku:$serial",
            )
        }

        fun parsePlayback(text: String): NowPlaying {
            val root = xml(text)
            val state = when (root.getAttribute("state").lowercase()) {
                "play", "playing" -> PlaybackState.PLAYING
                "pause", "paused" -> PlaybackState.PAUSED
                "buffer", "buffering" -> PlaybackState.INTERRUPTED
                "none", "stop", "stopped", "close", "closed" -> PlaybackState.STOPPED
                else -> PlaybackState.UNKNOWN
            }
            fun seconds(tag: String): Double? = root.text(tag)?.removeSuffix("ms")?.trim()
                ?.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 }?.div(1000)
            val plugin = root.getElementsByTagName("plugin").item(0) as? Element
            return NowPlaying(
                title = root.text("title"), artist = root.text("artist"),
                appName = plugin?.getAttribute("name")?.takeIf { it.isNotBlank() },
                playbackState = state, duration = seconds("duration"), elapsedTime = seconds("position"),
            )
        }
    }
}

class RokuDiscovery(context: Context) {
    private val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

    suspend fun scan(timeoutMs: Long, onResolved: (AppleTvDevice) -> Unit) = withContext(Dispatchers.IO) {
        val multicast = wifi.createMulticastLock("roku-discovery").apply { acquire() }
        try {
            val addresses = linkedSetOf<String>()
            DatagramSocket().use { socket ->
                socket.soTimeout = 500
                val request = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n" +
                    "MAN: \"ssdp:discover\"\r\nMX: 2\r\nST: roku:ecp\r\n\r\n").toByteArray()
                val target = InetAddress.getByName("239.255.255.250")
                repeat(2) { socket.send(DatagramPacket(request, request.size, target, 1900)) }
                val deadline = System.nanoTime() + timeoutMs * 1_000_000
                while (System.nanoTime() < deadline) {
                    currentCoroutineContext().ensureActive()
                    val packet = DatagramPacket(ByteArray(8192), 8192)
                    try {
                        socket.receive(packet)
                        val response = String(packet.data, 0, packet.length)
                        if (response.contains("roku:ecp", ignoreCase = true) && packet.address.isSiteLocalAddress) {
                            packet.address.hostAddress?.let { addresses.add(it) }
                        }
                    } catch (_: SocketTimeoutException) { }
                }
            }
            for (address in addresses) {
                currentCoroutineContext().ensureActive()
                val probe = AppleTvDevice("Roku", address, 8060, identifier = "roku:probe")
                try { onResolved(RokuRemote(probe).verify()) }
                catch (e: kotlinx.coroutines.CancellationException) { throw e }
                catch (e: Exception) { Log.w("RokuDiscovery", "Roku discovery probe failed", e) }
            }
        } finally {
            if (multicast.isHeld) multicast.release()
        }
    }
}
