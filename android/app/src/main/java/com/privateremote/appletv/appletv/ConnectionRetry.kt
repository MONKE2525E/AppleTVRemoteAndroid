package com.privateremote.appletv.appletv

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import java.io.IOException

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
            if (attempt == 2 || (e !is IOException && e !is TimeoutCancellationException)) throw e
        }
        delay(1000L * (attempt + 1))
        beforeRetry()
    }
    error("Unreachable")
}
