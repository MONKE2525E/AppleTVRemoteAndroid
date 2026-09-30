package com.privateremote.appletv.appletv

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VolumeKeyDispatcherTest {
    @Test fun `holding a key against a slow TV never queues repeats and down is next`() = runTest {
        var time = 0L
        val gate = CompletableDeferred<Unit>()
        val sent = mutableListOf<Boolean>()
        val keys = VolumeKeyDispatcher(backgroundScope, send = {
            sent.add(it)
            if (sent.size == 1) gate.await()
        }, onError = { throw it }, now = { time })
        keys.down(true, false)
        runCurrent()
        repeat(20) { time += 120; keys.down(true, true) }
        keys.up(true)
        keys.down(false, false)
        keys.up(false)
        gate.complete(Unit)
        runCurrent()
        assertEquals(listOf(true, false), sent)
    }

    @Test fun `release drops a queued repeat but preserves a quick tap`() = runTest {
        var time = 0L
        val sent = mutableListOf<Boolean>()
        val keys = VolumeKeyDispatcher(backgroundScope, send = { sent.add(it) }, onError = { throw it }, now = { time })
        keys.down(true, false)
        keys.up(true)
        runCurrent()
        keys.down(true, false)
        runCurrent()
        time = 120
        keys.down(true, true)
        keys.up(true)
        runCurrent()
        assertEquals(listOf(true, true), sent)
    }

    @Test fun `old commands expire and failures do not stop the worker`() = runTest {
        var time = 0L
        val sent = mutableListOf<Boolean>()
        val errors = mutableListOf<Exception>()
        val keys = VolumeKeyDispatcher(backgroundScope, send = {
            sent.add(it)
            if (it) throw IllegalStateException("failed")
        }, onError = { errors.add(it) }, now = { time })
        keys.down(true, false)
        time = 501
        runCurrent()
        assertTrue(sent.isEmpty())
        keys.down(true, false)
        runCurrent()
        keys.down(false, false)
        runCurrent()
        assertEquals(listOf(true, false), sent)
        assertEquals(1, errors.size)
    }

    @Test fun `leaving the activity clears pending input`() = runTest {
        val sent = mutableListOf<Boolean>()
        val keys = VolumeKeyDispatcher(backgroundScope, send = { sent.add(it) }, onError = { throw it })
        keys.down(true, false)
        keys.reset()
        runCurrent()
        assertTrue(sent.isEmpty())
    }
}
