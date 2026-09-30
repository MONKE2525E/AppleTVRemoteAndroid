package com.privateremote.appletv.updates

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.privateremote.appletv.specs.NativeAppUpdatesSpec

class AppUpdatesPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == NativeAppUpdatesSpec.NAME) AppUpdatesModule(reactContext) else null
    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(NativeAppUpdatesSpec.NAME to ReactModuleInfo(NativeAppUpdatesSpec.NAME, AppUpdatesModule::class.java.name, false, false, false, true))
    }
}
