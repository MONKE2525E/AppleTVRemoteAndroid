package com.privateremote.appletv.appletv

import org.junit.Assert.*
import org.junit.Test

class FireTvDiscoveryAndroidTest {
    @Test fun parsesDescriptionsAndRejectsDocumentTypes() {
        val description = "<root><device><friendlyName>TV</friendlyName><UDN>uuid:test</UDN></device></root>"
        val service = "<service><name>FireTVRemote</name><state>stopped</state></service>"
        assertEquals("firetv:dial:uuid:test", parseFireTvDescription(description.toByteArray(), "192.168.1.5")?.identifier)
        assertTrue(isFireTvRemoteService(service.toByteArray()))
        for (charset in listOf(Charsets.UTF_16, Charsets.UTF_16LE, Charsets.UTF_16BE)) {
            assertEquals("firetv:dial:uuid:test", parseFireTvDescription(description.toByteArray(charset), "192.168.1.5")?.identifier)
            assertTrue(isFireTvRemoteService(service.toByteArray(charset)))
            assertNull(parseFireTvDescription(("<!DOCTYPE root>" + description).toByteArray(charset), "192.168.1.5"))
        }
        val latin = "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><root><device><friendlyName>Café</friendlyName><UDN>uuid:test</UDN></device></root>"
        assertEquals("Café", parseFireTvDescription(latin.toByteArray(Charsets.ISO_8859_1), "192.168.1.5")?.name)
        assertNull(parseFireTvDescription(("<!DOCTYPE root>" + description).toByteArray(), "192.168.1.5"))
        assertFalse(isFireTvRemoteService(("<!DOCTYPE service>" + service).toByteArray()))
        assertNull(parseFireTvDescription(("<!DOCTYPE root>" + description).toByteArray(Charsets.UTF_16), "192.168.1.5"))
    }
}
