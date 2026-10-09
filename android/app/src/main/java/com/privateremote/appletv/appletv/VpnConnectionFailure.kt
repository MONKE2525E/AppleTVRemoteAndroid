package com.privateremote.appletv.appletv

import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.coroutines.TimeoutCancellationException
import dev.atvremote.protocol.companion.ProtocolException

/** A failed network attempt with recovery advice, not proof that the VPN caused it. */
internal class VpnConnectionFailure(cause: Exception) : Exception(
    "Could not reach the TV while a VPN is active. " +
        "If you use Tailscale, exclude AppleTVRemote in its app-based split tunneling settings, then retry. " +
        "Tailscale can stay on for your other apps.", cause,
)

internal fun vpnConnectionFailure(error: Exception, vpnActive: Boolean): Exception =
    if (vpnActive && (error is SocketException || error is SocketTimeoutException ||
        error is UnknownHostException || error is TimeoutCancellationException ||
        error is ProtocolException && error.message?.startsWith("timed out waiting for response to ") == true)) {
        VpnConnectionFailure(error)
    } else error
