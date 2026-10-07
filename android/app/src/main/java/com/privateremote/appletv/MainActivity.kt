package com.privateremote.appletv

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.privateremote.appletv.appletv.PlaybackWidget
import kotlinx.coroutines.launch
import com.privateremote.appletv.appletv.VolumeKeyDispatcher
import com.privateremote.appletv.appletv.AppleTVService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

class MainActivity : ReactActivity() {

  private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var serviceBinder: AppleTVService.LocalBinder? = null
  private val volumeKeys = VolumeKeyDispatcher(activityScope,
    send = { up -> serviceBinder?.getController()?.nudgeVolume(up) },
    onError = { error ->
      android.util.Log.w("RemoteVolume", "TV volume command failed", error)
      serviceBinder?.reportCommandError("volume", error.javaClass.simpleName)
    },
  )

  private val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
      serviceBinder = service as AppleTVService.LocalBinder
      serviceBinder?.getController()?.autoReconnectIfPossible()
      handleWidgetAction()
    }
    override fun onServiceDisconnected(name: ComponentName?) {
      serviceBinder = null
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "AppleTVRemote"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onStart() {
    super.onStart()
    val intent = Intent(this, AppleTVService::class.java)
    bindService(intent, connection, Context.BIND_AUTO_CREATE)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleWidgetAction()
  }

  private fun handleWidgetAction() {
    val controller = serviceBinder?.getController() ?: return
    if (intent.action != PlaybackWidget.ACTION_PLAY_PAUSE) return
    intent.action = null
    activityScope.launch {
      runCatching { controller.ensureConnected(); controller.playPause() }
        .onFailure { serviceBinder?.reportCommandError("playPause", it.javaClass.simpleName) }
    }
  }

  override fun onStop() {
    volumeKeys.reset()
    runCatching { unbindService(connection) }
    serviceBinder = null
    super.onStop()
  }

  override fun onDestroy() {
    activityScope.cancel()
    super.onDestroy()
  }

  /**
   * While the remote is open, the hardware volume rocker controls the Apple
   * TV's volume instead of the phone's own media volume -- matches the
   * physical Siri Remote / reference app. Both onKeyDown and onKeyUp are
   * consumed so no system volume UI ever appears.
   */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val volume = event.keyCode == KeyEvent.KEYCODE_VOLUME_UP || event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN
    if (!volume || serviceBinder?.getController()?.isConnected() != true) return super.dispatchKeyEvent(event)
    val up = event.keyCode == KeyEvent.KEYCODE_VOLUME_UP
    when (event.action) {
      KeyEvent.ACTION_DOWN -> volumeKeys.down(up, event.repeatCount > 0)
      KeyEvent.ACTION_UP -> volumeKeys.up(up)
    }
    return true
  }

}
