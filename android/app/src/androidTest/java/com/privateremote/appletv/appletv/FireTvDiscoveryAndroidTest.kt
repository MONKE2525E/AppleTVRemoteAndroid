package com.privateremote.appletv.appletv

import org.junit.Assert.*
import org.junit.Test

class FireTvDiscoveryAndroidTest {
    @Test fun parsesDescriptionsAndRejectsDocumentTypes() {
        val description = "<root><device><friendlyName>TV</friendlyName><UDN>uuid:test</UDN></device></root>"
        val service = "<service><name>FireTVRemote</name><state>stopped</state></service>"
        assertEquals("firetv:dial:uuid:test", parseFireTvDescription(description.toByteArray(), "192.168.1.5")?.identifier)
        assertTrue(isFireTvRemoteService(service.toByteArray()))
        assertNull(parseFireTvDescription(("<!DOCTYPE root>" + description).toByteArray(), "192.168.1.5"))
        assertFalse(isFireTvRemoteService(("<!DOCTYPE service>" + service).toByteArray()))
        assertNull(parseFireTvDescription(("<!DOCTYPE root>" + description).toByteArray(Charsets.UTF_16), "192.168.1.5"))
    }
}
