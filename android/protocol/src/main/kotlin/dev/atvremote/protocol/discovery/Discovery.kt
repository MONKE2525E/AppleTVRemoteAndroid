package dev.atvremote.protocol.discovery

/** An Apple TV (or other Companion-capable device) found on the local network. */
data class AppleTvDevice(
    val name: String,
    val address: String,
    val port: Int,
    /** Hardware identifier, e.g. "AppleTV14,1". */
    val model: String? = null,
    /** Stable per-device identifier advertised as rpMRtID. */
    val identifier: String? = null,
    val kind: DeviceKind = classifyDevice(model, identifier),
) {
    /**
     * Key used to store credentials for this device.
     *
     * Deliberately excludes the port: an Apple TV rotates its ephemeral
     * Companion port, so including it would orphan the stored pairing.
     */
    val credentialKey: String get() = identifier ?: address
    val controllable: Boolean get() = kind == DeviceKind.APPLE_TV || kind == DeviceKind.ROKU
}

const val COMPANION_SERVICE_TYPE = "_companion-link._tcp"
const val COMPANION_SERVICE = "$COMPANION_SERVICE_TYPE.local."

/**
 * Discovery is platform-specific: the JVM uses jmDNS, Android uses NsdManager.
 * Keeping the protocol module free of either lets both consume it unchanged.
 */
interface DeviceDiscovery {
    suspend fun scan(timeoutMs: Long = 6000): List<AppleTvDevice>
}

/** Device types supported by the app's public discovery contract. */
enum class DeviceKind(val wireValue: String) {
    APPLE_TV("apple_tv"), ROKU("roku"), HOMEPOD("homepod"),
    AIRPLAY("airplay"), ANDROID_TV("android_tv"),
}

fun classifyDevice(model: String?, identifier: String?, serviceType: String = COMPANION_SERVICE_TYPE): DeviceKind = when {
    identifier?.startsWith("roku:") == true -> DeviceKind.ROKU
    serviceType.contains("_googlecast._tcp", ignoreCase = true) -> DeviceKind.ANDROID_TV
    model?.startsWith("AudioAccessory", ignoreCase = true) == true -> DeviceKind.HOMEPOD
    serviceType.contains("_airplay._tcp", ignoreCase = true) -> DeviceKind.AIRPLAY
    else -> DeviceKind.APPLE_TV
}

/** Parse the relevant DNS-SD TXT records without Android dependencies. */
fun deviceFromService(name: String, address: String, port: Int, serviceType: String, txt: Map<String, String>): AppleTvDevice {
    val attributes = txt.mapKeys { it.key.lowercase() }
    val model = attributes["rpmd"] ?: attributes["model"] ?: attributes["md"]
    val kind = classifyDevice(model, null, serviceType)
    val id = when (kind) {
        DeviceKind.ANDROID_TV -> attributes["id"]?.let { "cast:$it" }
        DeviceKind.AIRPLAY, DeviceKind.HOMEPOD -> attributes["deviceid"] ?: attributes["pi"] ?: attributes["rpmrtid"]
        else -> attributes["rpmrtid"]
    }
    return AppleTvDevice(name, address, port, model, id, kind)
}
