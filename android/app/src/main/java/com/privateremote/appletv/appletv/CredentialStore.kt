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

    fun loadFireTvAlias(id: String): String? {
        prefs.getString("firetv-alias:$id", null)?.let { return it }
        val certificate = id.removePrefix("firetv:cert:").takeIf { it != id } ?: return null
        val existing = prefs.all.keys.asSequence().filter { it.startsWith("firetv:firetv:") }
            .map { it.removePrefix("firetv:") }.firstOrNull { loadFireTv(it)?.second == certificate }
        if (existing != null) saveFireTvAlias(id, existing)
        return existing
    }

    fun saveFireTvAlias(id: String, canonical: String) {
        prefs.edit().putString("firetv-alias:$id", canonical).apply()
    }

    fun saveFireTv(deviceKey: String, token: String, certificate: String) {
        saveFireTvAlias("firetv:cert:$certificate", deviceKey)
        prefs.edit().putString("firetv:$deviceKey", AppleTvSecureStore.encrypt(org.json.JSONObject().put("token", token).put("certificate", certificate).toString())).apply()
    }

    fun loadFireTv(deviceKey: String): Pair<String, String>? =
        prefs.getString("firetv:$deviceKey", null)?.let(AppleTvSecureStore::decrypt)?.let {
            runCatching { org.json.JSONObject(it).let { json -> Pair(json.getString("token"), json.getString("certificate")) } }.getOrNull()
        }

    fun forgetDevice(deviceKey: String) {
        prefs.edit().remove("firetv:$deviceKey").apply()
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
            .putString(LAST_KIND, device.kind.wireValue)
            .putString(LAST_OUTPUT_UID, device.outputUid)
            .putInt(LAST_AIRPLAY_PORT, device.airplayPort)
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
            kind = dev.atvremote.protocol.discovery.DeviceKind.entries.firstOrNull { it.wireValue == prefs.getString(LAST_KIND, null) }
                ?: dev.atvremote.protocol.discovery.classifyDevice(prefs.getString(LAST_MODEL, null), prefs.getString(LAST_IDENTIFIER, null)),
            outputUid = prefs.getString(LAST_OUTPUT_UID, null),
            airplayPort = prefs.getInt(LAST_AIRPLAY_PORT, 7000),
        )
    }

    fun clearLastDevice() {
        prefs.edit()
            .remove(LAST_ID).remove(LAST_NAME).remove(LAST_ADDRESS)
            .remove(LAST_PORT).remove(LAST_MODEL).remove(LAST_IDENTIFIER)
            .remove(LAST_KIND).remove(LAST_OUTPUT_UID).remove(LAST_AIRPLAY_PORT)
            .apply()
    }

    private fun companionKey(deviceKey: String) = "companion:$deviceKey"
    private fun airplayKey(deviceKey: String) = "airplay:$deviceKey"

    private companion object {
        const val LAST_KIND = "last_device_kind"
        const val LAST_OUTPUT_UID = "last_output_uid"
        const val LAST_AIRPLAY_PORT = "last_airplay_port"
        const val LAST_ID = "last_device_id"
        const val LAST_NAME = "last_device_name"
        const val LAST_ADDRESS = "last_device_address"
        const val LAST_PORT = "last_device_port"
        const val LAST_MODEL = "last_device_model"
        const val LAST_IDENTIFIER = "last_device_identifier"
    }
}
