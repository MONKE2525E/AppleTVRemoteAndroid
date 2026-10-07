package com.privateremote.appletv.appletv

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.privateremote.appletv.specs.NativeAppleTVSpec
import dev.atvremote.protocol.companion.AppInfo
import dev.atvremote.protocol.companion.MediaCapabilities
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.NowPlaying
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Pure command/event facade. Binds to the already-persistent
 * [AppleTVService] and forwards everything -- it holds no protocol/session
 * state of its own, so React Native reloading, backgrounding, or crashing
 * never invalidates a live Apple TV connection (see the layering note in the
 * project plan: RN UI -> this facade -> AppleTVService -> AppleTVController
 * -> vendored protocol module).
 */
class AppleTVModule(reactContext: ReactApplicationContext) :
    NativeAppleTVSpec(reactContext), AppleTVListener {

    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var binder: AppleTVService.LocalBinder? = null
    private var lastArtworkSignature: Int? = null
    @Volatile private var pendingStartDiscovery = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val local = service as AppleTVService.LocalBinder
            binder = local
            local.addListener(this@AppleTVModule)
            val c = local.getController()
            onConnectionChanged(c.snapshotConnection())
            onPlaybackChanged(c.snapshotPlayback())
            c.snapshotCapabilities()?.let { onCapabilitiesChanged(it) }
            if (pendingStartDiscovery) {
                pendingStartDiscovery = false
                local.getController().startDiscovery()
            }
        }
        override fun onServiceDisconnected(name: ComponentName?) {
            binder = null
        }
    }

    init {
        val intent = Intent(reactContext, AppleTVService::class.java)
        reactContext.applicationContext.bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    private fun controller() = binder?.getController()

    override fun invalidate() {
        binder?.removeListener(this)
        runCatching { reactApplicationContext.applicationContext.unbindService(connection) }
        moduleScope.cancel()
        super.invalidate()
    }

    // ------------------------------------------------------------ discovery

    override fun startDiscovery() {
        val c = controller()
        if (c == null) {
            pendingStartDiscovery = true
            return
        }
        pendingStartDiscovery = false
        c.startDiscovery()
    }
    override fun stopDiscovery() {
        pendingStartDiscovery = false
        controller()?.stopDiscovery()
    }

    // -------------------------------------------------------------- pairing

    override fun startPairing(deviceId: String, promise: Promise) = launchPromise(promise) {
        requireController().startPairing(deviceId)
    }
    override fun submitPin(deviceId: String, pin: String, promise: Promise) = launchPromise(promise) {
        requireController().submitPin(deviceId, pin)
    }
    override fun cancelPairing(deviceId: String) { controller()?.cancelPairing(deviceId) }

    override fun startAirPlayPairing(deviceId: String, promise: Promise) = launchPromise(promise) {
        requireController().startAirPlayPairing(deviceId)
    }
    override fun submitAirPlayPin(deviceId: String, pin: String, promise: Promise) = launchPromise(promise) {
        requireController().submitAirPlayPin(deviceId, pin)
    }

    // ----------------------------------------------------------- connection

    override fun connect(deviceId: String, promise: Promise) = launchPromise(promise) {
        requireController().connect(deviceId)
    }
    override fun disconnect(promise: Promise) = launchPromise(promise) {
        requireController().disconnect()
    }
    override fun forgetDevice(deviceId: String, promise: Promise) = launchPromise(promise) {
        requireController().forgetDevice(deviceId)
    }

    // ------------------------------------------------------- power / volume

    override fun sleep(promise: Promise) = launchPromise(promise) { requireController().sleep() }
    override fun wake(deviceId: String, promise: Promise) = launchPromise(promise) {
        requireController().wake(deviceId)
    }
    override fun setMuted(muted: Boolean, promise: Promise) = launchPromise(promise) {
        requireController().setMuted(muted)
    }
    override fun setVolume(level: Double, promise: Promise) = launchPromise(promise) {
        requireController().setVolume(level)
    }

    // ------------------------------------------------------------ transport

    override fun pressButton(name: String, promise: Promise) = launchPromise(promise) {
        requireController().pressButton(name)
    }
    override fun holdButton(name: String, promise: Promise) = launchPromise(promise) {
        requireController().holdButton(name)
    }
    override fun playPause(promise: Promise) = launchPromise(promise) { requireController().playPause() }
    override fun skipBy(seconds: Double, promise: Promise) = launchPromise(promise) {
        requireController().skipBy(seconds)
    }
    override fun seekTo(seconds: Double, promise: Promise) = launchPromise(promise) {
        requireController().seekTo(seconds)
    }

    // -------------------------------------------------------- touch surface

    override fun touchStart(x: Double, y: Double) { controller()?.touchStart(x, y) }
    override fun touchMove(x: Double, y: Double) { controller()?.touchMove(x, y) }
    override fun touchEnd(x: Double, y: Double) { controller()?.touchEnd(x, y) }

    // ----------------------------------------------------------- text/apps

    override fun sendText(text: String, clearPrevious: Boolean, promise: Promise) = launchPromise(promise) {
        requireController().sendText(text, clearPrevious)
    }
    override fun loadApps(promise: Promise) = launchPromise(promise) { requireController().loadApps() }
    override fun launchApp(bundleId: String, promise: Promise) = launchPromise(promise) {
        requireController().launchApp(bundleId)
    }

    // ---------------------------------------------------------- diagnostics

    override fun getDiagnosticsSnapshot(promise: Promise) {
        val merged = (controller()?.diagnosticsSnapshot() ?: emptyMap()) + (binder?.mediaDiagnostics() ?: emptyMap())
        promise.resolve(merged.toWritableMap())
    }

    // ---------------------------------------------------- NativeEventEmitter

    override fun addListener(eventName: String) { /* required by NativeEventEmitter; events are always-on here */ }
    override fun removeListeners(count: Double) { /* see addListener */ }

    // -------------------------------------------------------------- helpers

    private fun requireController(): AppleTVController =
        controller() ?: throw IllegalStateException("AppleTVService not bound yet")

    private fun <T> launchPromise(promise: Promise, block: suspend () -> T) {
        moduleScope.launch {
            try {
                when (val result = block()) {
                    is Boolean -> promise.resolve(result)
                    else -> promise.resolve(null)
                }
            } catch (e: Exception) {
                promise.reject(e.javaClass.simpleName, e.message, e)
            }
        }
    }

    private fun emit(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // ------------------------------------------------------- AppleTVListener

    override fun onCommandError(operation: String, code: String) {
        emit("commandError", Arguments.createMap().apply {
            putString("operation", operation)
            putString("code", code)
        })
    }

    override fun onDevicesChanged(devices: List<AppleTvDevice>) {
        emit("devicesChanged", Arguments.createMap().apply { putArray("devices", devices.devicesToWritableArray()) })
    }

    override fun onConnectionChanged(state: ConnectionState) {
        emit("connectionChanged", state.toWritableMap())
    }

    override fun onPlaybackChanged(playback: NowPlaying?) {
        emit("playbackChanged", playback?.toWritableMap())

        val artwork = playback?.artwork
        val signature = artwork?.let { it.size * 31 + it.contentHashCode() }
        if (signature != lastArtworkSignature) {
            lastArtworkSignature = signature
            emit(
                "artworkChanged",
                Arguments.createMap().apply {
                    if (artwork != null) putString("base64", artwork.toArtworkBase64()) else putNull("base64")
                },
            )
        }
    }

    override fun onCapabilitiesChanged(capabilities: MediaCapabilities) {
        emit("capabilitiesChanged", capabilities.toWritableMap())
    }

    override fun onTextInputRequested(current: String?, focused: Boolean) {
        emit(
            "textInputRequested",
            Arguments.createMap().apply {
                putString("current", current)
                putBoolean("focused", focused)
            },
        )
    }

    override fun onAppsChanged(deviceId: String, apps: List<AppInfo>) {
        emit("appsChanged", Arguments.createMap().apply {
            putString("deviceId", deviceId)
            putArray("apps", apps.appsToWritableArray())
        })
    }
}
