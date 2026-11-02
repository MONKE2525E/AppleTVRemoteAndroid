package dev.atvremote.protocol.discovery

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DeviceDiscoveryTest {
    @Test fun parsesCompanionAndHomePod() {
        val tv = deviceFromService("TV", "1.2.3.4", 1234, COMPANION_SERVICE_TYPE, mapOf("rpMd" to "AppleTV14,1", "rpMRtID" to "stable"))
        assertEquals(DeviceKind.APPLE_TV, tv.kind)
        assertEquals("stable", tv.credentialKey)
        assertTrue(tv.controllable)
        val speaker = deviceFromService("Speaker", "1.2.3.5", 7000, "_airplay._tcp.", mapOf("model" to "AudioAccessory5,1", "deviceid" to "aa:bb"))
        assertEquals(DeviceKind.HOMEPOD, speaker.kind)
        assertEquals("aa:bb", speaker.credentialKey)
        assertFalse(speaker.controllable)
    }

    @Test fun classifiesOtherReceiversAndRoku() {
        val receiver = deviceFromService("Receiver", "1", 7000, "_airplay._tcp", mapOf("pi" to "receiver"))
        assertEquals(DeviceKind.AIRPLAY, receiver.kind)
        assertFalse(receiver.controllable)
        val cast = deviceFromService("Cast", "2", 8009, "_googlecast._tcp", mapOf("id" to "abc", "md" to "Chromecast"))
        assertEquals("cast:abc", cast.credentialKey)
        assertEquals(DeviceKind.ANDROID_TV, cast.kind)
        assertFalse(cast.controllable)
        assertTrue(AppleTvDevice("Roku", "3", 8060, identifier = "roku:123").controllable)
        assertEquals(DeviceKind.ROKU, classifyDevice(null, "roku:123"))
    }
}
