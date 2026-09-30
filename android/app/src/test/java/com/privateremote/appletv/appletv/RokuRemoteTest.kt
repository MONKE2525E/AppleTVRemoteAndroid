package com.privateremote.appletv.appletv

import dev.atvremote.protocol.mrp.PlaybackState
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class RokuRemoteTest {
    @Test fun `Roku playback state and millisecond timing match ECP responses`() {
        val playing = RokuRemote.parsePlayback("""
            <player state="play"><plugin name="Example channel"/><position>12000 ms</position><duration>60000 ms</duration></player>
        """.trimIndent())
        assertEquals(PlaybackState.PLAYING, playing.playbackState)
        assertEquals(12.0, playing.elapsedTime)
        assertEquals(60.0, playing.duration)
        assertEquals("Example channel", playing.appName)
        assertNull(playing.title)
        assertEquals(PlaybackState.PAUSED, RokuRemote.parsePlayback("<player state=\"pause\"/>").playbackState)
        assertEquals(PlaybackState.STOPPED, RokuRemote.parsePlayback("<player state=\"none\"/>").playbackState)
    }

    @Test fun `invalid timing cannot appear as a media position`() {
        val state = RokuRemote.parsePlayback("<player state=\"play\"><position>NaN ms</position><duration>-5 ms</duration></player>")
        assertNull(state.elapsedTime)
        assertNull(state.duration)
    }

    @Test fun `Roku identity survives an address change and selects the Roku transport`() {
        val xml = "<device-info><serial-number>1234</serial-number><user-device-name>Bedroom</user-device-name><model-name>TV</model-name></device-info>"
        val first = RokuRemote.parseDevice(xml, "192.168.1.10")
        val moved = RokuRemote.parseDevice(xml, "192.168.1.11")
        assertTrue(first.isRoku)
        assertEquals(first.credentialKey, moved.credentialKey)
        assertEquals("Bedroom", first.name)
        assertEquals(8060, first.port)
    }
}
