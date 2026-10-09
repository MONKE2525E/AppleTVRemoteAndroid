package com.privateremote.appletv.appletv

import androidx.test.platform.app.InstrumentationRegistry
import dev.atvremote.protocol.companion.FrameType
import dev.atvremote.protocol.companion.ProtocolException
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.hap.Tlv8
import dev.atvremote.protocol.hap.TlvValue
import dev.atvremote.protocol.opack.Opack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.DataInputStream
import java.io.EOFException
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class CompanionPinFailureAndroidTest {
    @Test fun pinTimeoutClosesClientAndAllowsANewPairingSession(): Unit = runBlocking {
        val server = ServerSocket(0, 2, InetAddress.getByName("127.0.0.1"))
        val serverFailure = AtomicReference<Throwable?>()
        val served = CountDownLatch(1)
        val serverThread = Thread {
            try {
                serveTimedOutPairing(server)
            } catch (error: Throwable) {
                serverFailure.set(error)
            } finally {
                served.countDown()
            }
        }.apply { isDaemon = true; start() }

        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = CredentialStore(context)
        val previous = store.loadLastDevice()
        val device = AppleTvDevice(
            "Companion timeout fixture", "127.0.0.1", server.localPort,
            identifier = "companion:timeout",
        )
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        var controller: AppleTVController? = null

        try {
            store.saveLastDevice(device)
            val activeController = AppleTVController(context, scope).also { controller = it }
            activeController.startPairing(device.credentialKey)
            val failure = try {
                activeController.submitPin(device.credentialKey, "1234")
                null
            } catch (error: Exception) {
                error
            }
            val completionError = failure ?: error("M3 must time out when the fixture withholds its response")
            val protocolError = when (completionError) {
                is VpnConnectionFailure -> completionError.cause
                else -> completionError
            }
            assertTrue("Expected the Companion pairing response timeout, got $completionError",
                protocolError is ProtocolException && protocolError.message?.startsWith("timed out waiting for response to PS_NEXT") == true)

            val retryFailure = try {
                activeController.submitPin(device.credentialKey, "1234")
                null
            } catch (error: Exception) {
                error
            }
            assertTrue(retryFailure is IllegalStateException)
            assertEquals("No pairing in progress", retryFailure?.message)

            activeController.startPairing(device.credentialKey)
            activeController.cancelPairing(device.credentialKey)
            assertTrue("The timed-out socket must close and a fresh PS_START must reach the server",
                served.await(4, TimeUnit.SECONDS))
            serverFailure.get()?.let { throw AssertionError("Companion fixture failed", it) }
        } finally {
            controller?.shutdown()
            scope.cancel()
            server.close()
            serverThread.join(1000)
            if (previous != null) store.saveLastDevice(previous) else store.clearLastDevice()
        }
    }

    private fun serveTimedOutPairing(server: ServerSocket) {
        server.accept().use { client ->
            client.soTimeout = 25_000
            val input = DataInputStream(client.getInputStream().buffered())
            val output = client.getOutputStream()
            assertEquals(FrameType.PS_START.value, readFrameType(input))
            writeM2(output)
            assertEquals(FrameType.PS_NEXT.value, readFrameType(input))
            // Wait for the app to close the connection after its 20-second protocol timeout.
            assertEquals(-1, input.read())
        }

        server.accept().use { client ->
            client.soTimeout = 25_000
            val input = DataInputStream(client.getInputStream().buffered())
            val output = client.getOutputStream()
            assertEquals(FrameType.PS_START.value, readFrameType(input))
            writeM2(output)
            // The test cancels this fresh pairing after M2 to verify the complete exchange arrived.
            assertEquals(-1, input.read())
        }
    }

    private fun readFrameType(input: DataInputStream): Int {
        val type = input.read()
        if (type < 0) throw EOFException("Client closed before sending a Companion frame")
        val length = (input.readUnsignedByte() shl 16) or
            (input.readUnsignedByte() shl 8) or
            input.readUnsignedByte()
        input.skipBytes(length)
        return type
    }

    private fun writeM2(output: OutputStream) {
        val payload = Opack.pack(mapOf("_pd" to M2))
        output.write(byteArrayOf(
            FrameType.PS_NEXT.value.toByte(),
            ((payload.size shr 16) and 0xFF).toByte(),
            ((payload.size shr 8) and 0xFF).toByte(),
            (payload.size and 0xFF).toByte(),
        ))
        output.write(payload)
        output.flush()
    }

    private companion object {
        val M2 = Tlv8.write(linkedMapOf(
            TlvValue.SEQ_NO to byteArrayOf(0x02),
            TlvValue.SALT to ByteArray(16) { (it + 1).toByte() },
            TlvValue.PUBLIC_KEY to byteArrayOf(0x01),
        ))
    }
}
