package com.privateremote.appletv.appletv

import android.content.Context
import android.net.wifi.WifiManager
import dev.atvremote.protocol.discovery.AppleTvDevice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import javax.xml.parsers.DocumentBuilderFactory

/** DIAL devices do not necessarily advertise their remote service via mDNS. */
class FireTvDiscovery(context: Context) {
    private val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

    suspend fun scan(timeoutMs: Long, onResolved: (AppleTvDevice) -> Unit) = withContext(Dispatchers.IO) {
        val lock = wifi.createMulticastLock("fire-tv-dial").apply { acquire() }
        try {
            DatagramSocket().use { socket ->
                socket.soTimeout = 300
                val query = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n" +
                    "MAN: \"ssdp:discover\"\r\nMX: 2\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n\r\n").toByteArray()
                socket.send(DatagramPacket(query, query.size, InetAddress.getByName("239.255.255.250"), 1900))
                val until = System.currentTimeMillis() + timeoutMs
                val seen = mutableSetOf<String>()
                while (currentCoroutineContext().isActive && System.currentTimeMillis() < until) {
                    val packet = DatagramPacket(ByteArray(8192), 8192)
                    try { socket.receive(packet) } catch (_: SocketTimeoutException) { continue }
                    val lines = String(packet.data, 0, packet.length, Charsets.UTF_8).lineSequence().map { it.trim() }.toList()
                    if (lines.none { it.equals("ST: urn:dial-multiscreen-org:service:dial:1", ignoreCase = true) }) continue
                    val location = lines.firstOrNull { it.startsWith("location:", true) }
                        ?.substringAfter(':')?.trim() ?: continue
                    val url = safeLocation(location, packet.address) ?: continue
                    if (!seen.add(location)) continue
                    try { readFireTvDevice(url)?.let(onResolved) } catch (_: Exception) { }
                }
            }
        } finally { if (lock.isHeld) lock.release() }
    }


}

internal fun safeLocation(location: String, sender: InetAddress): URL? = try {
    val url = URL(location)
    val host = url.host
    if (url.protocol != "http" || url.userInfo != null || !host.matches(Regex("[0-9.]+")) ||
        InetAddress.getByName(host) != sender || (!sender.isSiteLocalAddress && !sender.isLinkLocalAddress) || sender.isMulticastAddress) null else url
} catch (_: Exception) { null }

internal fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
    val output = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(4096)
    while (true) {
        val count = read(buffer)
        if (count < 0) break
        if (output.size() + count > limit) throw java.io.IOException("Response too large")
        output.write(buffer, 0, count)
    }
    return output.toByteArray()
}

internal fun readFireTvDevice(description: URL, dialPort: Int = 8009): AppleTvDevice? {
    fun read(url: URL): ByteArray? {
        val conn = url.openConnection() as HttpURLConnection
        return try {
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 1000
            conn.readTimeout = 1000
            if (conn.responseCode != 200) null else conn.inputStream.use { it.readBytesLimited(65536) }
        } finally { conn.disconnect() }
    }
    val device = read(description)?.let { parseFireTvDescription(it, description.host) } ?: return null
    val service = read(URL("http", description.host, dialPort, "/apps/FireTVRemote")) ?: return null
    return if (isFireTvRemoteService(service)) device else null
}

private fun safeXml(bytes: ByteArray): org.w3c.dom.Document? = try {
    // Parse the checked UTF-8 text rather than the original bytes, so an XML
    // encoding declaration cannot hide a document type from this check.
    val text = bytes.toString(Charsets.UTF_8)
    if (text.contains("<!DOCTYPE", ignoreCase = true)) null else {
        val builder = DocumentBuilderFactory.newInstance().newDocumentBuilder()
        builder.setEntityResolver { _, _ -> throw org.xml.sax.SAXException("External entities are not allowed") }
        builder.parse(org.xml.sax.InputSource(java.io.StringReader(text)))
    }
} catch (_: Exception) { null }

internal fun isFireTvRemoteService(bytes: ByteArray): Boolean {
    val doc = safeXml(bytes) ?: return false
    return doc.documentElement?.tagName == "service" &&
        doc.getElementsByTagName("name").item(0)?.textContent?.trim() == "FireTVRemote"
}

internal fun parseFireTvDescription(bytes: ByteArray, host: String): AppleTvDevice? {
    val doc = safeXml(bytes) ?: return null
    fun field(name: String) = doc.getElementsByTagName(name).item(0)?.textContent?.trim().orEmpty()
    val id = field("UDN").takeIf { it.isNotBlank() } ?: return null
    return AppleTvDevice(name = field("friendlyName").ifBlank { "Fire TV" }, address = host,
        port = 8080, model = "Fire TV", identifier = "firetv:dial:$id")
}
