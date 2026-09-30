package com.privateremote.appletv.updates

import java.net.URI

/** Release manifests use the Android versionCode to avoid ambiguous version-name ordering. */
data class UpdateRelease(
    val versionCode: Long,
    val versionName: String,
    val apkUrl: String,
    val sha256: String,
    val size: Long,
) {
    fun validate(repository: String): UpdateRelease {
        require(versionCode > 0 && versionName.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))) { "Invalid update version" }
        require(sha256.matches(Regex("[a-fA-F0-9]{64}"))) { "Invalid update checksum" }
        require(size in 1..250_000_000) { "Invalid APK size" }
        val url = URI(apkUrl)
        require(url.scheme == "https" && url.host == "github.com" && url.port == -1 && url.userInfo == null && url.query == null && url.fragment == null &&
            url.rawPath.startsWith("/$repository/releases/download/") && url.rawPath.endsWith("/TVRemote.apk")) { "Update is outside the configured GitHub releases" }
        require(!url.rawPath.contains("..") && !url.rawPath.contains("%")) { "Invalid update path" }
        return this
    }
}
