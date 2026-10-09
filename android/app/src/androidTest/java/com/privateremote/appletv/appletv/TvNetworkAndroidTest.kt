package com.privateremote.appletv.appletv

import android.content.Context
import android.content.Intent
import android.content.ComponentName
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.test.platform.app.InstrumentationRegistry
import dev.atvremote.protocol.discovery.AppleTvDevice
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Assume.assumeNotNull
import org.junit.Test
import java.net.InetSocketAddress
import java.net.Socket

/** Separate VPN app deliberately drops traffic, just as an unreachable VPN route would. */
class TvNetworkAndroidTest {
    @Test fun blockedVpnReturnsAdviceOnceAndCanRetryWithoutLosingDevice() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val host = InstrumentationRegistry.getArguments().getString("vpnFixtureAddress")
        assumeNotNull(host)
        val context = instrumentation.targetContext
        val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val store = CredentialStore(context)
        val previous = store.loadLastDevice()
        val device = AppleTvDevice("VPN test TV", host!!, 8060, identifier = "roku:vpn-fixture")
        Socket().use { it.connect(InetSocketAddress(host, 18061), 1500) }
        store.saveLastDevice(device)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val controller = AppleTVController(context, scope)
        try {
            vpnActivity(context)
            withTimeout(5000) {
                while (!vpnActive(connectivity)) delay(50)
            }
            // Establish the platform limitation with another UID, not the VPN owner's privilege.
            val lan = connectivity.allNetworks.first { network ->
                connectivity.getNetworkCapabilities(network)?.let {
                    it.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                        !it.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
                } == true
            }
            try {
                lan.socketFactory.createSocket().use { }
                fail("A non-bypassable VPN must reject physical-network binding")
            } catch (_: java.net.SocketException) { }
            val started = System.nanoTime()
            try {
                controller.connect(device.credentialKey)
                fail("The blackhole VPN must block the TV connection")
            } catch (e: VpnConnectionFailure) {
                assertTrue(e.message!!.contains("Tailscale"))
                assertTrue(e.message!!.contains("split tunneling"))
            }
            assertTrue("Must stop after the first 3s HTTP timeout, not three attempts",
                (System.nanoTime() - started) / 1_000_000 < 6000)
            val failed = controller.snapshotConnection() as ConnectionState.Failed
            assertFalse(failed.stalePairing)
            assertTrue(failed.canWake)
            assertEquals(device.credentialKey, store.loadLastDevice()!!.credentialKey)
            vpnActivity(context, "stopVpn")
            withTimeout(5000) { while (vpnActive(connectivity)) delay(50) }
            vpnActivity(context, "excludeTvRemote")
            withTimeout(5000) {
                while (connectivity.allNetworks.none { n ->
                    connectivity.getNetworkCapabilities(n)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
                }) delay(50)
            }
            controller.connect(device.credentialKey)
            assertTrue(controller.snapshotConnection() is ConnectionState.Connected)
            assertTrue(connectivity.allNetworks.any { n ->
                connectivity.getNetworkCapabilities(n)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
            })
        } finally {
            controller.shutdown()
            scope.cancel()
            vpnActivity(context, "stopVpn")
            if (previous != null) store.saveLastDevice(previous) else store.clearLastDevice()
        }
    }

    private fun vpnActivity(context: Context, option: String? = null) {
        context.startActivity(Intent().apply {
            component = ComponentName("com.privateremote.networktestvpn",
                "com.privateremote.networktestvpn.StartVpnActivity")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            option?.let { putExtra(it, true) }
        })
    }

    private fun vpnActive(connectivity: ConnectivityManager): Boolean =
        connectivity.getNetworkCapabilities(connectivity.activeNetwork)
            ?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
}
