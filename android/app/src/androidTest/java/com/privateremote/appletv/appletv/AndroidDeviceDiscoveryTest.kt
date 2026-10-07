package com.privateremote.appletv.appletv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import androidx.test.platform.app.InstrumentationRegistry
import dev.atvremote.protocol.discovery.COMPANION_SERVICE_TYPE
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Runs the real NsdManager against a Companion Link service this device advertises itself. */
class AndroidDeviceDiscoveryTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager

    @Test fun appleTvIsReportedAsSoonAsItResolvesNotAtTheEndOfTheScan() {
        val name = "Discovery Test ${System.nanoTime()}"
        val registered = CountDownLatch(1)
        val registration = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(info: NsdServiceInfo) = registered.countDown()
            override fun onRegistrationFailed(info: NsdServiceInfo, errorCode: Int) = Unit
            override fun onServiceUnregistered(info: NsdServiceInfo) = Unit
            override fun onUnregistrationFailed(info: NsdServiceInfo, errorCode: Int) = Unit
        }
        val service = NsdServiceInfo().apply {
            serviceName = name
            serviceType = COMPANION_SERVICE_TYPE
            port = 49153
            setAttribute("rpMd", "AppleTV14,1")
        }
        nsd.registerService(service, NsdManager.PROTOCOL_DNS_SD, registration)
        try {
            assertTrue("test service did not register", registered.await(10, TimeUnit.SECONDS))
            val scanMs = 10_000L
            val started = System.nanoTime()
            var reportedAfterMs: Long? = null
            runBlocking {
                AndroidDeviceDiscovery(context).scan(scanMs) { device ->
                    if (device.name == name && reportedAfterMs == null) {
                        reportedAfterMs = (System.nanoTime() - started) / 1_000_000
                        assertEquals("AppleTV14,1", device.model)
                    }
                }
            }
            val elapsed = reportedAfterMs
            assertNotNull("advertised Apple TV was never reported", elapsed)
            assertTrue("reported after ${elapsed}ms, expected well before the ${scanMs}ms scan ends", elapsed!! < scanMs / 2)
        } finally {
            runCatching { nsd.unregisterService(registration) }
        }
    }
}
