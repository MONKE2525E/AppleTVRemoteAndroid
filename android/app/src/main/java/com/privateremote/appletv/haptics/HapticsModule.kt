package com.privateremote.appletv.haptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.facebook.react.bridge.ReactApplicationContext
import com.privateremote.appletv.specs.NativeHapticsSpec

/**
 * Short, subtle taps on control press -- matches the Apple TV Remote app's
 * press-state feedback. Deliberately a plain Vibrator call, not a haptics
 * library dependency.
 */
class HapticsModule(reactContext: ReactApplicationContext) : NativeHapticsSpec(reactContext) {

    override fun getName() = NAME

    private val vibrator: Vibrator? by lazy {
        val context = reactApplicationContext.applicationContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            manager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    override fun impact(style: String) {
        // Best-effort only: a missing VIBRATE permission, missing vibrator, or
        // OEM quirk must never become a RedBox on a control press.
        runCatching {
            val v = vibrator ?: return
            if (!v.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val amplitude = when (style) {
                    "heavy" -> 180
                    "medium" -> 120
                    "selection" -> 60
                    else -> 80 // "light"
                }
                v.vibrate(VibrationEffect.createOneShot(12, amplitude))
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(12, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(12)
            }
        }
    }

    companion object {
        const val NAME = NativeHapticsSpec.NAME
    }
}
