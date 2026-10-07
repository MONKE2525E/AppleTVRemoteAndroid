package com.privateremote.appletv.appletv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import androidx.test.platform.app.InstrumentationRegistry
import dev.atvremote.protocol.discovery.COMPANION_SERVICE_TYPE
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Uses Android's real DNS-SD daemon, not mocked discovery callbacks. */
class AppleTvDiscoveryAndroidTest {
    @Test fun resolvesDuringDiscoveryAndCanRestartAfterCancellation() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        val registered = CountDownLatch(1)
        val registrationError = AtomicReference<Int?>()
        val listener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(info: NsdServiceInfo) { registered.countDown() }
            override fun onRegistrationFailed(info: NsdServiceInfo, code: Int) {
                registrationError.set(code); registered.countDown()
            }
            override fun onServiceUnregistered(info: NsdServiceInfo) = Unit
            override fun onUnregistrationFailed(info: NsdServiceInfo, code: Int) = Unit
        }
        ServerSocket(0).use { socket ->
            val service = NsdServiceInfo().apply {
                serviceName = "Living room test Apple TV"
                serviceType = COMPANION_SERVICE_TYPE
                port = socket.localPort
                setAttribute("rpMRtID", "discovery-test-apple-tv")
                setAttribute("rpMd", "AppleTV14,1")
            }
            nsd.registerService(service, NsdManager.PROTOCOL_DNS_SD, listener)
            try {
                assertTrue(registered.await(10, TimeUnit.SECONDS))
                assertNull(registrationError.get())
                val discovery = AndroidDeviceDiscovery(context)
                repeat(2) {
                    val found = CountDownLatch(1)
                    val scan = async(kotlinx.coroutines.Dispatchers.IO) {
                        discovery.scan(10_000) { device ->
                            if (device.identifier == "discovery-test-apple-tv") {
                                assertEquals(socket.localPort, device.port)
                                assertEquals("AppleTV14,1", device.model)
                                assertTrue(device.address.isNotBlank())
                                found.countDown()
                            }
                        }
                    }
                    try {
                        assertTrue("Apple TV must resolve before the browsing window ends", found.await(6, TimeUnit.SECONDS))
                        assertTrue("Discovery must still be running when a TV appears", scan.isActive)
                    } finally { scan.cancelAndJoin() }
                }
                val hold = InstrumentationRegistry.getArguments().getString("visualHoldSeconds")?.toLongOrNull() ?: 0
                if (hold > 0) Thread.sleep(hold.coerceAtMost(60) * 1000)
            } finally { nsd.unregisterService(listener) }
        }
    }
}
