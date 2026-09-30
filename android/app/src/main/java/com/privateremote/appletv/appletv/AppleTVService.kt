package com.privateremote.appletv.appletv

import android.app.PendingIntent
import android.os.Handler
import android.os.Looper
import com.privateremote.appletv.MainActivity
import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
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

/** Owns the controller and media session while the app is bound, without an ongoing notification. */
@UnstableApi
class AppleTVService : Service() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var widgetPlayback: NowPlaying? = null
    private var deviceLabel: String? = null

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

        // Rebuilds the session from persisted state on every (re)creation --
        // covers both a fresh launch and a process restart after death.
        c.autoReconnectIfPossible()
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
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
                refreshWidget()
            }
            subscribers.forEach { it.onConnectionChanged(state) }
        }
        override fun onPlaybackChanged(playback: NowPlaying?) {
            mainHandler.post {
                widgetPlayback = playback
                mediaAdapter?.update(playback)
                refreshWidget()
            }
            subscribers.forEach { it.onPlaybackChanged(playback) }
        }
        override fun onCapabilitiesChanged(capabilities: MediaCapabilities) {
            mainHandler.post {
                mediaAdapter?.setSupportsSeek(capabilities.skipForward && capabilities.skipBackward)
                refreshWidget()
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

}
