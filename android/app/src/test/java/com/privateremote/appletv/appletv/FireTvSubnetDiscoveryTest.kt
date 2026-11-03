package com.privateremote.appletv.appletv

import java.net.InetAddress
import java.net.Inet4Address
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

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

    @Test fun `verifies DIAL service and uses the remote certificate for identity`() {
        val dial = MockWebServer()
        val remote = MockWebServer()
        val cert = HeldCertificate.Builder().commonName("Fire TV").build()
        remote.useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(), false)
        dial.start()
        remote.start()
        try {
            dial.enqueue(MockResponse().setBody("<service><name>FireTVRemote</name></service>"))
            dial.enqueue(MockResponse().setResponseCode(201))
            val device = probeFireTv("127.0.0.1", dial.port, remote.port)!!
            assertTrue(device.identifier!!.startsWith("firetv:cert:"))
            val get = dial.takeRequest()
            val post = dial.takeRequest()
            assertEquals("/apps/FireTVRemote", get.path)
            assertEquals("GET", get.method)
            assertEquals("/apps/FireTVRemote", post.path)
            assertEquals("POST", post.method)
        } finally { dial.shutdown(); remote.shutdown() }
    }
}
