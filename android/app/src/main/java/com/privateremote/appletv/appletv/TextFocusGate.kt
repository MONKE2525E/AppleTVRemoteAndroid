package com.privateremote.appletv.appletv

internal class TextFocusGate {
    private var active: Any? = null

    @Synchronized fun start(): Any = Any().also { active = it }

    @Synchronized fun clear() { active = null }

    @Synchronized fun clear(session: Any) {
        if (active === session) active = null
    }

    @Synchronized fun emit(session: Any, callback: () -> Unit) {
        if (active === session) callback()
    }
}
