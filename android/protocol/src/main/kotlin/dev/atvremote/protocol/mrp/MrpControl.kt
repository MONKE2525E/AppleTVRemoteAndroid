package dev.atvremote.protocol.mrp

/** Encodes operations onto an established MRP transport. */
class MrpControl(private val send: (ByteArray) -> Unit) {
    fun command(command: Int) = send(Mrp.transportCommand(command))
    fun setVolume(uid: String, level: Double) {
        require(level.isFinite() && level in 0.0..1.0)
        send(Mrp.setVolume(uid, level))
    }
    fun setOutputDevice(uid: String) = send(Mrp.setOutputDevice(uid))
    fun volumeStep(up: Boolean) {
        val usage = if (up) 0xe9 else 0xea
        send(Mrp.hidVolume(usage, true))
        send(Mrp.hidVolume(usage, false))
    }
}
