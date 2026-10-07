package com.privateremote.appletv.appletv

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import dev.atvremote.protocol.companion.AppInfo
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.NowPlaying
import dev.atvremote.protocol.mrp.PlaybackState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.w3c.dom.Element
import java.io.ByteArrayOutputStream
import java.io.ByteArrayInputStream
import android.os.SystemClock
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URL
import java.net.URLEncoder
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
            "REWIND" -> "Rev"
            "FAST_FORWARD" -> "Fwd"
            "VOLUME_UP" -> "VolumeUp"
            "VOLUME_DOWN" -> "VolumeDown"
            "MUTE" -> "VolumeMute"
            "SLEEP" -> "PowerOff"
            "WAKE" -> "PowerOn"
            else -> throw IllegalArgumentException("$name is not supported on Roku")
        }
        request("keypress/$key", "POST")
    }

    private var iconId: String? = null
    private var iconBytes: ByteArray? = null
    private var nextIconAttempt = 0L

    suspend fun playback(): NowPlaying {
        val response = request("query/media-player")
        var playback = parsePlayback(response)
        val plugin = xml(response).getElementsByTagName("plugin").item(0) as? Element
        var id = channelId(plugin?.getAttribute("id"))
        // Some players report state without their plugin identity. The active app
        // provides the channel icon, but is not a source of video metadata.
        if (id == null && playback.isActive) {
            try {
                val app = xml(request("query/active-app")).getElementsByTagName("app").item(0) as? Element
                id = channelId(app?.getAttribute("id"))
                if (playback.appName == null) playback = playback.copy(appName = app?.textContent?.trim()?.takeIf { it.isNotEmpty() })
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { Log.w("RokuRemote", "Active channel unavailable", e) }
        }
        if (id != iconId) { iconId = id; iconBytes = null; nextIconAttempt = 0 }
        if (id != null && playback.isActive && iconBytes == null && SystemClock.elapsedRealtime() >= nextIconAttempt) {
            nextIconAttempt = SystemClock.elapsedRealtime() + 60_000
            try {
                val bytes = requestBytes("query/icon/$id")
                if (bytes.size >= 8 && (bytes.take(4) == listOf(0x89.toByte(), 0x50.toByte(), 0x4e.toByte(), 0x47.toByte()) ||
                    bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte())) iconBytes = bytes
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { Log.w("RokuRemote", "Channel artwork unavailable", e) }
        }
        return playback.copy(artwork = iconBytes)
    }

    suspend fun apps(): List<AppInfo> = parseApps(request("query/apps"))

    suspend fun launch(appId: String) {
        request("launch/${URLEncoder.encode(appId, "UTF-8")}", "POST")
    }

    suspend fun verify(): AppleTvDevice = parseDevice(request("query/device-info"), device.address)

    private suspend fun request(path: String, method: String = "GET"): String = requestBytes(path, method).toString(Charsets.UTF_8)

    private suspend fun requestBytes(path: String, method: String = "GET"): ByteArray = withContext(Dispatchers.IO) {
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
            connection.inputStream.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (output.size() + count > 512 * 1024) throw IOException("Roku response too large")
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        private fun channelId(value: String?): String? = value?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{1,80}")) }
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

        /** Channels and TV inputs; `bundleId` carries the ECP app id used by `launch/{id}` and `query/icon/{id}`. */
        fun parseApps(text: String): List<AppInfo> {
            val nodes = xml(text).getElementsByTagName("app")
            return (0 until nodes.length).mapNotNull { index ->
                val app = nodes.item(index) as? Element ?: return@mapNotNull null
                val id = app.getAttribute("id").trim().takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                AppInfo(name = app.textContent.trim().ifEmpty { id }, bundleId = id)
            }
        }

        fun parsePlayback(text: String): NowPlaying {
            val document = xml(text)
            val root = if (document.tagName == "player") document else
                document.getElementsByTagName("player").item(0) as? Element ?: document
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
            val duration = seconds("duration")?.takeIf { it > 0 }
                ?: if (root.text("is_live")?.equals("true", ignoreCase = true) == true) null
                else seconds("runtime")?.takeIf { it > 0 }
            return NowPlaying(
                title = root.text("title"), artist = root.text("artist"),
                appName = plugin?.getAttribute("name")?.takeIf { it.isNotBlank() },
                playbackState = state, duration = duration, elapsedTime = seconds("position"),
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
