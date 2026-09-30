package com.privateremote.appletv.updates

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.privateremote.appletv.BuildConfig
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class GitHubUpdater(private val context: Context) {
    val repository = BuildConfig.UPDATE_REPOSITORY
    private val packageManager get() = context.packageManager
    @Suppress("DEPRECATION")
    private val installed get() = packageManager.getPackageInfo(context.packageName, 0)
    @Suppress("DEPRECATION")
    val installedCode: Long get() = if (Build.VERSION.SDK_INT >= 28) installed.longVersionCode else installed.versionCode.toLong()
    val installedName: String get() = installed.versionName ?: "Unknown"

    private fun connection(address: String): HttpURLConnection {
        var url = URL(address)
        repeat(6) {
            require(url.protocol == "https" && url.host in setOf("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com") && url.port == -1 && url.userInfo == null) { "Invalid update download host" }
            val connection = (url.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15_000
                readTimeout = 30_000
                setRequestProperty("User-Agent", "TVRemote/${BuildConfig.VERSION_NAME}")
            }
            if (connection.responseCode in listOf(301, 302, 303, 307, 308)) {
                val redirect = connection.getHeaderField("Location")
                connection.disconnect()
                require(redirect != null) { "Missing update redirect" }
                url = URL(url, redirect)
            } else return connection
        }
        error("Too many update redirects")
    }

    fun latest(): UpdateRelease? {
        val connection = connection("https://github.com/$repository/releases/latest/download/update.json")
        try {
            if (connection.responseCode == 404) return null
            check(connection.responseCode == 200) { "GitHub update check failed (${connection.responseCode})" }
            val bytes = connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(4096)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    require(output.size() + read <= 65_536) { "Update manifest is too large" }
                    output.write(buffer, 0, read)
                }
                output.toByteArray()
            }
            require(bytes.size <= 65_536) { "Update manifest is too large" }
            val json = JSONObject(String(bytes, Charsets.UTF_8))
            return UpdateRelease(json.getLong("versionCode"), json.getString("versionName"), json.getString("apkUrl"), json.getString("sha256"), json.getLong("size")).validate(repository)
        } finally { connection.disconnect() }
    }

    fun download(release: UpdateRelease): File {
        release.validate(repository)
        require(release.versionCode > installedCode) { "This update is already installed" }
        val directory = File(context.filesDir, "updates").apply { mkdirs() }
        val partial = File(directory, "update.part")
        val apk = File(directory, "update.apk")
        val connection = connection(release.apkUrl)
        try {
            check(connection.responseCode == 200) { "APK download failed (${connection.responseCode})" }
            val digest = MessageDigest.getInstance("SHA-256")
            var count = 0L
            connection.inputStream.use { input ->
                partial.outputStream().use { output ->
                    val buffer = ByteArray(65_536)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        count += read
                        require(count <= release.size) { "APK size does not match the release" }
                        digest.update(buffer, 0, read)
                        output.write(buffer, 0, read)
                    }
                }
            }
            require(count == release.size) { "APK download is incomplete" }
            require(digest.digest().joinToString("") { "%02x".format(it) }.equals(release.sha256, ignoreCase = true)) { "APK checksum does not match the release" }
            verifyPackage(partial, release)
            if (apk.exists()) check(apk.delete())
            check(partial.renameTo(apk)) { "Could not save the update" }
            return apk
        } finally {
            connection.disconnect()
            partial.delete()
        }
    }

    @Suppress("DEPRECATION")
    private fun verifyPackage(file: File, release: UpdateRelease) {
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val archive = packageManager.getPackageArchiveInfo(file.absolutePath, flags) ?: error("Invalid Android package")
        val current = packageManager.getPackageInfo(context.packageName, flags)
        val code = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode else archive.versionCode.toLong()
        require(archive.packageName == context.packageName && code == release.versionCode) { "APK identity or version does not match" }
        fun certificates(info: android.content.pm.PackageInfo): Set<String> {
            val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
            return signatures.orEmpty().map { it.toCharsString() }.toSet()
        }
        val trusted = certificates(current)
        require(trusted.isNotEmpty() && trusted == certificates(archive)) { "APK signing certificate does not match this app" }
    }
}
