package com.privateremote.appletv

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.app.AlertDialog
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import android.os.IBinder
import android.os.SystemClock
import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.privateremote.appletv.appletv.AppleTVService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class MainActivity : ReactActivity() {

  private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var serviceBinder: AppleTVService.LocalBinder? = null
  private var lastVolumeSentAt = 0L

  private val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
      serviceBinder = service as AppleTVService.LocalBinder
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
    ContextCompat.startForegroundService(this, intent)
    bindService(intent, connection, Context.BIND_AUTO_CREATE)
  }

  fun offerBackgroundControls() {
    val prefs = getSharedPreferences("remote_preferences", Context.MODE_PRIVATE)
    if (Build.VERSION.SDK_INT >= 33 &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
        !prefs.getBoolean("notification_requested", false)) {
      prefs.edit().putBoolean("notification_requested", true).apply()
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_REQUEST)
      return
    }
    if (prefs.getBoolean("background_prompt_shown", false)) return
    prefs.edit().putBoolean("background_prompt_shown", true).apply()
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    if (power.isIgnoringBatteryOptimizations(packageName)) return
    AlertDialog.Builder(this)
      .setTitle("Keep TV controls available")
      .setMessage("The remote stays connected in the background to show playback details and pause controls. Allow background battery use in this app's settings if your phone stops the connection.")
      .setPositiveButton("Open settings") { _, _ ->
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
      }
      .setNegativeButton("Later", null)
      .show()
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == NOTIFICATION_REQUEST) offerBackgroundControls()
  }

  companion object {
    private const val NOTIFICATION_REQUEST = 2525
  }

  override fun onStop() {
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
    if (event.action == KeyEvent.ACTION_DOWN) {
      val now = SystemClock.uptimeMillis()
      if (event.repeatCount == 0 || now - lastVolumeSentAt >= 90L) {
        lastVolumeSentAt = now
        val up = event.keyCode == KeyEvent.KEYCODE_VOLUME_UP
        activityScope.launch {
          runCatching { serviceBinder?.getController()?.nudgeVolume(up) }
            .onFailure { android.util.Log.w("RemoteVolume", "TV volume command failed", it) }
        }
      }
    }
    return true
  }

}
