package com.privateremote.appletv.appletv

import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.PlaybackState
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.net.ServerSocket
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.io.IOException
import androidx.test.platform.app.InstrumentationRegistry
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.MulticastSocket

/** Runs on Android's XML implementation, which differs from the host JVM. */
class RokuAndroidTest {
    private val deviceInfo = """
        <?xml version="1.0" encoding="UTF-8"?>
        <device-info><serial-number>test-roku</serial-number>
        <user-device-name>Test Roku</user-device-name><model-name>TV</model-name></device-info>
    """.trimIndent()

    @Test fun deviceIdentityParsesOnAndroid() {
        val device = RokuRemote.parseDevice(deviceInfo, "192.168.1.10")
        assertEquals("Test Roku", device.name)
        assertTrue(device.isRoku)
    }

    @Test fun playbackParsesOnAndroid() {
        val playback = RokuRemote.parsePlayback("<player state=\"play\"><position>12000 ms</position></player>")
        assertEquals(PlaybackState.PLAYING, playback.playbackState)
        assertEquals(12.0, playback.elapsedTime!!, 0.0)
    }

    @Test fun documentTypesAreRejectedOnAndroid() {
        val xml = "<!DOCTYPE device-info [<!ENTITY serial 'injected'>]><device-info><serial-number>&serial;</serial-number></device-info>"
        assertThrows(IOException::class.java) { RokuRemote.parseDevice(xml, "192.168.1.10") }
    }

    @Test fun discoveryProbeCanVerifyAnEcpResponseOnAndroid() = runBlocking {
        val executor = Executors.newSingleThreadExecutor()
        ServerSocket(8060).use { server ->
            server.soTimeout = 5000
            val response = executor.submit {
                server.accept().use { client ->
                    client.soTimeout = 5000
                    val input = client.getInputStream().bufferedReader()
                    assertEquals("GET /query/device-info HTTP/1.1", input.readLine())
                    while (!input.readLine().isNullOrEmpty()) { }
                    val body = deviceInfo.toByteArray(Charsets.UTF_8)
                    client.getOutputStream().apply {
                        write("HTTP/1.1 200 OK\r\nContent-Type: text/xml\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray())
                        write(body)
                        flush()
                    }
                }
            }
            try {
                val probe = AppleTvDevice("Roku", "127.0.0.1", 8060, identifier = "roku:probe")
                assertEquals("roku:test-roku", RokuRemote(probe).verify().identifier)
                response.get(5, TimeUnit.SECONDS)
                Unit
            } finally {
                executor.shutdownNow()
            }
        }
    }

    @Test fun ssdpDiscoveryPublishesVerifiedRokuOnAndroid() = runBlocking {
        val executor = Executors.newFixedThreadPool(2)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val lock = (context.getSystemService(android.content.Context.WIFI_SERVICE) as android.net.wifi.WifiManager)
            .createMulticastLock("roku-test-responder").apply { acquire() }
        try {
            ServerSocket(8060).use { http ->
                http.soTimeout = 10000
                MulticastSocket(1900).use { ssdp ->
                    ssdp.soTimeout = 10000
                    @Suppress("DEPRECATION")
                    ssdp.joinGroup(InetAddress.getByName("239.255.255.250"))
                    val reply = executor.submit {
                        val packet = DatagramPacket(ByteArray(8192), 8192)
                        ssdp.receive(packet)
                        val body = "HTTP/1.1 200 OK\r\nST: roku:ecp\r\n\r\n".toByteArray()
                        ssdp.send(DatagramPacket(body, body.size, packet.address, packet.port))
                    }
                    val response = executor.submit {
                        http.accept().use { client ->
                            client.soTimeout = 5000
                            val input = client.getInputStream().bufferedReader()
                            assertEquals("GET /query/device-info HTTP/1.1", input.readLine())
                            while (!input.readLine().isNullOrEmpty()) { }
                            val body = deviceInfo.toByteArray(Charsets.UTF_8)
                            client.getOutputStream().apply {
                                write("HTTP/1.1 200 OK\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray())
                                write(body)
                                flush()
                            }
                        }
                    }
                    val found = mutableListOf<AppleTvDevice>()
                    RokuDiscovery(context).scan(3000) { found.add(it) }
                    reply.get(10, TimeUnit.SECONDS)
                    response.get(10, TimeUnit.SECONDS)
                    assertEquals(listOf("roku:test-roku"), found.map { it.identifier })
                }
            }
        } finally {
            executor.shutdownNow()
            lock.release()
        }
    }
}
