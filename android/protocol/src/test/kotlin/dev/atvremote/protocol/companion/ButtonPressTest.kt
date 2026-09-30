package dev.atvremote.protocol.companion

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

@OptIn(ExperimentalCoroutinesApi::class)
class ButtonPressTest {
    @Test fun `cancelling a held key still releases it`() = runTest {
        val events = mutableListOf<Boolean>()
        val job = launch { pressAndRelease(1000) { events.add(it) } }
        runCurrent()
        assertEquals(listOf(true), events)
        job.cancel()
        job.join()
        assertEquals(listOf(true, false), events)
    }

    @Test fun `a failed down acknowledgement still attempts release and preserves the error`() = runTest {
        val failure = IllegalStateException("missing acknowledgement")
        val events = mutableListOf<Boolean>()
        var caught: Throwable? = null
        try {
            pressAndRelease(0) { down ->
                events.add(down)
                if (down) throw failure
            }
        } catch (error: Throwable) { caught = error }
        assertSame(failure, caught)
        assertEquals(listOf(true, false), events)
    }
}
