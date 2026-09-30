package com.privateremote.appletv.updates

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.privateremote.appletv.specs.NativeAppUpdatesSpec
import kotlinx.coroutines.*

class AppUpdatesModule(context: ReactApplicationContext) : NativeAppUpdatesSpec(context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val updater = GitHubUpdater(context)
    override fun getName() = NAME
    override fun invalidate() { scope.cancel(); super.invalidate() }

    override fun checkForUpdate(promise: Promise) {
        scope.launch {
            try {
                val latest = updater.latest()
                promise.resolve(Arguments.createMap().apply {
                    putString("installedVersion", updater.installedName)
                    putBoolean("available", latest != null && latest.versionCode > updater.installedCode)
                    latest?.let { putString("versionName", it.versionName); putDouble("versionCode", it.versionCode.toDouble()); putDouble("size", it.size.toDouble()) }
                })
            } catch (e: Exception) { promise.reject("UPDATE_CHECK_FAILED", e.message, e) }
        }
    }

    override fun installUpdate(versionCode: Double, promise: Promise) {
        scope.launch {
            try {
                val context = reactApplicationContext
                if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) {
                    withContext(Dispatchers.Main) {
                        context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                    error("Allow updates from TV Remote in Android settings, then return and tap Install update again.")
                }
                val release = updater.latest() ?: error("No release is available yet")
                require(release.versionCode.toDouble() == versionCode) { "The release changed. Check for updates again." }
                val apk = updater.download(release)
                withContext(Dispatchers.Main) {
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)
                    context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
                }
                promise.resolve(null)
            } catch (e: Exception) { promise.reject("UPDATE_INSTALL_FAILED", e.message, e) }
        }
    }

    override fun openReleases() {
        reactApplicationContext.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/${updater.repository}/releases")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
