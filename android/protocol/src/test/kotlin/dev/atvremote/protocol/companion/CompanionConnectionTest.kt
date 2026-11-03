package dev.atvremote.protocol.companion

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import java.io.IOException
import java.net.Socket
import java.net.SocketAddress
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CompanionConnectionTest {
    @Test fun `closing during connect cannot publish a late socket`() = runBlocking {
        val started = CountDownLatch(1)
        val finish = CountDownLatch(1)
        val socket = object : Socket() {
            override fun connect(endpoint: SocketAddress?, timeout: Int) {
                started.countDown()
                check(finish.await(3, TimeUnit.SECONDS))
            }
        }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val connection = CompanionConnection("127.0.0.1", 1, scope) { socket }
        try {
            val connecting = async(Dispatchers.IO) { runCatching { connection.connect() } }
            assertTrue(started.await(3, TimeUnit.SECONDS))
            connection.close()
            assertTrue(socket.isClosed)
            finish.countDown()
            assertTrue(connecting.await().exceptionOrNull() is IOException)
            assertFalse(connection.isConnected)
        } finally {
            finish.countDown()
            connection.close()
            scope.cancel()
        }
    }
}
