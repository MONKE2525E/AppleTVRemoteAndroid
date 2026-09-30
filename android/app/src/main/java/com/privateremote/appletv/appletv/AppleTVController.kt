package com.privateremote.appletv.appletv

import android.content.Context
import android.util.Log
import dev.atvremote.protocol.airplay.AirPlayAuth
import dev.atvremote.protocol.airplay.AirPlayConnection
import dev.atvremote.protocol.airplay.Ap2Session
import dev.atvremote.protocol.companion.AppleTvRemote
import dev.atvremote.protocol.companion.Button
import dev.atvremote.protocol.companion.CompanionClient
import dev.atvremote.protocol.companion.ProtocolException
import dev.atvremote.protocol.companion.TouchPhase
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.hap.HapException
import dev.atvremote.protocol.companion.MediaCapabilities
import dev.atvremote.protocol.mrp.NowPlaying
import dev.atvremote.protocol.mrp.PlaybackState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToInt

/**
 * Session/controller layer between [AppleTVService] and the vendored
 * protocol module. This is the *only* class in the app that is allowed to
 * import `dev.atvremote.protocol.*` directly (see android/protocol/UPSTREAM.md
 * and the layering note in the project plan): React Native UI -> TurboModule
 * facade -> AppleTVService -> AppleTVController -> vendored protocol module.
 *
 * Owns the actual network session and survives independently of both React
 * Native's lifecycle and (via [CredentialStore]'s last-device record) the
 * hosting process's lifecycle.
 */
