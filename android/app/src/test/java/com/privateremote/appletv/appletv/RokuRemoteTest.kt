package com.privateremote.appletv.appletv

import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.PlaybackState
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.IOException
import java.net.ServerSocket
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class RokuRemoteTest {
    @Test fun `document types cannot introduce entities into Roku responses`() {
        val xml = "<!DOCTYPE device-info [<!ENTITY serial 'injected'>]><device-info><serial-number>&serial;</serial-number></device-info>"
        assertThrows(IOException::class.java) { RokuRemote.parseDevice(xml, "192.168.1.10") }
    }

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

    @Test fun `Roku channels and TV inputs parse into launchable apps`() {
        val apps = RokuRemote.parseApps("""
            <apps>
                <app id="12" type="appl" version="5.2.0">Netflix</app>
                <app id="tvinput.hdmi1" type="tvin" version="1.0.0">HDMI 1</app>
                <app id="" type="appl" version="1.0.0">Broken</app>
            </apps>
        """.trimIndent())
        assertEquals(listOf("12" to "Netflix", "tvinput.hdmi1" to "HDMI 1"), apps.map { it.bundleId to it.name })
    }

    @Test fun `Roku HTTP errors retain their status and permission message`() {
        val server = ServerSocket(0)
        val executor = Executors.newSingleThreadExecutor()
        try {
            val responseSent = executor.submit {
                server.accept().use { client ->
                    val request = client.getInputStream().bufferedReader()
                    while (request.readLine()?.isNotEmpty() == true) { }
                    client.getOutputStream().apply {
                        write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
                        flush()
                    }
                }
            }
            val device = AppleTvDevice("Roku", "127.0.0.1", server.localPort, identifier = "roku:test")
            val error = assertThrows(RokuHttpException::class.java) {
                runBlocking { RokuRemote(device, server.localPort).verify() }
            }
            responseSent.get(3, TimeUnit.SECONDS)
            assertEquals(403, error.statusCode)
            assertEquals(
                "Enable Control by mobile apps in your Roku's advanced system settings.",
                error.message,
            )
        } finally {
            server.close()
            executor.shutdownNow()
        }
    }
}
