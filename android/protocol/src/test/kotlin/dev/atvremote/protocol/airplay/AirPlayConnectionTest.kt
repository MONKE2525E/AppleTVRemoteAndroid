package dev.atvremote.protocol.airplay

import kotlinx.coroutines.runBlocking
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertFailsWith

class AirPlayConnectionTest {
    @Test fun silentPeerCannotHangPairingResponseForever() = runBlocking {
        ServerSocket(0).use { server ->
            val executor = Executors.newSingleThreadExecutor()
            val peer = executor.submit {
                server.accept().use { client ->
                    client.soTimeout = 2000
                    // Consume the request but never send a response.
                    val reader = client.getInputStream().bufferedReader()
                    while (!reader.readLine().isNullOrEmpty()) { }
                    while (reader.read() != -1) { }
                }
            }
            val connection = AirPlayConnection("127.0.0.1", server.localPort)
            try {
                connection.connect(timeoutMs = 200)
                assertFailsWith<SocketTimeoutException> { connection.post("/pair-setup") }
            } finally {
                connection.close()
                peer.get(3, TimeUnit.SECONDS)
                executor.shutdownNow()
            }
        }
    }
}
