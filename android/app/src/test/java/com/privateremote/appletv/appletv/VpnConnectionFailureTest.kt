package com.privateremote.appletv.appletv

import dev.atvremote.protocol.companion.ProtocolException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.net.SocketTimeoutException

class VpnConnectionFailureTest {
    @Test fun `VPN reachability failures stop retries without deleting pairing`() = runTest {
        var attempts = 0
        val timeout = SocketTimeoutException("connect timed out")
        try {
            retryConnection { attempts++; throw vpnConnectionFailure(timeout, true) }
            fail<Unit>("Expected VPN advice")
        } catch (e: VpnConnectionFailure) {
            assertSame(timeout, e.cause)
            assertTrue(e.message!!.contains("Tailscale can stay on"))
        }
        assertEquals(1, attempts)
        assertEquals(0L, testScheduler.currentTime)
    }

    @Test fun `without a VPN existing connection retry behavior is preserved`() = runTest {
        var attempts = 0
        retryConnection {
            if (++attempts == 1) throw vpnConnectionFailure(SocketTimeoutException(), false)
        }
        assertEquals(2, attempts)
    }

    @Test fun `server responses pairing failures and cancellation keep original errors`() {
        for (error in listOf(RokuHttpException(403, "Enable mobile control"),
            IllegalStateException("Not paired"), CancellationException("Stopped"),
            ProtocolException("invalid response payload"))) {
            assertSame(error, vpnConnectionFailure(error, true))
        }
    }

    @Test fun `Companion response timeout includes VPN recovery advice`() {
        assertTrue(vpnConnectionFailure(ProtocolException("timed out waiting for response to _sessionStart"), true)
            is VpnConnectionFailure)
    }
}
