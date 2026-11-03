package com.privateremote.appletv.appletv

import androidx.test.platform.app.InstrumentationRegistry
import dev.atvremote.protocol.discovery.AppleTvDevice
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.util.Collections
import java.util.concurrent.Executors

class TextSessionAndroidTest {
    @Test fun delayedAppleTextCannotReachReplacementRoku(): Unit = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = CredentialStore(context)
        val original = store.loadLastDevice()
        val device = AppleTvDevice("Fixture", "127.0.0.1", 8060, identifier = "roku:text-session")
        val requests = Collections.synchronizedList(mutableListOf<String>())
        val executor = Executors.newSingleThreadExecutor()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            ServerSocket(8060).use { server ->
                server.soTimeout = 300
                val responder = executor.submit {
                    while (!Thread.currentThread().isInterrupted && !server.isClosed) {
                        val client = try { server.accept() } catch (_: SocketTimeoutException) { continue }
                        client.use {
                            val input = it.getInputStream().bufferedReader()
                            val request = input.readLine()
                            while (!input.readLine().isNullOrEmpty()) { }
                            requests.add(request)
                            val body = if (request.contains("query/device-info"))
                                "<device-info><serial-number>text-session</serial-number></device-info>"
                            else "<player state=\"stop\"/>"
                            val bytes = body.toByteArray()
                            it.getOutputStream().apply {
                                write("HTTP/1.1 200 OK\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
                                write(bytes)
                            }
                        }
                    }
                }
                store.saveLastDevice(device)
                val controller = AppleTVController(context, scope)
                val release = CompletableDeferred<Unit>()
                val delayedAppleText = async {
                    release.await()
                    runCatching { controller.sendText("private", true) }
                }
                controller.connect(device.credentialKey)
                release.complete(Unit)
                assertTrue(delayedAppleText.await().isFailure)
                val session = (controller.snapshotConnection() as ConnectionState.Connected).rokuSession!!
                controller.sendRokuEdit(session, 0, "x")
                val observed = synchronized(requests) { requests.toList() }
                assertTrue(observed.any { it.contains("keypress/Lit_x") })
                assertFalse(observed.any { it.contains("keypress/Lit_p") })
                controller.disconnect()
                responder.cancel(true)
            }
        } finally {
            scope.cancel()
            executor.shutdownNow()
            if (original == null) store.clearLastDevice() else store.saveLastDevice(original)
        }
    }
}
