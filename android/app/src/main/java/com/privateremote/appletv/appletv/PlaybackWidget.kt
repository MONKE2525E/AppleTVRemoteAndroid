package com.privateremote.appletv.appletv

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.privateremote.appletv.MainActivity
import com.privateremote.appletv.R
import dev.atvremote.protocol.mrp.NowPlaying
import dev.atvremote.protocol.mrp.PlaybackState

class PlaybackWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context, manager, ids)
    }

    companion object {
        const val ACTION_PLAY_PAUSE = "com.privateremote.WIDGET_PLAY_PAUSE"
        fun update(context: Context, deviceName: String?, playback: NowPlaying?) {
            val active = playback != null && playback.isActive && playback.playbackState != PlaybackState.STOPPED
            context.getSharedPreferences("playback_widget", Context.MODE_PRIVATE).edit()
                .putString("device", deviceName)
                .putString("title", if (active) playback?.title ?: playback?.appName ?: "TV playback" else "TV Remote")
                .putString("details", if (active) listOfNotNull(playback?.artist, playback?.album, playback?.appName).distinct().joinToString(" · ")
                    else "Open the remote to connect or enable playback details")
                .putBoolean("active", active)
                .putBoolean("playing", playback?.playbackState == PlaybackState.PLAYING)
                .apply()
            val manager = AppWidgetManager.getInstance(context)
            render(context, manager, manager.getAppWidgetIds(ComponentName(context, PlaybackWidget::class.java)))
        }

        private fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val prefs = context.getSharedPreferences("playback_widget", Context.MODE_PRIVATE)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), flags)
            val active = prefs.getBoolean("active", false)
            val playing = prefs.getBoolean("playing", false)
            val action = if (active) PendingIntent.getActivity(context, 100,
                Intent(context, MainActivity::class.java).setAction(ACTION_PLAY_PAUSE), flags) else open
            for (id in ids) {
                val views = RemoteViews(context.packageName, R.layout.tv_playback_widget)
                views.setTextViewText(R.id.widget_device, prefs.getString("device", "TV playback controls"))
                views.setTextViewText(R.id.widget_title, prefs.getString("title", "TV Remote"))
                views.setTextViewText(R.id.widget_details, prefs.getString("details", "Open the remote to connect"))
                views.setTextViewText(R.id.widget_play_pause, if (!active) "Open remote" else if (playing) "Pause" else "Play")
                views.setOnClickPendingIntent(R.id.widget_title, open)
                views.setOnClickPendingIntent(R.id.widget_play_pause, action)
                manager.updateAppWidget(id, views)
            }
        }
    }
}
