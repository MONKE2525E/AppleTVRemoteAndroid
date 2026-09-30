package com.privateremote.appletv.appletv

import android.content.Context
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.hap.Credentials

/**
 * Persists pairing credentials and the last-selected device identity in
 * app-private SharedPreferences (`android:allowBackup="false"` at the
 * manifest level already excludes this file from Android auto-backup).
 * Values are opaque [AppleTvSecureStore] blobs — never plaintext.
 *
 * The last-device record is what lets [AppleTVService] restore a reconnect
 * intent after process death, independent of whether React Native is alive.
 */
class CredentialStore(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences("appletv_secure", Context.MODE_PRIVATE)

    // ------------------------------------------------------- Companion Link

    fun saveCompanion(deviceKey: String, credentials: Credentials) {
        prefs.edit()
            .putString(companionKey(deviceKey), AppleTvSecureStore.encrypt(credentials.serialize()))
            .apply()
    }

    fun loadCompanion(deviceKey: String): Credentials? =
        prefs.getString(companionKey(deviceKey), null)
            ?.let(AppleTvSecureStore::decrypt)
            ?.let { runCatching { Credentials.parse(it) }.getOrNull() }

    fun forgetCompanion(deviceKey: String) {
        prefs.edit().remove(companionKey(deviceKey)).apply()
    }

    // ------------------------------------------------- AirPlay (MRP tunnel)

    fun saveAirPlay(deviceKey: String, credentials: Credentials) {
        prefs.edit()
            .putString(airplayKey(deviceKey), AppleTvSecureStore.encrypt(credentials.serialize()))
            .apply()
    }

    fun loadAirPlay(deviceKey: String): Credentials? =
        prefs.getString(airplayKey(deviceKey), null)
            ?.let(AppleTvSecureStore::decrypt)
            ?.let { runCatching { Credentials.parse(it) }.getOrNull() }

    fun isAirPlayPaired(deviceKey: String): Boolean = prefs.contains(airplayKey(deviceKey))

    fun forgetAirPlay(deviceKey: String) {
        prefs.edit().remove(airplayKey(deviceKey)).apply()
    }

    fun forgetDevice(deviceKey: String) {
        forgetCompanion(deviceKey)
        forgetAirPlay(deviceKey)
    }

    // ------------------------------------------------- last-device identity

    /** Called on every successful connect; read back by the service after process death. */
    fun saveLastDevice(device: AppleTvDevice) {
        prefs.edit()
            .putString(LAST_ID, device.credentialKey)
            .putString(LAST_NAME, device.name)
            .putString(LAST_ADDRESS, device.address)
            .putInt(LAST_PORT, device.port)
            .putString(LAST_MODEL, device.model)
            .putString(LAST_IDENTIFIER, device.identifier)
            .apply()
    }

    fun loadLastDevice(): AppleTvDevice? {
        val address = prefs.getString(LAST_ADDRESS, null) ?: return null
        val name = prefs.getString(LAST_NAME, null) ?: return null
        val port = prefs.getInt(LAST_PORT, -1)
        if (port < 0) return null
        return AppleTvDevice(
            name = name,
            address = address,
            port = port,
            model = prefs.getString(LAST_MODEL, null),
            identifier = prefs.getString(LAST_IDENTIFIER, null),
        )
    }

    fun clearLastDevice() {
        prefs.edit()
            .remove(LAST_ID).remove(LAST_NAME).remove(LAST_ADDRESS)
            .remove(LAST_PORT).remove(LAST_MODEL).remove(LAST_IDENTIFIER)
            .apply()
    }

    private fun companionKey(deviceKey: String) = "companion:$deviceKey"
    private fun airplayKey(deviceKey: String) = "airplay:$deviceKey"

    private companion object {
        const val LAST_ID = "last_device_id"
        const val LAST_NAME = "last_device_name"
        const val LAST_ADDRESS = "last_device_address"
        const val LAST_PORT = "last_device_port"
        const val LAST_MODEL = "last_device_model"
        const val LAST_IDENTIFIER = "last_device_identifier"
    }
}
