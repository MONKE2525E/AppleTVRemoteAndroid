package dev.atvremote.protocol.mrp

/**
 * MRP protocol message and extension field numbers.
 *
 * A ProtocolMessage carries its payload in an extension field whose number
 * differs from the type enum, so both are needed to build or match a message.
 */
object Mrp {
    // ProtocolMessage fields
    const val FIELD_TYPE = 1
    const val FIELD_IDENTIFIER = 2
    const val FIELD_UNIQUE_IDENTIFIER = 85

    // Message types
    const val TYPE_SET_STATE = 4
    const val TYPE_DEVICE_INFO = 15
    const val TYPE_CLIENT_UPDATES_CONFIG = 16
    const val TYPE_SET_CONNECTION_STATE = 38
    const val TYPE_SET_NOW_PLAYING_CLIENT = 46
    const val TYPE_UPDATE_CONTENT_ITEM = 56

    // Extension field numbers on ProtocolMessage
    const val EXT_SET_STATE = 9
    const val EXT_DEVICE_INFO = 20
    const val EXT_CLIENT_UPDATES_CONFIG = 21
    const val EXT_SET_CONNECTION_STATE = 42
    const val EXT_SET_NOW_PLAYING_CLIENT = 50
    const val EXT_UPDATE_CONTENT_ITEM = 60

    // SetStateMessage
    const val STATE_NOW_PLAYING_INFO = 1
    const val STATE_PLAYBACK_QUEUE = 3
    const val STATE_DISPLAY_NAME = 5
    const val STATE_PLAYBACK_STATE = 6
    const val STATE_PLAYER_PATH = 9

    // PlaybackQueue
    const val QUEUE_LOCATION = 1
    const val QUEUE_CONTENT_ITEMS = 2

    // PlayerPath / NowPlayingClient.
    // NB: field 1 is `origin`, not the client — reading that yields the
    // device's own name for every app and collapses all players into one.
    const val PATH_CLIENT = 2
    const val CLIENT_BUNDLE_ID = 2
    const val CLIENT_DISPLAY_NAME = 7

    // SetNowPlayingClientMessage
    const val SNPC_CLIENT = 1

    // NowPlayingInfo
    const val NP_ALBUM = 1
    const val NP_ARTIST = 2
    const val NP_DURATION = 3
    const val NP_ELAPSED = 4
    const val NP_TITLE = 9

    // ContentItem / ContentItemMetadata
    const val CI_METADATA = 2
    const val CI_ARTWORK_DATA = 3
    const val META_TITLE = 1
    const val META_SUBTITLE = 2
    const val META_ALBUM = 6
    const val META_TRACK_ARTIST = 7
    // The playhead rides on the content item; nowPlayingInfo rarely carries it.
    // Field 12 is releaseDate, which is also a double and so decodes without
    // complaint — the reason this was worth checking against pyatv's
    // ContentItemMetadata rather than inferring.
    const val META_ELAPSED = 35
    const val META_DURATION = 14

    /**
     * DEVICE_INFO must be the very first message sent; the device stays silent
     * until it arrives.
     */
    fun deviceInfo(clientId: String, name: String): ByteArray {
        val info = Protobuf.Builder()
            .string(1, clientId)             // uniqueIdentifier
            .string(2, name)                 // name
            .string(3, "iPhone")             // localizedModelName
            .string(4, "20H19")              // systemBuildVersion
            .string(5, "com.apple.TVRemote") // applicationBundleIdentifier
            .string(6, "344.28")             // applicationBundleVersion
            .varint(7, 1)                    // protocolVersion
            .varint(8, 108)                  // lastSupportedMessageType
            .bool(9, true)                   // supportsSystemPairing
            .bool(10, true)                  // allowsPairing
            .string(12, "com.apple.TVMusic") // systemMediaApplication
            .bool(13, true)                  // supportsACL
            .bool(14, true)                  // supportsSharedQueue
            .bool(15, true)                  // supportsExtendedMotion
            .varint(17, 2)                   // sharedQueueVersion
            .varint(21, 1)                   // deviceClass: iPhone
            .varint(22, 1)                   // logicalDeviceCount
            .build()

        return Protobuf.Builder()
            .varint(FIELD_TYPE, TYPE_DEVICE_INFO.toLong())
            .string(FIELD_IDENTIFIER, "device-info")
            .bytes(EXT_DEVICE_INFO, info)
            .build()
    }

    fun setConnectionState(): ByteArray = Protobuf.Builder()
        .varint(FIELD_TYPE, TYPE_SET_CONNECTION_STATE.toLong())
        .bytes(
            EXT_SET_CONNECTION_STATE,
            Protobuf.Builder().varint(1, 2).build(), // Connected
        )
        .build()

