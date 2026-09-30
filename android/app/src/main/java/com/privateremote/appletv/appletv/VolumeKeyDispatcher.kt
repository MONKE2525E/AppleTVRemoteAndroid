package com.privateremote.appletv.appletv

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch

/** One command at a time. Held-key repeats never queue behind a slow TV. */
internal class VolumeKeyDispatcher(
    scope: CoroutineScope,
    private val send: suspend (Boolean) -> Unit,
    private val onError: (Exception) -> Unit,
    private val now: () -> Long = { System.nanoTime() / 1_000_000 },
) {
    private data class Press(val up: Boolean, val generation: Long, val repeat: Boolean, val expires: Long)
    private val presses = Channel<Press>(8)
    private var generation = 0L
    private var held: Boolean? = null
    private var pending = 0
    private var busy = false
    private var lastRepeat = Long.MIN_VALUE

    init {
        scope.launch {
            for (press in presses) {
                val valid = synchronized(this@VolumeKeyDispatcher) {
                    pending--
                    val current = press.expires >= now() &&
                        (!press.repeat || press.generation == generation && held == press.up)
                    busy = current
                    current
                }
                if (!valid) continue
                try {
                    send(press.up)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    onError(e)
                } finally {
                    synchronized(this@VolumeKeyDispatcher) { busy = false }
                }
            }
        }
    }

    @Synchronized fun down(up: Boolean, repeat: Boolean) {
        val time = now()
        if (!repeat) {
            generation++
            held = up
            lastRepeat = time
        } else {
            if (held != up || busy || pending > 0 || time - lastRepeat < 120) return
            lastRepeat = time
        }
        if (presses.trySend(Press(up, generation, repeat, time + 500)).isSuccess) pending++
    }

    @Synchronized fun up(up: Boolean) {
        if (held == up) { held = null; generation++ }
    }

    @Synchronized fun reset() {
        held = null
        generation++
        while (presses.tryReceive().isSuccess) pending--
    }
}
