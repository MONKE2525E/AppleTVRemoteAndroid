package com.privateremote.appletv.appletv

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class ConnectionRetryTest {
    @Test fun `temporary failures recover without reaching the caller`() = runTest {
        val attempts = mutableListOf<Long>()
        var refreshes = 0
        val result = retryConnection(beforeRetry = { refreshes++ }) {
            attempts.add(testScheduler.currentTime)
            if (attempts.size < 3) throw IOException("TV waking up")
            "connected"
        }
        assertEquals("connected", result)
        assertEquals(listOf(0L, 1000L, 3000L), attempts)
        assertEquals(2, refreshes)
    }

    @Test fun `exhaustion returns the last failure after exactly three attempts`() = runTest {
        var attempts = 0
        val failure = IOException("offline")
        try {
            retryConnection { attempts++; throw failure }
            fail<Unit>("Expected connection failure")
        } catch (e: IOException) { assertSame(failure, e) }
        assertEquals(3, attempts)
        assertEquals(3000L, testScheduler.currentTime)
    }

    @Test fun `pairing and configuration failures stop immediately`() = runTest {
        var attempts = 0
        try {
            retryConnection { attempts++; throw IllegalStateException("Not paired") }
            fail<Unit>("Expected pairing failure")
        } catch (_: IllegalStateException) { }
        assertEquals(1, attempts)
        assertEquals(0L, testScheduler.currentTime)
    }

    @Test fun `a timed out attempt can recover`() = runTest {
        var attempts = 0
        retryConnection {
            if (++attempts == 1) withTimeout(100) { awaitCancellation() }
        }
        assertEquals(2, attempts)
    }

    @Test fun `cancelling during backoff prevents further connections`() = runTest {
        var attempts = 0
        var refreshes = 0
        val job = launch {
            retryConnection(beforeRetry = { refreshes++ }) { attempts++; throw IOException("offline") }
        }
        runCurrent()
        job.cancel()
        advanceTimeBy(5000)
        runCurrent()
        assertTrue(job.isCancelled)
        assertEquals(1, attempts)
        assertEquals(0, refreshes)
    }

    @Test fun `cancellation from a connection is never retried`() = runTest {
        var attempts = 0
        try {
            retryConnection { attempts++; throw CancellationException("Stopped") }
            fail<Unit>("Expected cancellation")
        } catch (_: CancellationException) { }
        assertEquals(1, attempts)
    }
}
