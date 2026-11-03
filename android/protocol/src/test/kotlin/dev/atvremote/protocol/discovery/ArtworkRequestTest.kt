package dev.atvremote.protocol.discovery

import dev.atvremote.protocol.mrp.Mrp
import dev.atvremote.protocol.mrp.Protobuf
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ArtworkRequestTest {
    @Test fun requestsLargeArtworkForSelectedQueueItem() {
        val message = Protobuf.decode(Mrp.playbackQueueArtwork(3, "request-id"))
        assertEquals(32, message.varint(Mrp.FIELD_TYPE)?.toInt())
        assertEquals("request-id", message.string(Mrp.FIELD_IDENTIFIER))
        val request = requireNotNull(message.message(37))
        assertEquals(3, request.varint(1)?.toInt())
        assertEquals(1024.0, request.double(4))
        assertEquals(1024.0, request.double(5))
        assertTrue(request.bool(13) == true)
    }
}
