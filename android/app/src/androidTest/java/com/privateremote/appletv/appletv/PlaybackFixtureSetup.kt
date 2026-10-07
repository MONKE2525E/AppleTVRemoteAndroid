package com.privateremote.appletv.appletv

import androidx.test.platform.app.InstrumentationRegistry
import dev.atvremote.protocol.discovery.AppleTvDevice
import org.junit.Assume.assumeNotNull
import org.junit.Test

/** Seeds a disposable emulator for app UI tests without instrumentation's FGS exemption. */
class PlaybackFixtureSetup {
    @Test fun selectExternalFixture() {
        val address = InstrumentationRegistry.getArguments().getString("externalFixtureAddress")
        assumeNotNull(address)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        CredentialStore(context).saveLastDevice(AppleTvDevice(
            "Living room test TV", address!!, 8060, identifier = "roku:live-update-test",
        ))
        // Instrumentation can exit before SharedPreferences.apply reaches disk.
        context.getSharedPreferences("appletv_secure", android.content.Context.MODE_PRIVATE).edit().commit()
        InstrumentationRegistry.getArguments().getString("devServerHost")?.let { host ->
            android.preference.PreferenceManager.getDefaultSharedPreferences(context).edit()
                .putString("debug_http_host", host).commit()
        }
    }
}
