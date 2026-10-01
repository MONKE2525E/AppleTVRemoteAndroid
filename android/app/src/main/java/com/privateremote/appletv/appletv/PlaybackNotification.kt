package com.privateremote.appletv.appletv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaStyleNotificationHelper
import dev.atvremote.protocol.mrp.NowPlaying
import dev.atvremote.protocol.mrp.PlaybackState

/**
 * The single "now playing" notification. One fixed id, silent, updated in
 * place, and only present while something is playing or paused on the TV —
 * never a connection notice.
 *
 * Android 16+ gets a Live Update (promoted ongoing, with a progress bar and a
 * status-bar chip); earlier versions get a standard media notification.
 */
@UnstableApi
object PlaybackNotification {
    const val ID = 2525
    const val ACTION_PLAY_PAUSE = "com.privateremote.appletv.PLAY_PAUSE"
    const val ACTION_SKIP_BACK = "com.privateremote.appletv.SKIP_BACK"
    const val ACTION_SKIP_FORWARD = "com.privateremote.appletv.SKIP_FORWARD"
    private const val CHANNEL_ID = "tv_playback"
    private const val LIVE_UPDATE_SDK = 36
    // Notification.EXTRA_REQUEST_PROMOTED_ONGOING, spelled out so this compiles on SDK 36.0.
    private const val EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing"

    /** Playing or paused: something the user may want to control from the shade. */
    fun shouldShow(np: NowPlaying?): Boolean =
        np != null && np.isActive &&
            (np.playbackState == PlaybackState.PLAYING || np.playbackState == PlaybackState.PAUSED)

    fun build(
        context: Context,
        np: NowPlaying,
        device: String?,
        supportsSkip: Boolean,
        session: MediaSession?,
        open: PendingIntent,
    ): Notification {
        ensureChannel(context)
        val playing = np.playbackState == PlaybackState.PLAYING
        val title = np.title ?: np.appName ?: "TV"
        val text = listOfNotNull(np.artist, np.appName.takeIf { it != np.title }, device).distinct().joinToString(" · ")
        val art = np.artwork?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
        val toggle = Triple(
            if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
            if (playing) "Pause" else "Play",
            intent(context, ACTION_PLAY_PAUSE),
        )
        val back = Triple(android.R.drawable.ic_media_rew, "Back 10s", intent(context, ACTION_SKIP_BACK))
        val forward = Triple(android.R.drawable.ic_media_ff, "Forward 10s", intent(context, ACTION_SKIP_FORWARD))
        val actions = if (supportsSkip) listOf(back, toggle, forward) else listOf(toggle)

        if (Build.VERSION.SDK_INT >= LIVE_UPDATE_SDK) {
            val style = Notification.ProgressStyle()
            val position = np.position
            if (position != null) {
                style.setProgressSegments(listOf(Notification.ProgressStyle.Segment(position.second.toInt().coerceAtLeast(1))))
                    .setProgress(position.first.toInt())
            } else {
                style.setProgressIndeterminate(true)
            }
            return Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(if (playing) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause)
                .setContentTitle(title)
                .setContentText(text)
                .setLargeIcon(art)
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setShortCriticalText(if (playing) "Playing" else "Paused")
                .addExtras(android.os.Bundle().apply { putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true) })
                .setStyle(style)
                .apply {
                    actions.forEach { (icon, label, pending) ->
                        addAction(Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(context, icon), label, pending).build())
                    }
                }
                .build()
        }

        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(if (playing) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause)
            .setContentTitle(title)
            .setContentText(text)
            .setLargeIcon(art)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .apply {
                actions.forEach { (icon, label, pending) -> addAction(icon, label, pending) }
                session?.let {
                    setStyle(
                        MediaStyleNotificationHelper.MediaStyle(it)
                            .setShowActionsInCompactView(*(if (supportsSkip) intArrayOf(0, 1, 2) else intArrayOf(0))),
                    )
                }
            }
            .build()
    }

    private fun intent(context: Context, action: String): PendingIntent = PendingIntent.getService(
        context, action.hashCode(), Intent(context, AppleTVService::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "TV playback", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Playback controls while something is playing on your TV."
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
            },
        )
    }
}