class AppleTVController(
    context: Context,
    private val scope: CoroutineScope,
) {
    private val appContext = context.applicationContext
    private val discovery = AndroidDeviceDiscovery(appContext)
    private val rokuDiscovery = RokuDiscovery(appContext)
    @Volatile private var roku: RokuRemote? = null
    private val store = CredentialStore(appContext)
    private val deviceName = "Android Remote"

    var listener: AppleTVListener? = null

    private val devicesById = ConcurrentHashMap<String, AppleTvDevice>()

    @Volatile private var remote: AppleTvRemote? = null
    @Volatile private var ap2: Ap2Session? = null
    @Volatile private var currentDevice: AppleTvDevice? = null
    @Volatile private var lastNowPlaying: NowPlaying? = null
    @Volatile private var lastCapabilities: MediaCapabilities? = null
    private var volumeBeforeMute: Double? = null
    private val volumeGate = Mutex()
    private val buttonGate = Mutex()
    private val connectionGate = Mutex()

    private var discoveryJob: Job? = null
    private var nowPlayingJob: Job? = null

    private var pairingClient: CompanionClient? = null
    private var pairingSession: CompanionClient.PairingSession? = null
    private var pairingDevice: AppleTvDevice? = null

    private var airplayConnection: AirPlayConnection? = null
    private var airplayPairing: AirPlayAuth.AirPlayPairing? = null
    private var airplayPairingDevice: AppleTvDevice? = null

    // ---------------------------------------------------------- diagnostics
    @Volatile private var reconnectCount = 0
    @Volatile private var touchEventsReceived = 0L
    @Volatile private var touchEventsSent = 0L
    @Volatile private var touchEventsCoalesced = 0L

    // Must be initialized before the init block below: scope.launch schedules
    // onto a real thread immediately, so if this were declared later in the
    // class body (in initialization order) drainTouch() could start running
    // -- and read this property -- before its own initializer had run.
    private val touchChannel = Channel<TouchSample>(Channel.UNLIMITED)

    init {
        scope.launch { drainTouch() }
    }

    // ----------------------------------------------------------- discovery

    fun startDiscovery() {
        discoveryJob?.cancel()
        discoveryJob = scope.launch {
            val results = ConcurrentHashMap<String, AppleTvDevice>()
            while (isActive) {
                try {
                    coroutineScope {
                        val found: (AppleTvDevice) -> Unit = { device ->
                            devicesById[device.credentialKey] = device
                            results[device.credentialKey] = device
                            listener?.onDevicesChanged(results.values.toList())
                        }
                        launch { discovery.scan(DISCOVERY_TIMEOUT_MS, found) }
                        launch {
                            try { rokuDiscovery.scan(3000, found) }
                            catch (e: CancellationException) { throw e }
                            catch (e: Exception) { Log.w(TAG, "Roku discovery failed", e) }
                        }
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "discovery failed", e)
                }
                delay(750)
            }
        }
    }

    fun stopDiscovery() {
        discoveryJob?.cancel()
        discoveryJob = null
    }

    // ------------------------------------------------- pairing (Companion)

    suspend fun startPairing(deviceId: String) {
        val device = deviceFor(deviceId) ?: throw IllegalArgumentException("Unknown device $deviceId")
        if (device.isRoku) { connect(deviceId); return }
        Log.i(TAG, "startPairing ${device.name} ${device.address}:${device.port} id=$deviceId")
        stopDiscovery()
        closePairing()
        val client = CompanionClient(device.address, device.port, scope)
        client.connect()
        Log.i(TAG, "companion TCP connected, sending pair-setup M1")
        pairingSession = client.startPairing(deviceName)
        pairingClient = client
        pairingDevice = device
        Log.i(TAG, "pair-setup M2 received — PIN should now be on the TV")
    }

    suspend fun submitPin(deviceId: String, pin: String): Boolean {
        val session = pairingSession ?: throw IllegalStateException("No pairing in progress")
        val device = pairingDevice ?: throw IllegalStateException("No pairing in progress")
        val credentials = session.complete(pin)
        store.saveCompanion(device.credentialKey, credentials)
        closePairing()
        connect(deviceId)
        return true
    }

    fun cancelPairing(deviceId: String) {
        closePairing()
        closeAirPlayPairing()
    }

    private fun closePairing() {
        runCatching { pairingClient?.close() }
        pairingClient = null
        pairingSession = null
        pairingDevice = null
    }

    // -------------------------------------------------- pairing (AirPlay)

    suspend fun startAirPlayPairing(deviceId: String) {
        val device = deviceFor(deviceId) ?: throw IllegalArgumentException("Unknown device $deviceId")
        closeAirPlayPairing()
        val connection = AirPlayConnection(device.address, AIRPLAY_PORT)
        airplayConnection = connection
        try {
            connection.connect()
            airplayPairing = AirPlayAuth.startPairing(connection, deviceName)
            airplayPairingDevice = device
        } catch (e: Exception) {
            closeAirPlayPairing()
            throw e
        }
    }

    suspend fun submitAirPlayPin(deviceId: String, pin: String): Boolean {
        val pairing = airplayPairing ?: throw IllegalStateException("No AirPlay pairing in progress")
        val device = airplayPairingDevice ?: throw IllegalStateException("No AirPlay pairing in progress")
        val credentials = pairing.complete(pin)
        store.saveAirPlay(device.credentialKey, credentials)
        closeAirPlayPairing()
        startNowPlaying(device)
        listener?.onConnectionChanged(ConnectionState.Connected(device, true))
        return true
    }

    private fun closeAirPlayPairing() {
        runCatching { airplayConnection?.close() }
        airplayConnection = null
        airplayPairing = null
        airplayPairingDevice = null
    }

    // -------------------------------------------------------- connection

    private fun deviceFor(deviceId: String): AppleTvDevice? =
        devicesById[deviceId]
            ?: currentDevice?.takeIf { it.credentialKey == deviceId }
            ?: store.loadLastDevice()?.takeIf { it.credentialKey == deviceId }
                ?.also { devicesById[deviceId] = it }

    suspend fun connect(deviceId: String) = connectionGate.withLock { connectDevice(deviceId) }

    private suspend fun connectDevice(deviceId: String) {
        val device = deviceFor(deviceId) ?: throw IllegalArgumentException("Unknown device $deviceId")
        if (currentDevice?.credentialKey != deviceId) autoReconnectJob?.cancel()
        if (device.isRoku) {
            connectRoku(device)
            return
        }
        nowPlayingJob?.cancel()
        ap2?.onDisconnect = null
        runCatching { ap2?.close() }
        ap2 = null
        roku = null
        val credentials = store.loadCompanion(device.credentialKey)
            ?: throw IllegalStateException("Not paired with ${device.name}")
        volumeBeforeMute = null
        lastCapabilities = null
        lastNowPlaying = null
        listener?.onPlaybackChanged(null)
        val previous = remote
        remote = null
        previous?.onDisconnect = null
        runCatching { previous?.close() }

        listener?.onConnectionChanged(ConnectionState.Connecting(device))
        val r = AppleTvRemote(device.address, device.port, credentials, scope, deviceName)
        try {
            r.onCapabilities = { caps ->
                lastCapabilities = caps
                listener?.onCapabilitiesChanged(caps)
            }
            r.onTextFocus = { session ->
                listener?.onTextInputRequested(session?.textBeforeCursor, session != null)
            }
            r.onDisconnect = { error ->
                if (remote === r) handleDisconnect(device, error)
            }
            r.connect()

            remote = r
            currentDevice = device
            store.saveLastDevice(device)
            reconnectCount = 0
            listener?.onConnectionChanged(ConnectionState.Connected(device, store.isAirPlayPaired(device.credentialKey)))
            startNowPlaying(device)
        } catch (e: Exception) {
            r.onDisconnect = null
            runCatching { r.close() }
            if (e is CancellationException) throw e
            remote = null
            // Pair-verify only fails when the stored credentials are no
            // longer accepted (pairing removed on the TV) -- drop them so
            // the next attempt pairs fresh instead of failing forever.
            val stale = e is HapException
            if (stale) store.forgetDevice(device.credentialKey)
            listener?.onConnectionChanged(
                ConnectionState.Failed(device, e.message ?: "connect failed", stalePairing = stale, canWake = !stale),
            )
            throw e
        }
    }

    private suspend fun connectRoku(device: AppleTvDevice) {
        listener?.onConnectionChanged(ConnectionState.Connecting(device))
        try {
            val candidate = RokuRemote(device)
            val verified = candidate.verify()
            nowPlayingJob?.cancel()
            remote?.onDisconnect = null
            ap2?.onDisconnect = null
            runCatching { remote?.close() }
            runCatching { ap2?.close() }
            remote = null
            ap2 = null
            lastNowPlaying = null
            volumeBeforeMute = null
            rokuMuted = false
            roku = candidate
            currentDevice = verified
            store.saveLastDevice(verified)
            lastCapabilities = MediaCapabilities(play = true, pause = true, volume = true)
            listener?.onCapabilitiesChanged(lastCapabilities!!)
            listener?.onPlaybackChanged(null)
            listener?.onConnectionChanged(ConnectionState.Connected(verified, true))
            nowPlayingJob = scope.launch {
                var failures = 0
                while (isActive && roku === candidate) {
                    try {
                        val np = candidate.playback()
                        if (roku !== candidate) break
                        failures = 0
                        lastNowPlaying = np
                        listener?.onPlaybackChanged(np)
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) {
                        Log.w(TAG, "Roku playback query failed", e)
                        if (++failures == 3) {
                            lastNowPlaying = null
                            listener?.onPlaybackChanged(null)
                        }
                    }
                    delay(if (failures == 0) 2000 else 5000)
                }
            }
        } catch (e: Exception) {
            listener?.onConnectionChanged(ConnectionState.Failed(device, e.message ?: "Roku connection failed", false, true))
            throw e
        }
    }

    private var autoReconnectJob: Job? = null

    private fun handleDisconnect(device: AppleTvDevice, error: Throwable?) {
        if (currentDevice?.credentialKey != device.credentialKey) return
        remote = null
        Log.w(TAG, "companion dropped (${error?.message ?: "no cause"}); retrying")
        autoReconnectJob?.cancel()
        autoReconnectJob = scope.launch {
            var attempt = 0
            while (isActive && currentDevice?.credentialKey == device.credentialKey) {
                delay((1000L * (1L shl attempt.coerceAtMost(5))).coerceAtMost(30_000))
                try {
                    if (attempt > 0 && attempt % 3 == 0) {
                        discovery.scan(3000) { found -> devicesById[found.credentialKey] = found }
                    }
                    connect(device.credentialKey)
                    return@launch
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "reconnect attempt ${attempt + 1} failed", e)
                    if (e is HapException) return@launch
                }
                attempt++
            }
        }
    }

    suspend fun disconnect() = connectionGate.withLock {
        autoReconnectJob?.cancel()
        nowPlayingJob?.cancel()
        currentDevice = null
        remote?.onDisconnect = null
        ap2?.onDisconnect = null
        runCatching { remote?.close() }
        runCatching { ap2?.close() }
        remote = null
        roku = null
        ap2 = null
        currentDevice = null
        lastNowPlaying = null
        store.clearLastDevice()
        lastCapabilities = null
        listener?.onPlaybackChanged(null)
        listener?.onConnectionChanged(ConnectionState.Disconnected)
    }

    suspend fun forgetDevice(deviceId: String) {
        val key = deviceFor(deviceId)?.credentialKey ?: deviceId
        if (currentDevice?.credentialKey == key) disconnect()
        store.forgetDevice(key)
    }

    /** Restores the last connection after process death; a no-op if nothing was saved. */
    suspend fun ensureConnected() {
        if (!isConnected()) store.loadLastDevice()?.let { connect(it.credentialKey) }
    }

    fun autoReconnectIfPossible() {
        val device = store.loadLastDevice() ?: return
        devicesById[device.credentialKey] = device
        currentDevice = device
        scope.launch {
            try { connect(device.credentialKey) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (!device.isRoku && e !is HapException) handleDisconnect(device, e)
            }
        }
    }

    /** Current session for a freshly bound JS runtime (Metro reload / process restart). */
    fun isConnected(): Boolean = remote != null || roku != null
    fun snapshotPlayback(): NowPlaying? = lastNowPlaying
    fun snapshotCapabilities(): MediaCapabilities? = lastCapabilities

    fun snapshotConnection(): ConnectionState {
        val live = currentDevice
        if ((remote != null || roku != null) && live != null) {
            return ConnectionState.Connected(live, live.isRoku || store.isAirPlayPaired(live.credentialKey))
        }
        val last = store.loadLastDevice() ?: return ConnectionState.Disconnected
        return ConnectionState.Connecting(last)
    }

    // -------------------------------------------------- now playing (MRP)

    private fun startNowPlaying(device: AppleTvDevice) {
        nowPlayingJob?.cancel()
        ap2?.onDisconnect = null
        runCatching { ap2?.close() }
        ap2 = null
        val credentials = store.loadAirPlay(device.credentialKey) ?: return
        nowPlayingJob = scope.launch {
            var attempt = 0
            while (isActive && currentDevice?.credentialKey == device.credentialKey) {
                val closed = CompletableDeferred<Unit>()
                val session = Ap2Session(device.address, credentials, scope, deviceName)
                ap2 = session
                session.onNowPlaying = { np ->
                    if (ap2 === session) {
                        lastNowPlaying = np
                        listener?.onPlaybackChanged(np)
                    }
                }
                session.onDisconnect = { closed.complete(Unit) }
                try {
                    withTimeout(15_000) { session.connect() }
                    attempt = 0
                    closed.await()
                } catch (e: TimeoutCancellationException) {
                    Log.w(TAG, "now-playing connection timed out", e)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "now-playing tunnel failed", e)
                    if (e is HapException) {
                        store.forgetAirPlay(device.credentialKey)
                        listener?.onConnectionChanged(ConnectionState.Connected(device, false))
                        break
                    }
                } finally {
                    session.onDisconnect = null
                    runCatching { session.close() }
                    if (ap2 === session) {
                        ap2 = null
                        lastNowPlaying = null
                        listener?.onPlaybackChanged(null)
                    }
                }
                delay((1000L * (1L shl attempt.coerceAtMost(4))).coerceAtMost(15_000))
                attempt++
            }
        }
    }

    // ------------------------------------------------------------ commands

    /** Fire-and-forget-with-retry: an Apple TV drops the connection routinely when it sleeps. */
    private suspend fun <T> command(block: suspend AppleTvRemote.() -> T): T {
        if (roku != null) throw UnsupportedOperationException("This command is not supported on Roku")
        val current = remote
        if (current == null) {
            val revived = reconnect() ?: throw IOException("not connected")
            return revived.block()
        }
        return try {
            current.block()
        } catch (e: Exception) {
            if (!isConnectionLost(e)) throw e
            val revived = reconnect() ?: throw e
            revived.block()
        }
    }

    private suspend fun reconnect(): AppleTvRemote? {
        val device = currentDevice ?: store.loadLastDevice() ?: return null
        reconnectCount++
        return try {
            connect(device.credentialKey)
            remote
        } catch (e: Exception) {
            null
        }
    }

    private fun isConnectionLost(e: Exception): Boolean = e is IOException || e is ProtocolException

    suspend fun sleep() {
        roku?.let { it.press("SLEEP"); return }
        command { sleep() }
    }

    suspend fun wake(deviceId: String) {
        if (currentDevice?.credentialKey != deviceId) connect(deviceId)
        roku?.let { it.press("WAKE"); return }
        command { wake() }
    }

    /**
     * Companion Link has no dedicated hardware-mute command; only
     * [Button.VOLUME_UP]/[Button.VOLUME_DOWN] and, when the TV can route
     * volume (HDMI-CEC), an absolute [AppleTvRemote.setVolume]. Mute here
     * means "drive absolute volume to zero and remember what to restore."
     */
    private var rokuMuted = false
    suspend fun setMuted(muted: Boolean) {
        roku?.let {
            if (muted != rokuMuted) { it.press("MUTE"); rokuMuted = muted }
            return
        }
        volumeGate.withLock {
            command {
                if (muted) {
                    volumeBeforeMute = getVolume() ?: volumeBeforeMute
                    setVolume(0.0)
                } else {
                    setVolume(volumeBeforeMute ?: 0.5)
                    volumeBeforeMute = null
                }
            }
        }
    }

    suspend fun setVolume(level: Double) {
        if (roku != null) throw UnsupportedOperationException("Use the volume buttons on Roku")
        volumeGate.withLock { command { setVolume(level) } }
    }

    private fun buttonFromName(name: String): Button = when (name.uppercase()) {
        "UP" -> Button.UP
        "DOWN" -> Button.DOWN
        "LEFT" -> Button.LEFT
        "RIGHT" -> Button.RIGHT
        "MENU", "BACK" -> Button.MENU
        "SELECT" -> Button.SELECT
        "HOME", "TV" -> Button.HOME
        "PLAY_PAUSE" -> Button.PLAY_PAUSE
        "VOLUME_UP" -> Button.VOLUME_UP
        "VOLUME_DOWN" -> Button.VOLUME_DOWN
        "SIRI" -> Button.SIRI
        "SCREENSAVER" -> Button.SCREENSAVER
        "SLEEP" -> Button.SLEEP
        "WAKE" -> Button.WAKE
        "GUIDE" -> Button.GUIDE
        "CHANNEL_UP" -> Button.CHANNEL_UP
        "CHANNEL_DOWN" -> Button.CHANNEL_DOWN
        "PAGE_UP" -> Button.PAGE_UP
        "PAGE_DOWN" -> Button.PAGE_DOWN
        else -> throw IllegalArgumentException("Unknown button $name")
    }

    suspend fun pressButton(name: String) {
        roku?.let { r -> buttonGate.withLock { r.press(name) }; return }
        when (name.uppercase()) {
            "VOLUME_UP" -> nudgeVolume(up = true)
            "VOLUME_DOWN" -> nudgeVolume(up = false)
            else -> buttonGate.withLock { command { press(buttonFromName(name)) } }
        }
    }

    /** Relative keys do not depend on a possibly stale or unavailable absolute level. */
    suspend fun nudgeVolume(up: Boolean) {
        volumeGate.withLock {
            val r = roku
            if (r != null) r.press(if (up) "VOLUME_UP" else "VOLUME_DOWN")
            else command { press(if (up) Button.VOLUME_UP else Button.VOLUME_DOWN) }
        }
    }

    /** Held for long enough that tvOS reads it as a hold, not a tap (matches upstream's HOLD_MS). */
    suspend fun holdButton(name: String) {
        roku?.let { it.press(name); return }
        buttonGate.withLock { command { press(buttonFromName(name), holdMs = 1000L) } }
    }

    suspend fun playPause() {
        buttonGate.withLock {
            val before = lastNowPlaying
            val r = roku
            if (r != null) r.press("PLAY_PAUSE") else command { playPause() }
            // A device push received during the command takes precedence.
            if (before != null && lastNowPlaying === before &&
                before.playbackState in listOf(PlaybackState.PLAYING, PlaybackState.PAUSED)) {
                val next = before.copy(playbackState =
                    if (before.playbackState == PlaybackState.PLAYING) PlaybackState.PAUSED else PlaybackState.PLAYING)
                lastNowPlaying = next
                listener?.onPlaybackChanged(next)
            }
        }
    }

    suspend fun setPlaying(playing: Boolean) {
        buttonGate.withLock {
            val r = roku
            if (r != null) {
                val state = r.playback().playbackState
                if (state == PlaybackState.PLAYING && !playing || state == PlaybackState.PAUSED && playing) r.press("PLAY_PAUSE")
            } else command { if (playing) play() else pause() }
        }
    }

    suspend fun skipBy(seconds: Double) {
        if (roku != null) throw UnsupportedOperationException("Roku does not support skipping by seconds")
        command { skipBy(seconds) }
    }

    /**
     * Companion Link only offers a relative skip, so an absolute seek is the
     * difference from the last known playhead position reported over MRP.
     */
    suspend fun seekTo(seconds: Double) {
        val currentPosition = lastNowPlaying?.position?.first
            ?: throw IllegalStateException("Current position unknown")
        command { skipBy(seconds - currentPosition) }
    }

    suspend fun sendText(text: String, clearPrevious: Boolean) {
        command { sendText(text, clearPrevious) }
    }

    suspend fun loadApps() {
        val apps = command { listApps() }
        listener?.onAppsChanged(apps)
    }

    suspend fun launchApp(bundleId: String) = command { launchApp(bundleId) }

    // ------------------------------------------------------- touch surface

    private data class TouchSample(val x: Int, val y: Int, val phase: TouchPhase)

    fun touchStart(x: Double, y: Double) = enqueueTouch(x, y, TouchPhase.PRESS)
    fun touchMove(x: Double, y: Double) = enqueueTouch(x, y, TouchPhase.HOLD)
    fun touchEnd(x: Double, y: Double) = enqueueTouch(x, y, TouchPhase.RELEASE)

    private fun enqueueTouch(x: Double, y: Double, phase: TouchPhase) {
        touchEventsReceived++
        touchChannel.trySend(
            TouchSample(x.roundToInt().coerceIn(0, 1000), y.roundToInt().coerceIn(0, 1000), phase),
        )
    }

    /**
     * A swipe is Press, then Holds, then Release, and must reach the device
     * in that order -- so a single consumer drains a channel rather than one
     * coroutine per sample. Hold samples are throttled to ~12ms/83Hz (the
     * coordinates are absolute; the wire does not need more), matching the
     * value the upstream reference app settled on.
     */
    private suspend fun drainTouch() {
        var lastHoldNanos = 0L
        for (sample in touchChannel) {
            if (sample.phase == TouchPhase.HOLD) {
                val now = System.nanoTime()
                if (now - lastHoldNanos < HOLD_THROTTLE_NANOS) {
                    touchEventsCoalesced++
                    continue
                }
                lastHoldNanos = now
            }
            val r = remote ?: continue
            touchEventsSent++
            runCatching { r.touch(sample.x, sample.y, sample.phase) }
        }
    }

    // ---------------------------------------------------------- diagnostics

    fun diagnosticsSnapshot(): Map<String, Any?> = mapOf(
        "connected" to isConnected(),
        "currentDeviceName" to currentDevice?.name,
        "discoveredDeviceCount" to devicesById.size,
        "reconnectCount" to reconnectCount,
        "mrpConnected" to (ap2 != null),
        "touchEventsReceived" to touchEventsReceived,
        "touchEventsSent" to touchEventsSent,
        "touchEventsCoalesced" to touchEventsCoalesced,
    )

    // -------------------------------------------------------------- lifecycle

    fun shutdown() {
        discoveryJob?.cancel()
        autoReconnectJob?.cancel()
        nowPlayingJob?.cancel()
        remote?.onDisconnect = null
        ap2?.onDisconnect = null
        touchChannel.close()
        runCatching { remote?.close() }
        runCatching { ap2?.close() }
        closePairing()
        closeAirPlayPairing()
    }

    private companion object {
        const val TAG = "AppleTVController"
        const val DISCOVERY_TIMEOUT_MS = 10_000L
        // Ap2Session's own AIRPLAY_PORT constant is private; 7000 is the
        // fixed AirPlay control port and is what upstream's app module uses
        // directly for the same reason.
        const val AIRPLAY_PORT = 7000
        const val HOLD_THROTTLE_NANOS = 12_000_000L
    }
}
