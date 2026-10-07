package com.privateremote.appletv.settings

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.telephony.TelephonyManager
import java.util.Locale
import com.facebook.react.bridge.Arguments
import com.privateremote.appletv.BuildConfig
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.privateremote.appletv.specs.NativeAppSettingsSpec

class AppSettingsModule(context: ReactApplicationContext) : NativeAppSettingsSpec(context) {
    private val prefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
    override fun getName() = NAME

    override fun getAppInfo(promise: Promise) {
        promise.resolve(Arguments.createMap().apply {
            putString("version", BuildConfig.VERSION_NAME)
            putString("build", BuildConfig.VERSION_CODE.toString())
            putString("namespace", BuildConfig.APPLICATION_ID)
        })
    }

    /** Where the phone actually is: a Canadian SIM on an en-US phone should still mean the Canadian App Store. */
    override fun getCountryCodes(promise: Promise) {
        val telephony = reactApplicationContext.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        val codes = listOfNotNull(
            runCatching { telephony?.networkCountryIso }.getOrNull(),
            runCatching { telephony?.simCountryIso }.getOrNull(),
            Locale.getDefault().country,
        ).map { it.trim().lowercase(Locale.ROOT) }.filter { it.length == 2 }.distinct()
        promise.resolve(Arguments.createArray().apply { codes.forEach { pushString(it) } })
    }

    override fun canInstallPackages(promise: Promise) {
        promise.resolve(Build.VERSION.SDK_INT < 26 || reactApplicationContext.packageManager.canRequestPackageInstalls())
    }

    override fun openInstallSettings() {
        val context = reactApplicationContext
        if (Build.VERSION.SDK_INT >= 26) {
            launch(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
        } else openAppSettings()
    }

    override fun openAppSettings() {
        launch(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${reactApplicationContext.packageName}")))
    }

    override fun getPreference(key: String, promise: Promise) {
        promise.resolve(prefs.getString(key, null))
    }

    override fun setPreference(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    private fun launch(intent: Intent) {
        reactApplicationContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
