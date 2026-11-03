package com.privateremote.appletv.appletv

import dev.atvremote.protocol.companion.ProtocolException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.SocketTimeoutException

private const val RESPONSE_TIMEOUT_MESSAGE_PREFIX = "timed out waiting for response to "
private const val CONNECTION_ATTEMPT_TIMEOUT_MS = 20_000L

internal suspend fun <T> closeOnCancellation(close: () -> Unit, block: suspend () -> T): T = coroutineScope {
    val attempt = currentCoroutineContext()[Job]!!
    val guard = launch(Dispatchers.IO, start = CoroutineStart.UNDISPATCHED) {
        try { awaitCancellation() }
        finally { if (!attempt.isActive) close() }
    }
    try { block() }
    catch (e: Exception) { currentCoroutineContext().ensureActive(); throw e }
    finally { guard.cancel() }
}

/** Three attempts for temporary network failures, with 1s and 2s pauses. */
internal suspend fun <T> retryConnection(
    beforeRetry: suspend () -> Unit = {},
    connect: suspend () -> T,
): T {
    for (attempt in 0..2) {
        try {
            return (withTimeoutOrNull(CONNECTION_ATTEMPT_TIMEOUT_MS) { Pair(Unit, connect()) }
                ?: throw SocketTimeoutException("Connection to TV timed out")).second
        } catch (e: Exception) {
            currentCoroutineContext().ensureActive()
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
    is FireTvAuthenticationException -> false
    is IOException, is TimeoutCancellationException -> true
    is ProtocolException -> error.message?.startsWith(RESPONSE_TIMEOUT_MESSAGE_PREFIX) == true
    else -> false
}
