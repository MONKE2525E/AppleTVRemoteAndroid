package com.privateremote.appletv.appletv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import com.privateremote.appletv.MainActivity
import com.privateremote.appletv.R
import dev.atvremote.protocol.mrp.NowPlaying
import dev.atvremote.protocol.mrp.PlaybackState
import java.util.Locale

/** A system Live Update, separate from Media3's ineligible MediaStyle template. */
@androidx.annotation.OptIn(markerClass = [androidx.media3.common.util.UnstableApi::class])
class PlaybackLiveUpdate(private val context: Context) {
    private var playback: NowPlaying? = null
    private var receivedAt = 0L
    private var artworkBytes: ByteArray? = null
    private var artwork: Bitmap? = null
    private var dismissed = false

    fun update(value: NowPlaying?) {
        if (!isPlaying(value) || !isPlaying(playback) || value?.title != playback?.title || value?.appName != playback?.appName) {
            dismissed = false
        }
        playback = value
        receivedAt = SystemClock.elapsedRealtime()
        if (artworkBytes !== value?.artwork) {
            artworkBytes = value?.artwork
            artwork = value?.artwork?.let { bytes ->
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                val options = BitmapFactory.Options().apply {
                    inSampleSize = 1
                    while (bounds.outWidth / inSampleSize > 512 || bounds.outHeight / inSampleSize > 512) inSampleSize *= 2
                }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
            }
        }
    }

    fun dismiss() { dismissed = true }

    fun build(deviceName: String?, supportsSeek: Boolean, mediaToken: android.media.session.MediaSession.Token? = null, transportKeys: Boolean = false): Notification? {
        val np = playback ?: return null
        if (deviceName == null || !isPlaying(np) || dismissed) return null
        val manager = context.getSystemService(NotificationManager::class.java)
        // LOW is filtered by Pixel's default "hide silent notifications on lock screen" setting,
        // even when Android has promoted the notification. DEFAULT remains quiet with no sound.
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Playing on TV", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Playback activity and controls, shown only while content is playing"
            setSound(null, null)
            enableVibration(false)
        })
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), flags)
        fun command(action: String) = PendingIntent.getService(context, action.hashCode(),
            Intent(context, AppleTVService::class.java).setAction(action), flags)
        val title = np.title?.takeIf { it.isNotBlank() } ?: np.appName?.takeIf { it.isNotBlank() } ?: "Playing on TV"
        val details = listOfNotNull(np.artist, np.album, np.appName).filter { it.isNotBlank() && it != title }.distinct().joinToString(" · ")
        val position = np.position?.let { (elapsed, duration) ->
            (elapsed + (SystemClock.elapsedRealtime() - receivedAt) / 1000.0).coerceAtMost(duration) to duration
        }
        val text = listOf(details, position?.let { "${time(it.first)} / ${time(it.second)}" } ?: "Playing").filter { it.isNotBlank() }.joinToString(" · ")
        val builder = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_playback)
            .setContentTitle(title)
            .setContentText(text)
            .setSubText(deviceName)
            .setContentIntent(open)
            .setDeleteIntent(command(ACTION_DISMISS))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
        artwork?.let { builder.setLargeIcon(it) }
        if (supportsSeek) builder.addAction(Notification.Action.Builder(null, if (transportKeys) "Rewind" else "−10 sec", command(ACTION_BACK)).build())
        builder.addAction(Notification.Action.Builder(null, "Pause", command(ACTION_PAUSE)).build())
        if (supportsSeek) builder.addAction(Notification.Action.Builder(null, if (transportKeys) "Fast forward" else "+10 sec", command(ACTION_FORWARD)).build())
        if (Build.VERSION.SDK_INT >= 31) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        if (mediaToken != null) {
            // The system media player (including Samsung's Media player Now Bar)
            // discovers playback through a MediaStyle notification with a real session token.
            builder.setStyle(Notification.MediaStyle().setMediaSession(mediaToken)
                .setShowActionsInCompactView(*(if (supportsSeek) intArrayOf(0, 1, 2) else intArrayOf(0))))
                .setColorized(false)
        } else if (Build.VERSION.SDK_INT >= 36) {
            // Public extra works with compileSdk 36; the convenience setter was added in 36.1.
            builder.addExtras(Bundle().apply { putBoolean("android.requestPromotedOngoing", true) })
            builder.setShortCriticalText(position?.let { time(it.first) } ?: "Playing")
            val style = Notification.ProgressStyle()
            if (position != null) {
                style.addProgressSegment(Notification.ProgressStyle.Segment(1000))
                    .setProgress((position.first / position.second * 1000).toInt())
            }
            // Missing timing is unavailable metadata, not buffering. Do not show a spinner.
            if (position != null) builder.setStyle(style)
            else builder.setStyle(Notification.BigTextStyle().bigText(text))
        } else {
            builder.setStyle(Notification.BigTextStyle().bigText(text))
            position?.let { builder.setProgress(1000, (it.first / it.second * 1000).toInt(), false) }
        }
        return builder.build()
    }

    companion object {
        const val ID = 101
        const val MEDIA_ID = 102
        const val CHANNEL = "tv_playback_live"
        const val ACTION_PAUSE = "com.privateremote.PLAYBACK_PAUSE"
        const val ACTION_BACK = "com.privateremote.PLAYBACK_BACK"
        const val ACTION_FORWARD = "com.privateremote.PLAYBACK_FORWARD"
        const val ACTION_DISMISS = "com.privateremote.PLAYBACK_DISMISS"
        fun isPlaying(value: NowPlaying?) = value?.playbackState == PlaybackState.PLAYING
        private fun time(seconds: Double): String {
            val total = seconds.toLong()
            return if (total >= 3600) String.format(Locale.ROOT, "%d:%02d:%02d", total / 3600, total / 60 % 60, total % 60)
            else String.format(Locale.ROOT, "%d:%02d", total / 60, total % 60)
        }
    }
}
