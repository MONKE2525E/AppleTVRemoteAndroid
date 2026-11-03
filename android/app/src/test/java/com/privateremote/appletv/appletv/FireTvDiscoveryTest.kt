package com.privateremote.appletv.appletv

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.net.InetAddress

class FireTvDiscoveryTest {
    @Test fun `parses a Fire TV description with a stable identity`() {
        val xml = """<root><device><friendlyName>Living room</friendlyName><manufacturer>Amazon</manufacturer><modelName>AFTMA08C15</modelName><UDN>uuid:abc</UDN></device></root>"""
        val device = parseFireTvDescription(xml.toByteArray(), "192.168.1.5")!!
        assertEquals("firetv:dial:uuid:abc", device.identifier)
        assertEquals(8080, device.port)
        assertNotNull(parseFireTvDescription(xml.replace("Amazon", "TCL").replace("AFTMA08C15", "65S450F-CA").toByteArray(), "192.168.1.5"))
        assertNull(parseFireTvDescription(("<!DOCTYPE root>" + xml).toByteArray(), "192.168.1.5"))
        assertNull(parseFireTvDescription(xml.replace("<UDN>uuid:abc</UDN>", "").toByteArray(), "192.168.1.5"))
    }

    @Test fun `description URL must match the announcing address`() {
        val sender = InetAddress.getByName("192.168.1.5")
        assertNotNull(safeLocation("http://192.168.1.5:8009/description.xml", sender))
        assertNull(safeLocation("http://192.168.1.6/description.xml", sender))
        assertNull(safeLocation("http://example.com/description.xml", sender))
        assertNull(safeLocation("http://user@192.168.1.5/description.xml", sender))
    }
    @Test fun `discovery aliases retain the paired identity after an address change`() {
        val aliases = mutableMapOf<String, String>()
        fun resolver() = FireTvIdentities({ aliases[it] }, { id, canonical -> aliases[id] = canonical }, { false })
        fun device(id: String, address: String) = dev.atvremote.protocol.discovery.AppleTvDevice("TV", address, 8080, "Fire TV", id)
        val initial = resolver()
        assertEquals("firetv:mdns:service", initial.resolve(device("firetv:mdns:service", "192.168.1.5")).identifier)
        assertEquals("firetv:mdns:service", initial.resolve(device("firetv:dial:uuid", "192.168.1.5")).identifier)
        val afterRestart = resolver()
        val changed = afterRestart.resolve(device("firetv:dial:uuid", "192.168.1.7"))
        assertEquals("firetv:mdns:service", changed.identifier)
        assertEquals("192.168.1.7", changed.address)
    }

    @Test fun `address reuse in a later scan does not create an alias`() {
        val aliases = mutableMapOf<String, String>()
        fun resolver() = FireTvIdentities({ aliases[it] }, { id, canonical -> aliases[id] = canonical }, { false })
        fun device(id: String) = dev.atvremote.protocol.discovery.AppleTvDevice("TV", "192.168.1.5", 8080, "Fire TV", id)
        resolver().resolve(device("firetv:mdns:old"))
        val newTv = resolver().resolve(device("firetv:dial:new"))
        assertEquals("firetv:dial:new", newTv.identifier)
        assertNull(aliases["firetv:dial:new"])
    }

    @Test fun `paired identity wins regardless of discovery order`() {
        for (dialFirst in listOf(true, false)) {
            val aliases = mutableMapOf<String, String>()
            val dial = "firetv:dial:uuid:paired"
            val mdns = "firetv:mdns:paired"
            val resolver = FireTvIdentities({ aliases[it] }, { id, canonical -> aliases[id] = canonical }, { it == dial })
            fun device(id: String) = dev.atvremote.protocol.discovery.AppleTvDevice("TV", "192.168.1.5", 8080, "Fire TV", id)
            val order = if (dialFirst) listOf(dial, mdns) else listOf(mdns, dial)
            resolver.resolve(device(order[0]))
            assertEquals(dial, resolver.resolve(device(order[1])).identifier)
            assertEquals(dial, aliases[mdns])
            assertEquals(dial, aliases[dial])
        }
    }

    @Test fun `discovery verifies the Fire TV DIAL app for any television brand`() {
        val server = okhttp3.mockwebserver.MockWebServer()
        server.start()
        val description = """<root><device><manufacturer>TCL</manufacturer><modelName>65S450F-CA</modelName><UDN>uuid:test</UDN></device></root>"""
        val service = """<service xmlns="urn:dial-multiscreen-org:schemas:dial"><name>FireTVRemote</name><state>stopped</state></service>"""
        try {
            server.enqueue(okhttp3.mockwebserver.MockResponse().setBody(description))
            server.enqueue(okhttp3.mockwebserver.MockResponse().setBody(service))
            assertNotNull(readFireTvDevice(server.url("/description.xml").toUrl(), server.port))
            assertEquals("/description.xml", server.takeRequest().path)
            assertEquals("/apps/FireTVRemote", server.takeRequest().path)
            server.enqueue(okhttp3.mockwebserver.MockResponse().setBody(description))
            server.enqueue(okhttp3.mockwebserver.MockResponse().setResponseCode(404))
            assertNull(readFireTvDevice(server.url("/description.xml").toUrl(), server.port))
            assertFalse(isFireTvRemoteService("<service><name>Other</name></service>".toByteArray()))
        } finally { server.shutdown() }
    }

}
