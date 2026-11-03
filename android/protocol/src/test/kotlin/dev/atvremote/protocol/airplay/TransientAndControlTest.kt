package dev.atvremote.protocol.airplay

import dev.atvremote.protocol.crypto.Crypto
import dev.atvremote.protocol.crypto.Srp
import dev.atvremote.protocol.hap.HapException
import dev.atvremote.protocol.hap.PairSetupSession
import dev.atvremote.protocol.hap.TlvValue
import dev.atvremote.protocol.mrp.MrpControl
import dev.atvremote.protocol.mrp.Protobuf
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull

class TransientAndControlTest {
    @Test fun transientM1ToM4AndKeyDerivation() {
        val srp = Srp(clientPrivate = ByteArray(32) { it.toByte() })
        val pairing = PairSetupSession(transient = true, srpOverride = srp)
        val first = pairing.startRequest()
        assertContentEquals(byteArrayOf(0x10), first[TlvValue.FLAGS])
        assertContentEquals(byteArrayOf(1), first[TlvValue.SEQ_NO])
        val third = pairing.proofRequest(mapOf(TlvValue.SALT to ByteArray(16) { it.toByte() }, TlvValue.PUBLIC_KEY to ByteArray(384) { 7 }), "3939")
        assertContentEquals(byteArrayOf(3), third[TlvValue.SEQ_NO])
        assertContentEquals(srp.proof, third[TlvValue.PROOF])
        assertFailsWith<HapException> { pairing.finishTransient(mapOf(TlvValue.PROOF to ByteArray(64))) }
        val proof = Crypto.sha512(Srp.minimalBytes(srp.clientPublic), srp.proof, srp.sessionKey)
        val keys = pairing.finishTransient(mapOf(TlvValue.SEQ_NO to byteArrayOf(4), TlvValue.PROOF to proof))
        assertContentEquals(Crypto.hkdf("salt", "out", srp.sessionKey), keys.encryptionKeys("salt", "out", "in").first)
    }

    @Test fun fakeChannelReceivesTransportVolumeAndClusterAwareRouting() {
        val messages = mutableListOf<ByteArray>()
        val control = MrpControl { messages.add(it) }
        control.command(3)
        control.setVolume("speaker", 0.5)
        control.volumeStep(true)
        control.setOutputDevice("target-uid")
        val expectedRouting = "0830a2031a0801220a7461726765742d7569643a0a7461726765742d756964"
            .chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        assertContentEquals(expectedRouting, messages[4])
        val decoded = messages.map(Protobuf::decode)
        assertEquals(listOf(1L, 51L, 8L, 8L, 48L), decoded.map { it.varint(1) })
        assertEquals(3L, decoded[0].message(6)?.varint(1))
        assertEquals(0.5, decoded[1].message(55)?.double(1))
        assertEquals("speaker", decoded[1].message(55)?.string(2))
        val down = assertNotNull(decoded[2].message(13)?.bytes(1))
        val up = assertNotNull(decoded[3].message(13)?.bytes(1))
        assertEquals(1, down[down.size - 12].toInt())
        assertEquals(0, up[up.size - 12].toInt())
        val route = assertNotNull(decoded[4].message(52))
        assertEquals(1L, route.varint(1))
        assertEquals("target-uid", route.string(4))
        assertEquals("target-uid", route.string(7))
    }
}
