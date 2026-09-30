package com.privateremote.appletv.fold

import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.privateremote.appletv.specs.NativeFoldStateSpec
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

private data class FoldSnapshot(
    val posture: String,
    val bounds: android.graphics.Rect?,
    val orientation: String,
    val isSeparating: Boolean,
    val occlusionType: String,
) {
    fun toWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("posture", posture)
        if (bounds == null) {
            putNull("bounds")
        } else {
            putMap(
                "bounds",
                Arguments.createMap().apply {
                    putInt("left", bounds.left)
                    putInt("top", bounds.top)
                    putInt("right", bounds.right)
                    putInt("bottom", bounds.bottom)
                },
            )
        }
        putString("orientation", orientation)
        putBoolean("isSeparating", isSeparating)
        putString("occlusionType", occlusionType)
    }

    companion object {
        val FLAT = FoldSnapshot(
            posture = "flat",
            bounds = null,
            orientation = "none",
            isSeparating = false,
            occlusionType = "none",
        )

        fun from(info: WindowLayoutInfo): FoldSnapshot {
            val folding = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull() ?: return FLAT
            return FoldSnapshot(
                posture = when (folding.state) {
                    FoldingFeature.State.HALF_OPENED -> "half_opened"
                    else -> "flat"
                },
                bounds = folding.bounds,
                orientation = when (folding.orientation) {
                    FoldingFeature.Orientation.HORIZONTAL -> "horizontal"
                    FoldingFeature.Orientation.VERTICAL -> "vertical"
                    else -> "none"
                },
                isSeparating = folding.isSeparating,
                occlusionType = when (folding.occlusionType) {
                    FoldingFeature.OcclusionType.FULL -> "full"
                    else -> "none"
                },
            )
        }
    }
}

/**
 * Standalone fold/hinge reporting via Jetpack WindowManager. Deliberately has
 * no dependency on AppleTVService/AppleTVModule in either direction -- see
 * the layering note in the project plan.
 */
class FoldStateModule(reactContext: ReactApplicationContext) : NativeFoldStateSpec(reactContext) {

    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var collectJob: Job? = null
    private var lastSnapshot: FoldSnapshot = FoldSnapshot.FLAT

    private val lifecycleListener = object : LifecycleEventListener {
        override fun onHostResume() { startCollecting() }
        override fun onHostPause() { stopCollecting() }
        override fun onHostDestroy() { stopCollecting() }
    }

    init {
        reactContext.addLifecycleEventListener(lifecycleListener)
        if (reactContext.hasCurrentActivity()) startCollecting()
    }

    private fun startCollecting() {
        val activity = reactApplicationContext.currentActivity ?: return
        collectJob?.cancel()
        collectJob = moduleScope.launch {
            runCatching {
                WindowInfoTracker.getOrCreate(activity).windowLayoutInfo(activity).collectLatest { info ->
                    val snapshot = FoldSnapshot.from(info)
                    lastSnapshot = snapshot
                    emit("foldStateChanged", snapshot.toWritableMap())
                }
            }
        }
    }

    private fun stopCollecting() {
        collectJob?.cancel()
        collectJob = null
    }

    override fun getCurrentFoldState(promise: Promise) {
        promise.resolve(lastSnapshot.toWritableMap())
    }

    override fun addListener(eventName: String) { /* required by NativeEventEmitter; events are always-on here */ }
    override fun removeListeners(count: Double) { /* see addListener */ }

    override fun invalidate() {
        stopCollecting()
        moduleScope.cancel()
        reactApplicationContext.removeLifecycleEventListener(lifecycleListener)
        super.invalidate()
    }

    private fun emit(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
