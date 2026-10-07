package com.privateremote.appletv.appletv

import dev.atvremote.protocol.companion.ProtocolException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import java.io.IOException

private const val RESPONSE_TIMEOUT_MESSAGE_PREFIX = "timed out waiting for response to "

/** Three attempts for temporary network failures, with 1s and 2s pauses. */
internal suspend fun <T> retryConnection(
    beforeRetry: suspend () -> Unit = {},
    connect: suspend () -> T,
): T {
    for (attempt in 0..2) {
        try {
            return connect()
        } catch (e: Exception) {
            if (e is CancellationException && e !is TimeoutCancellationException) throw e
            if (attempt == 2 || !isRetryableConnectionFailure(e)) throw e
        }
        delay(1000L * (attempt + 1))
        beforeRetry()
    }
    error("Unreachable")
}

private fun isRetryableConnectionFailure(error: Exception): Boolean = when (error) {
    is RokuHttpException -> error.isRetryable
    is IOException, is TimeoutCancellationException -> true
    is ProtocolException -> error.message?.startsWith(RESPONSE_TIMEOUT_MESSAGE_PREFIX) == true
    else -> false
}
