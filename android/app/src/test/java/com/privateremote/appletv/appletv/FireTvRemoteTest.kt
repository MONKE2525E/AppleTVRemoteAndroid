package com.privateremote.appletv.appletv

import dev.atvremote.protocol.discovery.AppleTvDevice
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class FireTvRemoteTest {
    @Test
    fun `pairing stores token and pinned certificate for authenticated navigation`() = runBlocking {
        val cert = HeldCertificate.Builder().commonName("Fire TV").build()
        val server = MockWebServer()
        server.useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(), false)
        server.start()
        try {
            repeat(4) { server.enqueue(MockResponse().setBody(if (it == 1) "{\"description\":\"test-token\"}" else "{}")) }
            val device = AppleTvDevice("Fire TV", "127.0.0.1", server.port, "Fire TV", "firetv:test")
            val pairing = FireTvRemote(device)
            pairing.startPairing()
            val (token, fingerprint) = pairing.completePairing("1234")
            val connected = FireTvRemote(device, fingerprint, token)
            connected.press("UP")
            assertEquals("/v1/FireTV/pin/display", server.takeRequest().path)
            assertEquals("/v1/FireTV/pin/verify", server.takeRequest().path)
            val down = server.takeRequest()
            val up = server.takeRequest()
            assertEquals("/v1/FireTV?action=dpad_up", down.path)
            assertEquals("test-token", down.getHeader("X-Client-Token"))
            assertEquals("{\"keyActionType\":\"keyDown\"}", down.body.readUtf8())
            assertEquals("{\"keyActionType\":\"keyUp\"}", up.body.readUtf8())
        } finally { server.shutdown() }
    }

    @Test
    fun `a different certificate cannot receive the stored token`() {
        val cert = HeldCertificate.Builder().commonName("Other receiver").build()
        val server = MockWebServer()
        server.useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(), false)
        server.start()
        try {
            val device = AppleTvDevice("Fire TV", "127.0.0.1", server.port, "Fire TV", "firetv:test")
            assertThrows(Exception::class.java) { runBlocking { FireTvRemote(device, "wrong", "secret").verify() } }
            assertEquals(0, server.requestCount)
        } finally { server.shutdown() }
    }
    @Test
    fun `a refused connection activates the remote service before retrying`() {
        val dial = MockWebServer()
        dial.start()
        dial.enqueue(MockResponse().setResponseCode(201))
        val unusedPort = java.net.ServerSocket(0).use { it.localPort }
        try {
            val device = AppleTvDevice("Fire TV", "127.0.0.1", unusedPort, "Fire TV", "firetv:test")
            assertThrows(java.io.IOException::class.java) {
                runBlocking { FireTvRemote(device, dialPort = dial.port).startPairing() }
            }
            val request = dial.takeRequest(2, java.util.concurrent.TimeUnit.SECONDS)!!
            assertEquals("POST", request.method)
            assertEquals("/apps/FireTVRemote", request.path)
        } finally { dial.shutdown() }
    }

    @Test
    fun `authentication rejection stops before sending key up`() {
        val cert = HeldCertificate.Builder().commonName("Fire TV").build()
        val server = MockWebServer()
        server.useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(), false)
        server.start()
        server.enqueue(MockResponse().setResponseCode(401))
        try {
            val device = AppleTvDevice("Fire TV", "127.0.0.1", server.port, "Fire TV", "firetv:test")
            assertThrows(FireTvAuthenticationException::class.java) { runBlocking { FireTvRemote(device, token = "expired").press("UP") } }
            assertEquals(1, server.requestCount)
        } finally { server.shutdown() }
    }

}
