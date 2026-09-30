package com.privateremote.appletv.appletv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import com.privateremote.appletv.MainActivity
import androidx.media3.session.MediaStyleNotificationHelper
import dev.atvremote.protocol.mrp.PlaybackState
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import dev.atvremote.protocol.companion.AppInfo
import dev.atvremote.protocol.companion.MediaCapabilities
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.NowPlaying
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Connected-device foreground service: the phone is *controlling* playback
 * happening on an external Apple TV, it is not itself playing media, so this
 * deliberately uses `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE`, not
 * `mediaPlayback`.
 *
 * Owns [AppleTVController] independently of React Native. [AppleTVModule]
 * binds to this service to forward commands/events -- it never holds
 * protocol/session state itself (see the layering note in the project plan).
 * The service is both *started* (survives its binder clients unbinding
 * across RN reloads) and *bound* (so callers get a direct controller
 * reference), and reloads persisted device/credential state on every
 * (re)creation so an Activity/process restart cleanly rebuilds the session
 * rather than assuming the foreground service type prevents process death.
 *
 * Also owns the Media3 session: [Media3PlaybackAdapter] is a *projection* of
 * [AppleTVController]'s now-playing state onto a Media3 [Player][
 * androidx.media3.common.Player], not a second state machine -- see the
 * adapter's kdoc.
 */
@UnstableApi
class AppleTVService : Service() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var notificationPlayback: NowPlaying? = null
    private var deviceLabel: String? = null
    private var supportsSkip = false

    private val binder = LocalBinder()
    private var serviceScope: CoroutineScope? = null
    private var controller: AppleTVController? = null
    private var mediaAdapter: Media3PlaybackAdapter? = null
    private var mediaSession: MediaSession? = null
    private val subscribers = CopyOnWriteArrayList<AppleTVListener>()

    inner class LocalBinder : Binder() {
        fun getController(): AppleTVController = requireNotNull(controller)
        fun addListener(listener: AppleTVListener) { subscribers.add(listener) }
        fun removeListener(listener: AppleTVListener) { subscribers.remove(listener) }
        fun mediaDiagnostics(): Map<String, Any?> = mapOf(
            "media3Active" to (mediaAdapter?.isActive ?: false),
            "media3PlayWhenReady" to (mediaAdapter?.lastPlayWhenReady ?: false),
        )
    }

    override fun onCreate() {
        super.onCreate()
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
        mediaSession = MediaSession.Builder(this, adapter).setId("appletv_remote")
            .setSessionActivity(openAppIntent()).build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification(), foregroundServiceType())
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
        // Rebuilds the session from persisted state on every (re)creation --
        // covers both a fresh launch and a process restart after death.
        c.autoReconnectIfPossible()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY_PAUSE -> serviceScope?.launch { runCatching { controller?.ensureConnected(); controller?.playPause() } }
            ACTION_SKIP_BACK -> serviceScope?.launch { runCatching { controller?.skipBy(-10.0) } }
            ACTION_SKIP_FORWARD -> serviceScope?.launch { runCatching { controller?.skipBy(10.0) } }
        }
        // START_STICKY: the system may recreate this service after it is
        // killed under memory pressure; onCreate() above re-derives all
        // state from CredentialStore rather than relying on this to matter.
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
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

    private fun actionIntent(action: String): PendingIntent = PendingIntent.getForegroundService(
        this, action.hashCode(), Intent(this, AppleTVService::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun refreshNotification() {
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID, buildNotification())
        PlaybackWidget.update(this, deviceLabel, notificationPlayback)
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "TV playback controls",
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = "Keeps the Apple TV remote connection alive in the background." }
            manager.createNotificationChannel(channel)
        }
        val np = notificationPlayback
        val active = np != null && np.playbackState != PlaybackState.STOPPED && np.isActive
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(if (active) np?.title ?: np?.appName ?: "TV playback" else "TV Remote")
            .setContentText(if (active) listOfNotNull(np?.artist, np?.album, np?.appName, deviceLabel).distinct().joinToString(" · ")
                else deviceLabel?.let { "Connected to $it" } ?: "Choose a TV to connect")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(openAppIntent())
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
        if (active) {
            val playing = np?.playbackState == PlaybackState.PLAYING
            builder.setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            if (supportsSkip) builder.addAction(android.R.drawable.ic_media_rew, "Back 10 seconds", actionIntent(ACTION_SKIP_BACK))
            builder.addAction(if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                    if (playing) "Pause" else "Play", actionIntent(ACTION_PLAY_PAUSE))
            if (supportsSkip) builder.addAction(android.R.drawable.ic_media_ff, "Forward 10 seconds", actionIntent(ACTION_SKIP_FORWARD))
            mediaSession?.let {
                builder.setStyle(MediaStyleNotificationHelper.MediaStyle(it).setShowActionsInCompactView(*(if (supportsSkip) intArrayOf(0, 1, 2) else intArrayOf(0))))
            }
            np?.artwork?.let { bytes ->
                runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }.getOrNull()
                    ?.let { builder.setLargeIcon(it) }
            }
        }
        return builder.build()
    }

    /** Fans out every controller event to whoever is currently subscribed (e.g. AppleTVModule). */
    private val fanOutListener = object : AppleTVListener {
        override fun onDevicesChanged(devices: List<AppleTvDevice>) {
            subscribers.forEach { it.onDevicesChanged(devices) }
        }
        override fun onConnectionChanged(state: ConnectionState) {
            mainHandler.post {
                deviceLabel = when (state) {
                    is ConnectionState.Connected -> state.device.name
                    is ConnectionState.Connecting -> state.device.name
                    else -> null
                }
                refreshNotification()
            }
            subscribers.forEach { it.onConnectionChanged(state) }
        }
        override fun onPlaybackChanged(playback: NowPlaying?) {
            mainHandler.post {
                notificationPlayback = playback
                mediaAdapter?.update(playback)
                refreshNotification()
            }
            subscribers.forEach { it.onPlaybackChanged(playback) }
        }
        override fun onCapabilitiesChanged(capabilities: MediaCapabilities) {
            mainHandler.post {
                supportsSkip = capabilities.skipForward && capabilities.skipBackward
                mediaAdapter?.setSupportsSeek(supportsSkip)
                refreshNotification()
            }
            subscribers.forEach { it.onCapabilitiesChanged(capabilities) }
        }
        override fun onTextInputRequested(current: String?, focused: Boolean) {
            subscribers.forEach { it.onTextInputRequested(current, focused) }
        }
        override fun onAppsChanged(apps: List<AppInfo>) {
            subscribers.forEach { it.onAppsChanged(apps) }
        }
    }

    companion object {
        private const val CHANNEL_ID = "tv_playback"
        const val ACTION_PLAY_PAUSE = "com.privateremote.PLAY_PAUSE"
        private const val ACTION_SKIP_BACK = "com.privateremote.SKIP_BACK"
        private const val ACTION_SKIP_FORWARD = "com.privateremote.SKIP_FORWARD"
        private const val NOTIFICATION_ID = 1001

        fun foregroundServiceType(): Int = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    }
}
