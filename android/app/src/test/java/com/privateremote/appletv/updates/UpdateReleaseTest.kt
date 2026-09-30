package com.privateremote.appletv.updates

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class UpdateReleaseTest {
    private val repo = "MONKE2525E/AppleTVRemoteAndroid"
    private val valid = UpdateRelease(2, "1.1.0", "https://github.com/$repo/releases/download/v1.1.0/TVRemote.apk", "a".repeat(64), 80_000_000)
    @Test fun `accepts release APK from configured repository`() { assertEquals(valid, valid.validate(repo)) }
    @Test fun `rejects foreign hosts repositories and path traversal`() {
        listOf("https://example.com/$repo/releases/download/v1.1.0/TVRemote.apk", valid.apkUrl.replace(repo, "other/project"), valid.apkUrl.replace("v1.1.0", "../other"), valid.apkUrl + "?redirect=true", valid.apkUrl.replace("v1.1.0", "%2e%2e")).forEach { url ->
            assertThrows(IllegalArgumentException::class.java) { valid.copy(apkUrl = url).validate(repo) }
        }
    }
    @Test fun `rejects invalid metadata before download`() {
        listOf(valid.copy(sha256 = "bad"), valid.copy(size = 0), valid.copy(size = 250_000_001), valid.copy(versionCode = 0), valid.copy(versionName = "latest")).forEach { release ->
            assertThrows(IllegalArgumentException::class.java) { release.validate(repo) }
        }
    }
}
