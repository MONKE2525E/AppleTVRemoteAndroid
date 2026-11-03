package com.privateremote.appletv.appletv

import java.net.InetAddress
import java.net.Inet4Address
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.TimeUnit

class FireTvSubnetDiscoveryTest {
    @Test fun `limits candidates to the current local subnet`() {
        val address = InetAddress.getByName("192.168.0.187") as Inet4Address
        val all = subnetCandidates(address, 24)
        assertEquals(253, all.size)
        assertTrue(all.contains("192.168.0.169"))
        assertFalse(all.contains("192.168.0.187"))
        assertEquals(listOf("192.168.0.185", "192.168.0.186"), subnetCandidates(address, 30))
        assertTrue(subnetCandidates(InetAddress.getByName("8.8.8.8") as Inet4Address, 24).isEmpty())
        assertEquals(253, subnetCandidates(address, 16).size)
    }

    @Test fun `verifies DIAL service and uses the remote certificate for identity`() = runBlocking {
        val dial = MockWebServer()
        val remote = MockWebServer()
        val cert = HeldCertificate.Builder().commonName("Fire TV").build()
        remote.useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(), false)
        dial.start()
        remote.start()
        try {
            dial.enqueue(MockResponse().setBody("<service><name>FireTVRemote</name></service>"))
            val device = probeFireTv("127.0.0.1", dial.port, remote.port)!!
            assertTrue(device.identifier!!.startsWith("firetv:cert:"))
            val get = dial.takeRequest()
            assertEquals("/apps/FireTVRemote", get.path)
            assertEquals("GET", get.method)
            assertEquals(1, dial.requestCount)
        } finally { dial.shutdown(); remote.shutdown() }
    }
    @Test fun `trickling responses and cancellation cannot block a probe`() = runBlocking {
        val dial = MockWebServer()
        dial.start()
        try {
            dial.enqueue(MockResponse().setBody("<service>" + "x".repeat(100) + "</service>").throttleBody(1, 100, TimeUnit.MILLISECONDS))
            val start = System.nanoTime()
            assertNull(probeFireTv("127.0.0.1", dial.port))
            assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 4000)
            dial.enqueue(MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.NO_RESPONSE))
            val cancelledAt = System.nanoTime()
            assertNull(withTimeoutOrNull(200) { probeFireTv("127.0.0.1", dial.port) })
            assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - cancelledAt) < 2000)
        } finally { dial.shutdown() }
    }

    @Test fun `advertised service without a certificate can be activated and reconciled`() = runBlocking {
        val dial = MockWebServer()
        val remote = MockWebServer()
        val cert = HeldCertificate.Builder().commonName("Fire TV").build()
        remote.useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(), false)
        dial.start()
        remote.start()
        try {
            val service = "<service><name>FireTVRemote</name></service>"
            dial.enqueue(MockResponse().setBody(service))
            remote.enqueue(MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.FAIL_HANDSHAKE))
            assertNull(probeFireTv("127.0.0.1", dial.port, remote.port, allowActivation = false))
            assertEquals(1, dial.requestCount)

            dial.enqueue(MockResponse().setBody(service))
            dial.enqueue(MockResponse().setResponseCode(200))
            remote.enqueue(MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.FAIL_HANDSHAKE))
            val activated = probeFireTv("127.0.0.1", dial.port, remote.port)!!
            assertTrue(activated.identifier!!.startsWith("firetv:cert:"))
            assertEquals("GET", dial.takeRequest().method)
            assertEquals("GET", dial.takeRequest().method)
            assertEquals("POST", dial.takeRequest().method)

            val advertised = activated.copy(name = "Living room", identifier = "firetv:dial:uuid:test")
            val aliases = mutableMapOf<String, String>()
            val resolver = FireTvIdentities({ aliases[it] }, { id, canonical -> aliases[id] = canonical }, { it == activated.identifier })
            resolver.resolve(advertised)
            assertEquals(activated.identifier, resolver.resolve(activated).identifier)
            assertEquals(activated.identifier, aliases[advertised.identifier])
        } finally { dial.shutdown(); remote.shutdown() }
    }

}
