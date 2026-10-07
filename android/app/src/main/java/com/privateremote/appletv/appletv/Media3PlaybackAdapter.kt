package com.privateremote.appletv.appletv

import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.DeviceInfo
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import dev.atvremote.protocol.mrp.NowPlaying
import dev.atvremote.protocol.mrp.PlaybackState

/**
 * A Media3 [Player]-shaped projection of what [AppleTVController] reports
 * from MRP push events. MRP/Apple TV stays the single source of truth here:
 * this class never runs its own playback state machine, it only re-derives
 * [State] from the latest [NowPlaying] pushed via [update] and forwards
 * transport commands back into the controller through [CommandForwarder].
 */
@UnstableApi
class Media3PlaybackAdapter(
    private val forwarder: CommandForwarder,
) : SimpleBasePlayer(Looper.getMainLooper()) {

    interface CommandForwarder {
        fun setPlaying(playing: Boolean)
        fun seekTo(seconds: Double)
        fun skipBy(seconds: Double)
    }

    private var supportsSeek = false
    fun setSupportsSeek(supported: Boolean) {
        supportsSeek = supported
        invalidateState()
    }

    @Volatile private var nowPlaying: NowPlaying? = null

    val isActive: Boolean
        get() = nowPlaying?.isActive == true

    private fun derivedPlayWhenReady(np: NowPlaying?): Boolean = np?.playbackState == PlaybackState.PLAYING

    /** Diagnostics reads this instead of the inherited [getPlayWhenReady] to avoid depending on getState() having already run. */
    val lastPlayWhenReady: Boolean
        get() = derivedPlayWhenReady(nowPlaying)

    /** Called from AppleTVService's fan-out listener whenever MRP reports new now-playing state. */
    fun update(playing: NowPlaying?) {
        nowPlaying = playing
        invalidateState()
    }

    override fun getState(): State {
        val np = nowPlaying
        val mediaItem = MediaItem.Builder()
            .setMediaId(np?.title ?: np?.appName ?: "appletv-now-playing")
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(np?.title ?: np?.appName)
                    .setArtist(np?.artist)
                    .setAlbumTitle(np?.album)
                    .setArtworkData(np?.artwork, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
                    .build(),
            )
            .build()

        val durationUs = np?.duration?.takeIf { it.isFinite() && it > 0 }?.let { (it * 1_000_000).toLong() }
            ?: androidx.media3.common.C.TIME_UNSET
        val positionMs = np?.elapsedTime?.takeIf { it.isFinite() && it >= 0 }?.let { (it * 1000).toLong() } ?: 0L

        val itemData = MediaItemData.Builder(MEDIA_ITEM_UID)
            .setMediaItem(mediaItem)
            .setDurationUs(durationUs)
            .build()

        val availableCommands = Player.Commands.Builder()
            .addAll(
                Player.COMMAND_PLAY_PAUSE,
                Player.COMMAND_GET_METADATA,
                Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
                Player.COMMAND_GET_TIMELINE,
            )
            .apply {
                if (supportsSeek) addAll(Player.COMMAND_SEEK_BACK, Player.COMMAND_SEEK_FORWARD, Player.COMMAND_SEEK_TO_MEDIA_ITEM)
            }
            .build()

        return State.Builder()
            .setDeviceInfo(DeviceInfo.Builder(DeviceInfo.PLAYBACK_TYPE_REMOTE).build())
            .setAvailableCommands(availableCommands)
            .setPlaylist(listOf(itemData))
            .setPlayWhenReady(derivedPlayWhenReady(np), Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .setPlaybackState(if (np?.isActive == true) Player.STATE_READY else Player.STATE_IDLE)
            .setContentPositionMs(positionMs)
            .build()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        if (playWhenReady != lastPlayWhenReady) forwarder.setPlaying(playWhenReady)
        return Futures.immediateVoidFuture()
    }

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, @Player.Command seekCommand: Int): ListenableFuture<*> {
        when (seekCommand) {
            Player.COMMAND_SEEK_BACK -> forwarder.skipBy(-10.0)
            Player.COMMAND_SEEK_FORWARD -> forwarder.skipBy(10.0)
            else -> forwarder.seekTo(positionMs / 1000.0)
        }
        return Futures.immediateVoidFuture()
    }

    companion object {
        private const val MEDIA_ITEM_UID = "appletv-now-playing"
    }
}
