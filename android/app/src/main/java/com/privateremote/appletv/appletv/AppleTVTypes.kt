package com.privateremote.appletv.appletv

import dev.atvremote.protocol.companion.AppInfo
import dev.atvremote.protocol.companion.MediaCapabilities
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.NowPlaying

/** Mirrors the `connectionChanged` event contract documented in src/appletv. */
sealed class ConnectionState {
    data object Disconnected : ConnectionState()
    data class Connecting(val device: AppleTvDevice) : ConnectionState()
    data class Connected(val device: AppleTvDevice, val airplayPaired: Boolean) : ConnectionState()
    data class Failed(
        val device: AppleTvDevice?,
        val reason: String,
        val stalePairing: Boolean,
        val canWake: Boolean,
    ) : ConnectionState()
}

/**
 * Everything [AppleTVService] needs to forward to JS. Default (empty) bodies
 * so a listener only implements what it cares about.
 */
interface AppleTVListener {
    fun onDevicesChanged(devices: List<AppleTvDevice>) {}
    fun onConnectionChanged(state: ConnectionState) {}
    fun onPlaybackChanged(playback: NowPlaying?) {}
    fun onCapabilitiesChanged(capabilities: MediaCapabilities) {}
    fun onTextInputRequested(current: String?, focused: Boolean) {}
    fun onAppsChanged(apps: List<AppInfo>) {}
}
