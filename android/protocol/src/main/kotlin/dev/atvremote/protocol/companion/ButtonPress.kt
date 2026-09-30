package dev.atvremote.protocol.companion

import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

/** Release even when the press acknowledgement or a held-button delay fails. */
internal suspend fun pressAndRelease(holdMs: Long, hid: suspend (Boolean) -> Unit) {
    var failure: Throwable? = null
    try {
        hid(true)
        if (holdMs > 0) delay(holdMs)
    } catch (e: Throwable) {
        failure = e
        throw e
    } finally {
        try {
            withContext(NonCancellable) {
                withTimeout(1500) { hid(false) }
            }
        } catch (releaseError: Throwable) {
            if (failure == null) throw releaseError
            failure.addSuppressed(releaseError)
        }
    }
}