    fun transportCommand(command: Int): ByteArray = Protobuf.Builder()
        .varint(FIELD_TYPE, 1).bytes(6, Protobuf.Builder().varint(1, command.toLong()).build()).build()

    fun hidVolume(usage: Int, down: Boolean): ByteArray {
        val prefix = "438922cf080200000000000000000000010000000000000002000000200000000300000001000000000000"
            .chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val data = prefix + byteArrayOf(0, 12, 0, usage.toByte(), 0, if (down) 1 else 0) +
            byteArrayOf(0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0)
        return Protobuf.Builder().varint(FIELD_TYPE, 8)
            .bytes(13, Protobuf.Builder().bytes(1, data).build()).build()
    }

    fun getVolume(uid: String): ByteArray = Protobuf.Builder()
        .varint(FIELD_TYPE, 49).bytes(53, Protobuf.Builder().string(1, uid).build()).build()

    fun setVolume(uid: String, level: Double): ByteArray = Protobuf.Builder()
        .varint(FIELD_TYPE, 51).bytes(55, Protobuf.Builder().float(1, level.toFloat())
            .string(2, uid).build()).build()

    fun setOutputDevice(uid: String): ByteArray = Protobuf.Builder()
        .varint(FIELD_TYPE, 48).bytes(52, Protobuf.Builder().varint(1, 1)
            .string(4, uid).string(7, uid).build()).build()

    fun playbackQueueArtwork(location: Int, identifier: String): ByteArray = Protobuf.Builder()
        .varint(FIELD_TYPE, 32)
        .string(FIELD_IDENTIFIER, identifier)
        .bytes(37, Protobuf.Builder().varint(1, location.toLong()).varint(2, 1)
            .double(4, 1024.0).double(5, 1024.0).bool(13, true).build())
        .build()

    /** Ask the device to push now-playing and artwork updates. */
    fun clientUpdatesConfig(): ByteArray = Protobuf.Builder()
        .varint(FIELD_TYPE, TYPE_CLIENT_UPDATES_CONFIG.toLong())
        .string(FIELD_IDENTIFIER, "updates-config")
        .bytes(
            EXT_CLIENT_UPDATES_CONFIG,
            Protobuf.Builder()
                .bool(1, true)  // artworkUpdates
                .bool(2, true)  // nowPlayingUpdates
                .bool(3, true)  // volumeUpdates
                .bool(4, true)  // keyboardUpdates
                .bool(5, true)  // outputDeviceUpdates
                .build(),
        )
        .build()
}

enum class PlaybackState(val code: Int) {
    UNKNOWN(0),
    PLAYING(1),
    PAUSED(2),
    STOPPED(3),
    INTERRUPTED(4),
    SEEKING(5);

    companion object {
        fun from(code: Long?): PlaybackState =
            entries.firstOrNull { it.code.toLong() == code } ?: UNKNOWN
    }
}

/** What is currently playing on the device. */
data class NowPlaying(
    val title: String? = null,
    val artist: String? = null,
    val album: String? = null,
    val appName: String? = null,
    val playbackState: PlaybackState = PlaybackState.UNKNOWN,
    val duration: Double? = null,
    val elapsedTime: Double? = null,
    val artwork: ByteArray? = null,
) {
    val isActive: Boolean
        get() = title != null || artist != null || playbackState != PlaybackState.UNKNOWN

    /**
     * Playhead and length, or null when the device has not reported a usable
     * pair. Live streams report no duration, and a stale elapsed time from the
     * previous item would otherwise draw a bogus scrubber.
     */
    val position: Pair<Double, Double>?
        get() {
            val total = duration?.takeIf { it.isFinite() && it > 0 } ?: return null
            val elapsed = elapsedTime?.takeIf { it.isFinite() && it >= 0 } ?: return null
            return elapsed.coerceAtMost(total) to total
        }

    fun describe(): String = buildString {
        append(playbackState.name)
        title?.let { append(" — \"$it\"") }
        artist?.let { append(" by $it") }
        album?.let { append(" [$it]") }
        appName?.let { append(" ($it)") }
        if (duration != null && elapsedTime != null) {
            append("  ${fmt(elapsedTime)}/${fmt(duration)}")
        }
        artwork?.let { append("  artwork=${it.size}B") }
    }

    private fun fmt(seconds: Double): String {
        val total = seconds.toInt()
        return "%d:%02d".format(total / 60, total % 60)
    }

    override fun equals(other: Any?): Boolean =
        other is NowPlaying && title == other.title && artist == other.artist &&
            album == other.album && appName == other.appName &&
            playbackState == other.playbackState &&
            duration == other.duration && elapsedTime == other.elapsedTime &&
            (artwork?.contentEquals(other.artwork) ?: (other.artwork == null))

    override fun hashCode(): Int =
        listOf(title, artist, album, appName, playbackState, duration, elapsedTime).hashCode()
}
