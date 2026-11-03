package com.privateremote.appletv.appletv

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Test
import org.json.JSONObject

class FireTvIdentityAndroidTest {
    @Test fun migratesPreviouslyPairedCertificate() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val prefs = context.getSharedPreferences("appletv_secure", android.content.Context.MODE_PRIVATE)
        val id = "firetv:dial:identity-test"
        val cert = "identity-test-certificate"
        val alias = "firetv:cert:$cert"
        val record = JSONObject().put("token", "test-token").put("certificate", cert).toString()
        try {
            prefs.edit().putString("firetv:$id", AppleTvSecureStore.encrypt(record)).remove("firetv-alias:$alias").commit()
            val store = CredentialStore(context)
            assertEquals(id, store.loadFireTvAlias(alias))
            assertEquals(id, prefs.getString("firetv-alias:$alias", null))
        } finally {
            prefs.edit().remove("firetv:$id").remove("firetv-alias:$alias").commit()
        }
    }
}
