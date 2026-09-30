package com.privateremote.appletv

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.privateremote.appletv.appletv.AppleTVPackage
import com.privateremote.appletv.fold.FoldStatePackage
import com.privateremote.appletv.haptics.HapticsPackage

import com.privateremote.appletv.updates.AppUpdatesPackage
import com.privateremote.appletv.updates.UpdateWorker

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // App-local Turbo Modules: not published as npm packages, so
          // autolinking never sees them -- registered manually here.
          add(AppleTVPackage())
          add(FoldStatePackage())
          add(HapticsPackage())
          add(AppUpdatesPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    UpdateWorker.schedule(this)
  }
}
