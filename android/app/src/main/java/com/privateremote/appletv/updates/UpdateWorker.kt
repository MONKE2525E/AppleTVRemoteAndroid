package com.privateremote.appletv.updates

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import com.privateremote.appletv.MainActivity
import java.util.concurrent.TimeUnit

class UpdateWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        try {
            val updater = GitHubUpdater(applicationContext)
            val release = updater.latest() ?: return@withContext Result.success()
            if (release.versionCode <= updater.installedCode) return@withContext Result.success()
            if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED && android.os.Build.VERSION.SDK_INT >= 33) return@withContext Result.success()
            val manager = applicationContext.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel("app_updates", "App updates", NotificationManager.IMPORTANCE_DEFAULT))
            val intent = Intent(applicationContext, MainActivity::class.java)
            val pending = PendingIntent.getActivity(applicationContext, 102, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            manager.notify(102, NotificationCompat.Builder(applicationContext, "app_updates")
                .setSmallIcon(android.R.drawable.ic_menu_info_details).setContentTitle("TV Remote ${release.versionName} is available")
                .setContentText("Tap to open the app and install the update.").setContentIntent(pending).setAutoCancel(true).build())
            Result.success()
        } catch (_: Exception) { Result.retry() }
    }
    companion object {
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<UpdateWorker>(24, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("github_release_check", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
