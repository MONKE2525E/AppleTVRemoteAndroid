package com.privateremote.appletv.appletv

import dev.atvremote.protocol.discovery.AppleTvDevice

/** Reconcile advertisements observed together during one discovery scan. */
internal class FireTvIdentities(
    private val lookup: (String) -> String?,
    private val save: (String, String) -> Unit,
    private val paired: (String) -> Boolean,
) {
    private data class Seen(val source: String, val id: String, val canonical: String)
    private val addresses = mutableMapOf<String, Seen>()

    @Synchronized fun resolve(device: AppleTvDevice): AppleTvDevice {
        val id = device.credentialKey
        val source = when {
            id.startsWith("firetv:mdns:") -> "mdns"
            id.startsWith("firetv:cert:") -> "cert"
            else -> "dial"
        }
        val known = lookup(id) ?: id
        val observed = addresses[device.address]?.takeIf { it.source != source }
        val canonical = when {
            paired(known) -> known
            observed != null && paired(observed.canonical) -> observed.canonical
            observed != null -> observed.canonical
            else -> known
        }
        addresses[device.address] = Seen(source, id, canonical)
        if (observed != null) {
            save(observed.id, canonical)
            save(id, canonical)
        }
        return device.copy(identifier = canonical)
    }
}
