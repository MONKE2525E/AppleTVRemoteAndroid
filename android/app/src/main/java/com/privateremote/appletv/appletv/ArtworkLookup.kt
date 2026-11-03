package com.privateremote.appletv.appletv

import android.content.Context
import android.graphics.BitmapFactory
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.security.MessageDigest
import java.util.Locale

/** Best-effort music covers. Exact title and artist matches avoid inventing video posters. */
internal class ArtworkLookup(context: Context) {
    private val directory = context.cacheDir.resolve("artwork-lookup").apply { mkdirs() }
    private val memory = object : LinkedHashMap<String, ByteArray>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ByteArray>?) = size > 20
    }

    fun find(title: String, artist: String, app: String): ByteArray? {
        if (title.isBlank() || artist.isBlank()) return null
        val key = listOf(title, artist, app).joinToString("\u0000")
        synchronized(memory) { memory[key]?.let { return it } }
        val name = MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }
        val file = directory.resolve(name)
        val cached = runCatching { if (file.length() in 1..MAX_BYTES.toLong()) file.readBytes() else null }.getOrNull()
        if (cached != null) { synchronized(memory) { memory[key] = cached }; return cached }
        return runCatching {
            val term = URLEncoder.encode("$title $artist", "UTF-8")
            val json = JSONObject(String(fetch("https://itunes.apple.com/search?media=music&entity=song&limit=20&term=$term", 256 * 1024) ?: return null))
            val results = json.optJSONArray("results") ?: return null
            val match = (0 until results.length()).mapNotNull { results.optJSONObject(it) }.firstOrNull {
                normalize(it.optString("trackName")) == normalize(title) &&
                    normalize(it.optString("artistName")) == normalize(artist)
            } ?: return null
            val url = match.optString("artworkUrl100").replace("100x100bb", "1024x1024bb")
            val uri = URI(url)
            if (uri.scheme != "https" || !uri.host.orEmpty().endsWith(".mzstatic.com")) return null
            val bytes = fetch(url, MAX_BYTES) ?: return null
            // Bounds decoding returns null by design; validate dimensions separately.
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 4096 || bounds.outHeight > 4096) return null
            directory.listFiles()?.sortedByDescending { it.lastModified() }?.drop(49)?.forEach { it.delete() }
            file.writeBytes(bytes)
            synchronized(memory) { memory[key] = bytes }
            bytes
        }.getOrNull()
    }

    private fun fetch(url: String, limit: Int): ByteArray? {
        val connection = URI(url).toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 2500
            connection.readTimeout = 2500
            connection.instanceFollowRedirects = false
            if (connection.responseCode != 200 || connection.contentLength > limit) return null
            return connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (output.size() + count > limit) return null
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
        } finally { connection.disconnect() }
    }

    private fun normalize(value: String) = value.trim().lowercase(Locale.ROOT).replace(Regex("\\s+"), " ")
    private companion object { const val MAX_BYTES = 1024 * 1024 }
}
