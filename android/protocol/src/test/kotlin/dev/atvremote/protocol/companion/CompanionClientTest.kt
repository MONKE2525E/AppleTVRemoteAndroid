package dev.atvremote.protocol.companion

import dev.atvremote.protocol.opack.Opack
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import java.io.IOException
import kotlin.test.*

@OptIn(ExperimentalCoroutinesApi::class)
class CompanionClientTest {
    private class FakeTransport : CompanionTransport {
        override var onFrame: ((Frame) -> Unit)? = null
        override var onClosed: ((Throwable?) -> Unit)? = null
        override var isConnected = false
        var send: (FrameType, ByteArray) -> Unit = { _, _ -> }
        override suspend fun connect(timeoutMs: Int) { isConnected = true }
        override fun send(type: FrameType, payload: ByteArray) = send.invoke(type, payload)
        override fun enableEncryption(outputKey: ByteArray, inputKey: ByteArray) = Unit
        override fun close() { isConnected = false }
    }

    // Inspect waiter ownership without adding a production diagnostics API.
    private fun pendingCount(client: CompanionClient): Int {
        val field = CompanionClient::class.java.getDeclaredField("pending")
        field.isAccessible = true
        return (field.get(client) as Map<*, *>).size
    }

    @Test fun `caller timeout remains cancellation and removes its waiter`() = runTest {
        val client = CompanionClient("synthetic", 0, FakeTransport())
        client.connect()
        assertFailsWith<TimeoutCancellationException> {
            withTimeout(100) { client.request("fake", timeoutMs = 1000) }
        }
        assertEquals(0, pendingCount(client))
    }

    @Test fun `request timeout is a protocol failure and removes its waiter`() = runTest {
        val client = CompanionClient("synthetic", 0, FakeTransport())
        client.connect()
        val error = assertFailsWith<ProtocolException> { client.request("fake", timeoutMs = 100) }
        assertTrue(error.message!!.startsWith("timed out waiting for response to "))
        assertEquals(0, pendingCount(client))
    }

    @Test fun `cancelling a request removes its waiter`() = runTest {
        val client = CompanionClient("synthetic", 0, FakeTransport())
        client.connect()
        val request = launch { client.request("fake") }
        runCurrent()
        assertEquals(1, pendingCount(client))
        request.cancel()
        request.join()
        assertEquals(0, pendingCount(client))
    }

    @Test fun `send failure without a close callback removes its waiter`() = runTest {
        val transport = FakeTransport()
        val client = CompanionClient("synthetic", 0, transport)
        client.connect()
        val failure = IOException("synthetic send failure")
        transport.send = { _, _ -> throw failure }
        assertSame(failure, assertFailsWith<IOException> { client.request("fake") })
        assertEquals(0, pendingCount(client))
    }

    @Test fun `synchronous fake reply completes the registered request`() = runTest {
        val transport = FakeTransport()
        val client = CompanionClient("synthetic", 0, transport)
        client.connect()
        transport.send = { type, payload ->
            val request = Opack.unpack(payload) as Map<*, *>
            transport.onFrame!!(Frame(type, Opack.pack(mapOf("_t" to 3L, "_x" to request["_x"]))))
        }
        client.request("fake")
        assertEquals(0, pendingCount(client))
    }
}
