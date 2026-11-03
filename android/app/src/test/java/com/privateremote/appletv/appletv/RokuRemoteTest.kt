package com.privateremote.appletv.appletv

import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.PlaybackState
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.TimeoutCancellationException
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.IOException
import java.net.ServerSocket
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class RokuRemoteTest {
    @Test fun `text sends encoded characters and backspace in order`() {
        val server = ServerSocket(0)
        val executor = Executors.newSingleThreadExecutor()
        try {
            val requests = executor.submit<List<String>> {
                (1..5).map {
                    server.accept().use { client ->
                        val input = client.getInputStream().bufferedReader()
                        val firstLine = requireNotNull(input.readLine())
                        val headers = generateSequence { input.readLine()?.takeIf(String::isNotEmpty) }.toList()
                        assertTrue(headers.any { it.equals("Connection: close", ignoreCase = true) })
                        client.getOutputStream().apply {
                            write("HTTP/1.0 200 OK\r\nContent-Length: 0\r\n\r\n".toByteArray())
                            flush()
                        }
                        firstLine
                    }
                }
            }
            val device = AppleTvDevice("Roku", "127.0.0.1", server.localPort, identifier = "roku:test")
            runBlocking {
                val remote = RokuRemote(device, server.localPort)
                remote.sendText("a /€")
                remote.press("BACKSPACE")
            }
            assertEquals(listOf(
                "POST /keypress/Lit_a HTTP/1.1", "POST /keypress/Lit_%20 HTTP/1.1",
                "POST /keypress/Lit_%2F HTTP/1.1", "POST /keypress/Lit_%E2%82%AC HTTP/1.1",
                "POST /keypress/Backspace HTTP/1.1",
            ), requests.get(3, TimeUnit.SECONDS))
        } finally {
            server.close()
            executor.shutdownNow()
        }
    }

    @Test fun `cancelling a Roku request interrupts an incomplete HTTP header`() {
        ServerSocket(0).use { server ->
            val executor = Executors.newSingleThreadExecutor()
            try {
                val response = executor.submit {
                    server.accept().use { client ->
                        val request = client.getInputStream().bufferedReader()
                        while (request.readLine()?.isNotEmpty() == true) { }
                        client.getOutputStream().apply { write("HTTP/1.1 200 OK\r\nX-Wait: ".toByteArray()); flush() }
                        client.getInputStream().read()
                    }
                }
                val device = AppleTvDevice("Roku", "127.0.0.1", server.localPort, identifier = "roku:test")
                assertThrows(TimeoutCancellationException::class.java) {
                    runBlocking { withTimeout(500) { RokuRemote(device, server.localPort).verify() } }
                }
                response.get(3, TimeUnit.SECONDS)
            } finally { executor.shutdownNow() }
        }
    }

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

    @Test fun `runtime supplies missing duration for on demand playback`() {
        val state = RokuRemote.parsePlayback("<player state=\"play\"><position>120000 ms</position><duration>0 ms</duration><runtime>1800000 ms</runtime><is_live>false</is_live></player>")
        assertEquals(120.0, state.elapsedTime)
        assertEquals(1800.0, state.duration)
        val live = RokuRemote.parsePlayback("<player state=\"play\"><runtime>1800000 ms</runtime><is_live>true</is_live></player>")
        assertNull(live.duration)
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
