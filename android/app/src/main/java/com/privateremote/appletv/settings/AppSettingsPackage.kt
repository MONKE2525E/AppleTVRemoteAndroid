package com.privateremote.appletv.settings

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.privateremote.appletv.specs.NativeAppSettingsSpec

class AppSettingsPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == NativeAppSettingsSpec.NAME) AppSettingsModule(reactContext) else null
    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(NativeAppSettingsSpec.NAME to ReactModuleInfo(NativeAppSettingsSpec.NAME, AppSettingsModule::class.java.name, false, false, false, true))
    }
}
