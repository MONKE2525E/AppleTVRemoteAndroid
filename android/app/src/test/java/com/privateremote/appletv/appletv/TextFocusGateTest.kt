package com.privateremote.appletv.appletv

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TextFocusGateTest {
    @Test fun `late focus from the old remote cannot replace the new remote initial focus`() {
        val gate = TextFocusGate()
        val events = mutableListOf<String>()
        val old = gate.start()
        gate.emit(old) { events.add("old focused") }
        gate.clear()
        events.add("connecting")
        gate.emit(old) { events.add("late old focus") }
        val current = gate.start()
        gate.emit(current) { events.add("new initial focus") }
        gate.clear(old)
        gate.emit(current) { events.add("new focus update") }
        gate.clear()
        gate.emit(current) { events.add("late new focus") }
        assertEquals(listOf("old focused", "connecting", "new initial focus", "new focus update"), events)
    }
}
