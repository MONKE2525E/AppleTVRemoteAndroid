package com.privateremote.appletv.appletv

import androidx.test.platform.app.InstrumentationRegistry
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.hap.Tlv8
import dev.atvremote.protocol.hap.TlvValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class AirPlayPinFailureAndroidTest {
    @Test fun pinTimeoutClearsPairingAndAllowsANewTcpSession(): Unit = runBlocking {
        val server = ServerSocket(7000, 2, InetAddress.getByName("127.0.0.1"))
        val serverFailure = AtomicReference<Throwable?>()
        val served = CountDownLatch(1)
        val serverThread = Thread {
            try {
                servePairingAttempt(server, hangAfterM3 = true)
                servePairingAttempt(server, hangAfterM3 = false)
            } catch (error: Throwable) {
                serverFailure.set(error)
            } finally {
                served.countDown()
            }
        }.apply { isDaemon = true; start() }

        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = CredentialStore(context)
        val previous = store.loadLastDevice()
        val device = AppleTvDevice("AirPlay timeout fixture", "127.0.0.1", 8060, identifier = "airplay:timeout")
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        var controller: AppleTVController? = null

        try {
            store.saveLastDevice(device)
            val activeController = AppleTVController(context, scope).also { controller = it }
            activeController.startAirPlayPairing(device.credentialKey)
            val failure = try {
                activeController.submitAirPlayPin(device.credentialKey, "1234")
                null
            } catch (error: Exception) {
                error
            }
            assertNotNull("M3 must time out when the fixture withholds its response", failure)
            val socketTimeout = when (failure) {
                is VpnConnectionFailure -> failure.cause
                else -> failure
            }
            assertTrue("Expected the AirPlay read timeout, got $failure", socketTimeout is SocketTimeoutException)

            val retryFailure = try {
                activeController.submitAirPlayPin(device.credentialKey, "1234")
                null
            } catch (error: Exception) {
                error
            }
            assertTrue(retryFailure is IllegalStateException)
            assertEquals("No AirPlay pairing in progress", retryFailure?.message)

            activeController.startAirPlayPairing(device.credentialKey)
            activeController.cancelPairing(device.credentialKey)
            assertTrue("Both the timeout and fresh pairing handshakes should reach the server",
                served.await(3, TimeUnit.SECONDS))
            serverFailure.get()?.let { throw AssertionError("AirPlay fixture failed", it) }
        } finally {
            controller?.shutdown()
            scope.cancel()
            server.close()
            serverThread.join(1000)
            if (previous != null) store.saveLastDevice(previous) else store.clearLastDevice()
        }
    }

    private fun servePairingAttempt(server: ServerSocket, hangAfterM3: Boolean) {
        server.accept().use { client ->
            client.soTimeout = 9000
            val input = BufferedInputStream(client.getInputStream())
            val output = client.getOutputStream()
            assertTrue(readRequest(input).startsWith("POST /pair-pin-start "))
            writeResponse(output, ByteArray(0))
            assertTrue(readRequest(input).startsWith("POST /pair-setup "))
            writeResponse(output, M2)
            if (hangAfterM3) {
                assertTrue(readRequest(input).startsWith("POST /pair-setup "))
                // Keep the connection open without an HTTP response until the controller times out.
                assertEquals(-1, input.read())
            }
        }
    }

    private fun readRequest(input: BufferedInputStream): String {
        val headerBytes = ByteArrayOutputStream()
        val ending = ByteArray(4)
        var endSize = 0
        while (endSize < 4) {
            val value = input.read()
            if (value < 0) throw AssertionError("Client closed during HTTP request")
            headerBytes.write(value)
            if (endSize < 4) ending[endSize++] = value.toByte()
            if (endSize == 4 && !ending.contentEquals(CRLFCRLF)) {
                System.arraycopy(ending, 1, ending, 0, 3)
                endSize = 3
            }
        }

        val lines = String(headerBytes.toByteArray(), Charsets.US_ASCII).dropLast(4).split("\r\n")
        val contentLength = lines.drop(1).firstNotNullOfOrNull { line ->
            if (line.startsWith("Content-Length:", ignoreCase = true)) line.substringAfter(':').trim().toIntOrNull()
            else null
        } ?: 0
        var remaining = contentLength
        val body = ByteArray(1024)
        while (remaining > 0) {
            val count = input.read(body, 0, minOf(remaining, body.size))
            if (count < 0) throw AssertionError("Client closed during HTTP body")
            remaining -= count
        }
        return lines.first()
    }

    private fun writeResponse(output: java.io.OutputStream, body: ByteArray) {
        output.write("HTTP/1.1 200 OK\r\nContent-Length: ${body.size}\r\nConnection: keep-alive\r\n\r\n"
            .toByteArray(Charsets.US_ASCII))
        output.write(body)
        output.flush()
    }

    private companion object {
        val M2 = Tlv8.write(linkedMapOf(
            TlvValue.SEQ_NO to byteArrayOf(0x02),
            TlvValue.SALT to ByteArray(16) { (it + 1).toByte() },
            TlvValue.PUBLIC_KEY to byteArrayOf(0x01),
        ))
        val CRLFCRLF = byteArrayOf(13, 10, 13, 10)
    }
}
