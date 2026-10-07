package com.privateremote.appletv.appletv

import android.app.PendingIntent
import android.app.NotificationManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import android.os.Handler
import android.os.Looper
import com.privateremote.appletv.MainActivity
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import androidx.media3.common.util.UnstableApi
import android.os.Bundle
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.media3.session.CommandButton
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionError
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import java.io.ByteArrayOutputStream
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import dev.atvremote.protocol.companion.AppInfo
import dev.atvremote.protocol.companion.MediaCapabilities
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.NowPlaying
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.concurrent.CopyOnWriteArrayList

/** Owns the controller, media session, and playback-only foreground Live Update. */
@UnstableApi
class AppleTVService : MediaSessionService() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var widgetPlayback: NowPlaying? = null
    private var deviceLabel: String? = null
    private lateinit var liveUpdate: PlaybackLiveUpdate
    private var supportsSeek = false
    private var rokuTransport = false
    private var foregroundPlayback = false
    private var foregroundStartDeferred = false
    private var liveUpdateError: String? = null
    private val refreshPlayback = object : Runnable {
        override fun run() {
            refreshLiveUpdate()
            if (PlaybackLiveUpdate.isPlaying(widgetPlayback)) mainHandler.postDelayed(this, 5_000)
        }
    }

    private val backCommand = SessionCommand(PlaybackLiveUpdate.ACTION_BACK, Bundle.EMPTY)
    private val forwardCommand = SessionCommand(PlaybackLiveUpdate.ACTION_FORWARD, Bundle.EMPTY)
    private val fallbackArtwork by lazy {
        val drawable = packageManager.getApplicationIcon(packageName)
        val bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
        drawable.setBounds(0, 0, 256, 256)
        drawable.draw(Canvas(bitmap))
        ByteArrayOutputStream().use { output ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
            bitmap.recycle()
            output.toByteArray()
        }
    }

    private fun mediaButtons(): List<CommandButton> = if (!supportsSeek && !rokuTransport) emptyList() else listOf(
        CommandButton.Builder(if (rokuTransport) CommandButton.ICON_REWIND else CommandButton.ICON_SKIP_BACK_10)
            .setSessionCommand(backCommand).setDisplayName(if (rokuTransport) "Rewind" else "Back 10 seconds")
            .setSlots(CommandButton.SLOT_BACK).build(),
        CommandButton.Builder(if (rokuTransport) CommandButton.ICON_FAST_FORWARD else CommandButton.ICON_SKIP_FORWARD_10)
            .setSessionCommand(forwardCommand).setDisplayName(if (rokuTransport) "Fast forward" else "Forward 10 seconds")
            .setSlots(CommandButton.SLOT_FORWARD).build(),
    )

    private val sessionCallback = object : MediaSession.Callback {
        override fun onConnect(session: MediaSession, info: MediaSession.ControllerInfo): MediaSession.ConnectionResult =
            MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                    .add(backCommand).add(forwardCommand).build())
                .build()

        override fun onCustomCommand(session: MediaSession, info: MediaSession.ControllerInfo,
            command: SessionCommand, args: Bundle): ListenableFuture<SessionResult> {
            val result = SettableFuture.create<SessionResult>()
            val scope = serviceScope
            if (scope == null) result.set(SessionResult(SessionError.ERROR_SESSION_DISCONNECTED))
            else scope.launch {
                val code = try {
                    if (!PlaybackLiveUpdate.isPlaying(widgetPlayback) || (!supportsSeek && !rokuTransport)) {
                        SessionError.ERROR_INVALID_STATE
                    } else when (command.customAction) {
                        backCommand.customAction -> {
                            if (rokuTransport) controller?.pressButton("REWIND") else controller?.skipBy(-10.0)
                            SessionResult.RESULT_SUCCESS
                        }
                        forwardCommand.customAction -> {
                            if (rokuTransport) controller?.pressButton("FAST_FORWARD") else controller?.skipBy(10.0)
                            SessionResult.RESULT_SUCCESS
                        }
                        else -> SessionError.ERROR_NOT_SUPPORTED
                    }
                } catch (error: Exception) {
                    Log.w("PlaybackMedia", "System media action failed", error)
                    SessionError.ERROR_IO
                }
                result.set(SessionResult(code))
            }
            return result
        }
    }

    private val binder = LocalBinder()
    private var serviceScope: CoroutineScope? = null
    private var controller: AppleTVController? = null
    private var mediaAdapter: Media3PlaybackAdapter? = null
    private var mediaSession: MediaSession? = null
    private val subscribers = CopyOnWriteArrayList<AppleTVListener>()

    inner class LocalBinder : Binder() {
        fun getController(): AppleTVController = requireNotNull(controller)
        fun reportCommandError(operation: String, code: String) {
            subscribers.forEach { it.onCommandError(operation, code) }
        }
        fun addListener(listener: AppleTVListener) { subscribers.add(listener) }
        fun removeListener(listener: AppleTVListener) { subscribers.remove(listener) }
        fun refreshPlaybackActivity() { mainHandler.post {
            foregroundStartDeferred = false
            refreshLiveUpdate()
        } }
        fun mediaDiagnostics(): Map<String, Any?> = mapOf(
            "media3Active" to (mediaAdapter?.isActive ?: false),
            "media3PlayWhenReady" to (mediaAdapter?.lastPlayWhenReady ?: false),
            "playbackForeground" to foregroundPlayback,
            "playbackForegroundDeferred" to foregroundStartDeferred,
            "liveUpdateError" to liveUpdateError,
            "notificationsEnabled" to getSystemService(NotificationManager::class.java).areNotificationsEnabled(),
            "systemMediaNotification" to getSystemService(NotificationManager::class.java).activeNotifications.any { it.id == PlaybackLiveUpdate.MEDIA_ID },
            "liveUpdatesSupported" to (Build.VERSION.SDK_INT >= 36),
            "liveUpdatesAllowed" to if (Build.VERSION.SDK_INT >= 36) getSystemService(NotificationManager::class.java).canPostPromotedNotifications() else false,
            "liveUpdatePromoted" to if (Build.VERSION.SDK_INT >= 36) getSystemService(NotificationManager::class.java).activeNotifications
                .any { it.id == PlaybackLiveUpdate.ID && it.notification.flags and android.app.Notification.FLAG_PROMOTED_ONGOING != 0 } else false,
        )
    }

    override fun onCreate() {
        super.onCreate()
        // Clear the previous card immediately on upgrade, even if reconnecting fails.
        getSystemService(NotificationManager::class.java).cancel(PlaybackLiveUpdate.ID)
        liveUpdate = PlaybackLiveUpdate(this)
        val scope = CoroutineScope(SupervisorJob())
        serviceScope = scope
        val c = AppleTVController(applicationContext, scope)
        c.listener = fanOutListener
        controller = c

        val adapter = Media3PlaybackAdapter(
            object : Media3PlaybackAdapter.CommandForwarder {
                override fun setPlaying(playing: Boolean) { scope.launch { runCatching { c.setPlaying(playing) } } }
                override fun seekTo(seconds: Double) { scope.launch { runCatching { c.seekTo(seconds) } } }
                override fun skipBy(seconds: Double) { scope.launch { runCatching { c.skipBy(seconds) } } }
            },
        )
        mediaAdapter = adapter

        // Rebuilds the session from persisted state on every (re)creation --
        // covers both a fresh launch and a process restart after death.
        c.autoReconnectIfPossible()
    }

    override fun onBind(intent: Intent?): IBinder = super.onBind(intent) ?: binder

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onUpdateNotification(session: MediaSession, startInForegroundRequired: Boolean) {
        // Controller events own our single notification and connected-device foreground service.
        // MediaSessionService still connects its notification controller, which exports custom
        // commands to Android's platform media session. Avoid its additional default card.
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (!foregroundPlayback) stopSelf()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        val action = intent?.action
        if (action == PlaybackLiveUpdate.ACTION_DISMISS) {
            liveUpdate.dismiss()
            refreshLiveUpdate()
        } else if (PlaybackLiveUpdate.isPlaying(widgetPlayback) && deviceLabel != null) {
            if (action != null) {
                // A notification interaction permits starting the foreground service again.
                foregroundStartDeferred = false
                refreshLiveUpdate()
            }
            val c = controller
            serviceScope?.launch {
                runCatching {
                    when (action) {
                        PlaybackLiveUpdate.ACTION_PAUSE -> c?.setPlaying(false)
                        PlaybackLiveUpdate.ACTION_BACK -> if (rokuTransport) c?.pressButton("REWIND") else if (supportsSeek) c?.skipBy(-10.0)
                        PlaybackLiveUpdate.ACTION_FORWARD -> if (rokuTransport) c?.pressButton("FAST_FORWARD") else if (supportsSeek) c?.skipBy(10.0)
                    }
                }.onFailure { error ->
                    Log.w("PlaybackLiveUpdate", "Playback action failed", error)
                    subscribers.forEach { it.onCommandError("playbackActivity", error.javaClass.simpleName) }
                }
            }
        }
        // Reconnect on the next app launch, rather than showing stale playback after process death.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        stopForeground(STOP_FOREGROUND_REMOVE)
        getSystemService(NotificationManager::class.java).cancel(PlaybackLiveUpdate.ID)
        getSystemService(NotificationManager::class.java).cancel(PlaybackLiveUpdate.MEDIA_ID)
        PlaybackWidget.update(this, null, null)
        mediaSession?.release()
        mediaSession = null
        mediaAdapter?.release()
        mediaAdapter = null
        controller?.shutdown()
        serviceScope?.cancel()
        controller = null
        serviceScope = null
        super.onDestroy()
    }

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        this, 0, Intent(this, MainActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun refreshWidget() {
        PlaybackWidget.update(this, deviceLabel, widgetPlayback)
    }

    private fun refreshLiveUpdate() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.cancel(PlaybackLiveUpdate.ID)
        val notification = liveUpdate.build(deviceLabel, supportsSeek || rokuTransport, transportKeys = rokuTransport)
        if (notification == null) {
            if (foregroundPlayback) stopForeground(STOP_FOREGROUND_REMOVE)
            foregroundPlayback = false
            foregroundStartDeferred = false
            manager.cancel(PlaybackLiveUpdate.ID)
            manager.cancel(PlaybackLiveUpdate.MEDIA_ID)
            // End the system media session as well, so retained paused metadata cannot
            // keep a Samsung Now Bar player alive after the activity has been removed.
            mediaSession?.release()
            mediaSession = null
            stopSelf()
            return
        }
        try {
            if (mediaSession == null) {
                mediaSession = MediaSession.Builder(this, requireNotNull(mediaAdapter))
                    .setId("appletv_remote").setSessionActivity(openAppIntent())
                    .setCallback(sessionCallback).setMediaButtonPreferences(mediaButtons()).build()
                addSession(mediaSession!!)
            }
            mediaSession!!.setMediaButtonPreferences(mediaButtons())
            val mediaNotification = requireNotNull(liveUpdate.build(deviceLabel, supportsSeek || rokuTransport, mediaSession!!.platformToken, rokuTransport))
            manager.notify(PlaybackLiveUpdate.MEDIA_ID, mediaNotification)
            if (!foregroundPlayback && !foregroundStartDeferred) {
                // Keep a single media notification as the foreground-service notification.
                if (Build.VERSION.SDK_INT >= 29) startForeground(PlaybackLiveUpdate.MEDIA_ID, mediaNotification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
                else startForeground(PlaybackLiveUpdate.MEDIA_ID, mediaNotification)
                foregroundPlayback = true
                // Retain ownership when React Native or the activity unbinds during playback.
                startService(Intent(this, AppleTVService::class.java))
            }
            // Remove the former second card, including notifications retained across an APK update.
            manager.cancel(PlaybackLiveUpdate.ID)
            liveUpdateError = null
        } catch (error: RuntimeException) {
            liveUpdateError = error.javaClass.simpleName
            if (Build.VERSION.SDK_INT >= 31 && error is android.app.ForegroundServiceStartNotAllowedException) {
                // Keep the already-posted media notification while bound. Retry foreground
                // ownership when the user returns to the app or taps a control.
                foregroundStartDeferred = true
                manager.cancel(PlaybackLiveUpdate.ID)
            }
            Log.w("PlaybackLiveUpdate", "Cannot start playback activity", error)
        }
    }

    /** Fans out every controller event to whoever is currently subscribed (e.g. AppleTVModule). */
    private val fanOutListener = object : AppleTVListener {
        override fun onDevicesChanged(devices: List<AppleTvDevice>) {
            subscribers.forEach { it.onDevicesChanged(devices) }
        }
        override fun onConnectionChanged(state: ConnectionState) {
            mainHandler.post {
                rokuTransport = state is ConnectionState.Connected && state.device.isRoku
                deviceLabel = when (state) {
                    is ConnectionState.Connected -> state.device.name
                    else -> null
                }
                if (state !is ConnectionState.Connected) {
                    widgetPlayback = null
                    mediaAdapter?.update(null)
                    liveUpdate.update(null)
                    mainHandler.removeCallbacks(refreshPlayback)
                }
                refreshLiveUpdate()
                refreshWidget()
            }
            subscribers.forEach { it.onConnectionChanged(state) }
        }
        override fun onPlaybackChanged(playback: NowPlaying?) {
            mainHandler.post {
                widgetPlayback = playback
                val presentation = playback?.let { if (it.artwork == null) it.copy(artwork = fallbackArtwork) else it }
                mediaAdapter?.update(presentation)
                liveUpdate.update(presentation)
                mainHandler.removeCallbacks(refreshPlayback)
                refreshPlayback.run()
                refreshWidget()
            }
            subscribers.forEach { it.onPlaybackChanged(playback) }
        }
        override fun onCapabilitiesChanged(capabilities: MediaCapabilities) {
            mainHandler.post {
                mediaAdapter?.setSupportsSeek(capabilities.skipForward && capabilities.skipBackward)
                supportsSeek = capabilities.skipForward && capabilities.skipBackward
                refreshLiveUpdate()
                refreshWidget()
            }
            subscribers.forEach { it.onCapabilitiesChanged(capabilities) }
        }
        override fun onTextInputRequested(current: String?, focused: Boolean) {
            subscribers.forEach { it.onTextInputRequested(current, focused) }
        }
        override fun onAppsChanged(deviceId: String, apps: List<AppInfo>) {
            subscribers.forEach { it.onAppsChanged(deviceId, apps) }
        }
    }

}
