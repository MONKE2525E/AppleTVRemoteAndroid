package com.privateremote.appletv.appletv

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import dev.atvremote.protocol.companion.AppInfo
import dev.atvremote.protocol.companion.MediaCapabilities
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.NowPlaying

/** Kotlin domain types -> RN bridge payloads. Mirrors src/appletv/types.ts. */

fun AppleTvDevice.toWritableMap(): WritableMap = Arguments.createMap().apply {
    putString("id", credentialKey)
    putString("name", name)
    putString("address", address)
    putInt("port", port)
    putString("model", model)
    putString("identifier", identifier)
}

fun List<AppleTvDevice>.devicesToWritableArray(): WritableArray = Arguments.createArray().apply {
    this@devicesToWritableArray.forEach { pushMap(it.toWritableMap()) }
}

fun ConnectionState.toWritableMap(): WritableMap = Arguments.createMap().apply {
    when (this@toWritableMap) {
        is ConnectionState.Disconnected -> putString("state", "disconnected")
        is ConnectionState.Connecting -> {
            putString("state", "connecting")
            putMap("device", device.toWritableMap())
        }
        is ConnectionState.Connected -> {
            putString("state", "connected")
            putMap("device", device.toWritableMap())
            putBoolean("airplayPaired", airplayPaired)
        }
        is ConnectionState.Failed -> {
            putString("state", "failed")
            device?.let { putMap("device", it.toWritableMap()) }
            putString("reason", reason)
            putBoolean("stalePairing", stalePairing)
            putBoolean("canWake", canWake)
        }
    }
}

fun NowPlaying.toWritableMap(): WritableMap = Arguments.createMap().apply {
    putString("title", title)
    putString("artist", artist)
    putString("album", album)
    putString("appName", appName)
    putString("playbackState", playbackState.name.lowercase())
    duration?.let { putDouble("duration", it) } ?: putNull("duration")
    elapsedTime?.let { putDouble("elapsedTime", it) } ?: putNull("elapsedTime")
}

/**
 * Base64-encoded and sent as its own event rather than inline on every
 * `playbackChanged` payload -- artwork bytes are far larger than the rest of
 * the now-playing state and change far less often. A file:// URI handoff
 * would avoid the bridge copy entirely; worth revisiting if artwork churn
 * turns out to matter for bridge throughput in practice.
 */
fun ByteArray.toArtworkBase64(): String = Base64.encodeToString(this, Base64.NO_WRAP)

fun MediaCapabilities.toWritableMap(): WritableMap = Arguments.createMap().apply {
    putBoolean("play", play)
    putBoolean("pause", pause)
    putBoolean("nextTrack", nextTrack)
    putBoolean("previousTrack", previousTrack)
    putBoolean("volume", volume)
    putBoolean("skipForward", skipForward)
    putBoolean("skipBackward", skipBackward)
}

fun AppInfo.toWritableMap(): WritableMap = Arguments.createMap().apply {
    putString("name", name)
    putString("bundleId", bundleId)
}

fun List<AppInfo>.appsToWritableArray(): WritableArray = Arguments.createArray().apply {
    this@appsToWritableArray.forEach { pushMap(it.toWritableMap()) }
}

fun Map<String, Any?>.toWritableMap(): WritableMap = Arguments.createMap().apply {
    for ((key, value) in this@toWritableMap) {
        when (value) {
            null -> putNull(key)
            is Boolean -> putBoolean(key, value)
            is Int -> putInt(key, value)
            is Long -> putDouble(key, value.toDouble())
            is Double -> putDouble(key, value)
            is String -> putString(key, value)
            else -> putString(key, value.toString())
        }
    }
}
