package com.privateremote.appletv.appletv

import android.app.Notification
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.os.Build
import android.os.IBinder
import androidx.media3.common.util.UnstableApi
import androidx.test.platform.app.InstrumentationRegistry
import com.privateremote.appletv.MainActivity
import dev.atvremote.protocol.discovery.AppleTvDevice
import dev.atvremote.protocol.mrp.NowPlaying
import dev.atvremote.protocol.mrp.PlaybackState
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@UnstableApi
class PlaybackLiveUpdateAndroidTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val manager = context.getSystemService(NotificationManager::class.java)

    @Test fun eligibilityAndPlaybackOnlyLifecycle() {
        val activity = PlaybackLiveUpdate(context)
        for (state in PlaybackState.entries.filter { it != PlaybackState.PLAYING }) {
            activity.update(NowPlaying(title = "Retained title", playbackState = state))
            assertNull("Must hide for $state", activity.build("Living room", true))
        }
        activity.update(NowPlaying(title = "Test movie", playbackState = PlaybackState.PLAYING, duration = 1800.0, elapsedTime = 60.0))
        assertNull(activity.build(null, true))
        val image = Bitmap.createBitmap(1024, 768, Bitmap.Config.ARGB_8888)
        image.eraseColor(android.graphics.Color.BLUE)
        val bytes = java.io.ByteArrayOutputStream().apply { image.compress(Bitmap.CompressFormat.PNG, 100, this) }.toByteArray()
        image.recycle()
        activity.update(NowPlaying(title = "Test movie", playbackState = PlaybackState.PLAYING,
            duration = 1800.0, elapsedTime = 60.0, artwork = bytes))
        val notification = activity.build("Living room", true)!!
        assertNotNull("Artwork decoding must handle non-empty image data", notification.getLargeIcon())
        assertTrue(notification.flags and Notification.FLAG_ONGOING_EVENT != 0)
        assertEquals(3, notification.actions.size)
        if (Build.VERSION.SDK_INT >= 36) assertTrue(notification.hasPromotableCharacteristics())
        activity.dismiss()
        assertNull(activity.build("Living room", true))
        activity.update(NowPlaying(title = "Test movie", playbackState = PlaybackState.PLAYING, elapsedTime = 65.0))
        assertNull("Updates must respect dismissal", activity.build("Living room", true))
        activity.update(null)
        assertNull(activity.build("Living room", true))
        activity.update(NowPlaying(playbackState = PlaybackState.PLAYING, duration = Double.NaN, elapsedTime = Double.POSITIVE_INFINITY))
        val live = activity.build("Living room", false)!!
        assertEquals(1, live.actions.size)
        assertEquals("android.app.Notification\$BigTextStyle", live.extras.getString(Notification.EXTRA_TEMPLATE))
        val roku = activity.build("Roku", true, transportKeys = true)!!
        assertEquals("Rewind", roku.actions[0].title)
        assertEquals("Fast forward", roku.actions[2].title)
        assertEquals("Playing", live.extras.getString(Notification.EXTRA_TEXT))
        if (Build.VERSION.SDK_INT >= 36) assertTrue(live.hasPromotableCharacteristics())
    }

    /** Real controller polling and action HTTP calls against a local TV protocol fixture. */
    @Test fun systemPromotionBackgroundControlsAndRemoval() = runBlocking {
        val executor = Executors.newSingleThreadExecutor()
        var binder: AppleTVService.LocalBinder? = null
        val bound = CountDownLatch(1)
        val connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                binder = service as AppleTVService.LocalBinder
                bound.countDown()
            }
            override fun onServiceDisconnected(name: ComponentName?) { binder = null }
        }
        val store = CredentialStore(context)
        val device = AppleTvDevice("Living room test TV", "127.0.0.1", 8060, identifier = "roku:live-update-test")
        val state = AtomicReference("pause")
        val pausedCommand = CountDownLatch(1)
        val rewindCommand = CountDownLatch(1)
        val forwardCommand = CountDownLatch(1)
        val channelLookup = CountDownLatch(1)
        val iconLookup = CountDownLatch(1)
        val artwork = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888).let { image ->
            image.eraseColor(android.graphics.Color.BLUE)
            java.io.ByteArrayOutputStream().apply { image.compress(Bitmap.CompressFormat.PNG, 100, this) }.toByteArray().also { image.recycle() }
        }
        ServerSocket(8060).use { server ->
            server.soTimeout = 1000
            val responder = executor.submit {
                while (!Thread.currentThread().isInterrupted && !server.isClosed) {
                    val client = try { server.accept() } catch (_: java.net.SocketTimeoutException) { continue }
                    client.use {
                        it.soTimeout = 3000
                        val input = it.getInputStream().bufferedReader()
                        val request = input.readLine()
                        while (!input.readLine().isNullOrEmpty()) { }
                        val body = when {
                            request.contains("query/active-app") -> { channelLookup.countDown(); "<active-app><app id=\"17\">Test player</app></active-app>" }
                            request.contains("query/device-info") -> "<device-info><serial-number>live-update-test</serial-number><user-device-name>Living room test TV</user-device-name></device-info>"
                            request.contains("keypress/Rev") -> { rewindCommand.countDown(); "" }
                            request.contains("keypress/Fwd") -> { forwardCommand.countDown(); "" }
                            request.contains("keypress/Play") -> { state.set("pause"); pausedCommand.countDown(); "" }
                            else -> "<player state=\"${state.get()}\"><title>Test movie</title><runtime>1800000 ms</runtime><is_live>false</is_live><position>120000 ms</position></player>"
                        }.toByteArray()
                        val payload = if (request.contains("query/icon/17")) { iconLookup.countDown(); artwork } else body
                        it.getOutputStream().apply {
                            write("HTTP/1.1 200 OK\r\nContent-Length: ${payload.size}\r\nConnection: close\r\n\r\n".toByteArray())
                            write(payload)
                            flush()
                        }
                    }
                }
            }
            try {
                store.saveLastDevice(device)
                context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                instrumentation.runOnMainSync { context.bindService(Intent(context, AppleTVService::class.java), connection, Context.BIND_AUTO_CREATE) }
                assertTrue(bound.await(10, TimeUnit.SECONDS))
                val c = binder!!.getController()
                c.connect(device.credentialKey)
                awaitCondition { c.snapshotPlayback()?.playbackState == PlaybackState.PAUSED }
                assertNull(active())
                shell("cmd statusbar expand-notifications")
                Thread.sleep(1000)
                screenshot("before-paused")
                shell("cmd statusbar collapse")
                state.set("play")
                awaitCondition { active() != null }
                awaitCondition { mediaActivity() != null }
                assertEquals("android.app.Notification\$MediaStyle", mediaActivity()!!.extras.getString(Notification.EXTRA_TEMPLATE))
                val token = mediaActivity()!!.extras.getParcelable<android.media.session.MediaSession.Token>(Notification.EXTRA_MEDIA_SESSION)
                assertNotNull("MediaStyle must carry the real Media3 platform session token", token)
                assertFalse("The previous notification must not be posted", manager.activeNotifications.any { it.id == PlaybackLiveUpdate.ID })
                val platformController = android.media.session.MediaController(context, token!!)
                awaitCondition { platformController.metadata?.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION) == 1_800_000L }
                awaitCondition { platformController.metadata?.getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART) != null }
                assertTrue("Missing plugin identity must be resolved from the active app", channelLookup.await(5, TimeUnit.SECONDS))
                assertTrue("Channel artwork must be fetched from Roku", iconLookup.await(5, TimeUnit.SECONDS))
                assertEquals(android.graphics.Color.BLUE, platformController.metadata!!.getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART).getPixel(0, 0))
                awaitCondition { platformController.playbackState?.customActions?.size == 2 }
                assertTrue(platformController.playbackState!!.position >= 120_000)
                val customActions = platformController.playbackState!!.customActions
                assertEquals(listOf("Rewind", "Fast forward"), customActions.map { it.name.toString() })
                platformController.transportControls.sendCustomAction(customActions[0].action, android.os.Bundle.EMPTY)
                assertTrue("System media rewind must reach Roku", rewindCommand.await(5, TimeUnit.SECONDS))
                platformController.transportControls.sendCustomAction(customActions[1].action, android.os.Bundle.EMPTY)
                assertTrue("System media fast-forward must reach Roku", forwardCommand.await(5, TimeUnit.SECONDS))
                shell("input keyevent KEYCODE_HOME")
                Thread.sleep(1500)
                assertEquals(true, binder!!.mediaDiagnostics()["playbackForeground"])
                assertEquals("Rewind", active()!!.actions[0].title)
                active()!!.actions[0].actionIntent.send()
                assertTrue("Rewind must reach the Roku", rewindCommand.await(5, TimeUnit.SECONDS))
                active()!!.actions[2].actionIntent.send()
                assertTrue("Fast forward must reach the Roku", forwardCommand.await(5, TimeUnit.SECONDS))
                screenshot("playing-chip")
                shell("cmd statusbar expand-notifications")
                Thread.sleep(1000)
                screenshot("playing-card")
                val hold = InstrumentationRegistry.getArguments().getString("visualHoldSeconds")?.toLongOrNull() ?: 0
                if (hold > 0) Thread.sleep(hold.coerceAtMost(60) * 1000)
                shell("cmd statusbar collapse")
                shell("input keyevent KEYCODE_SLEEP")
                Thread.sleep(2000)
                shell("input keyevent KEYCODE_WAKEUP")
                Thread.sleep(2000)
                screenshot("playing-lock-screen")
                shell("wm dismiss-keyguard")
                shell("cmd statusbar expand-notifications")
                active()!!.actions.single { it.title == "Pause" }.actionIntent.send()
                assertTrue("Pause reached TV protocol", pausedCommand.await(5, TimeUnit.SECONDS))
                awaitCondition { active() == null }
                assertEquals(false, binder!!.mediaDiagnostics()["playbackForeground"])
                shell("cmd statusbar expand-notifications")
                Thread.sleep(1000)
                screenshot("after-paused")
                awaitCondition { mediaActivity() == null }
                state.set("play")
                awaitCondition { active() != null && mediaActivity() != null }
                // Exercise the same session command Samsung's Now Bar media control sends,
                // rather than testing only our notification action PendingIntent.
                val nextToken = mediaActivity()!!.extras.getParcelable<android.media.session.MediaSession.Token>(Notification.EXTRA_MEDIA_SESSION)!!
                val systemController = android.media.session.MediaController(context, nextToken)
                awaitCondition { systemController.playbackState?.state == android.media.session.PlaybackState.STATE_PLAYING }
                assertEquals("TV playback must be advertised as remote, not phone audio", android.media.session.MediaController.PlaybackInfo.PLAYBACK_TYPE_REMOTE, systemController.playbackInfo.playbackType)
                systemController.transportControls.pause()
                awaitCondition { state.get() == "pause" && active() == null && mediaActivity() == null }
                state.set("play")
                awaitCondition { active() != null && mediaActivity() != null }
                state.set("stop")
                awaitCondition { active() == null && mediaActivity() == null }
                state.set("play")
                awaitCondition { active() != null }
                c.disconnect()
                awaitCondition { active() == null && mediaActivity() == null }
            } finally {
                binder?.getController()?.disconnect()
                store.clearLastDevice()
                instrumentation.runOnMainSync { context.unbindService(connection) }
                responder.cancel(true)
                executor.shutdownNow()
            }
        }
    }

    private fun active(): Notification? = manager.activeNotifications.firstOrNull { it.id == PlaybackLiveUpdate.MEDIA_ID }?.notification
    private fun mediaActivity(): Notification? = manager.activeNotifications.firstOrNull { it.id == PlaybackLiveUpdate.MEDIA_ID }?.notification
    private fun shell(command: String) {
        shellOutput(command)
    }
    private fun shellOutput(command: String): String =
        android.os.ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand(command)).use { it.readBytes().toString(Charsets.UTF_8) }
    private fun awaitCondition(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15)
        while (System.nanoTime() < deadline) {
            if (condition()) return
            Thread.sleep(100)
        }
        fail("Playback activity condition timed out")
    }
    private fun screenshot(name: String) {
        val dir = File(context.getExternalFilesDir(null), "live-update-evidence").apply { mkdirs() }
        instrumentation.uiAutomation.takeScreenshot()?.let { bitmap ->
            File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
    }
}
