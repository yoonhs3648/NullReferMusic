package com.nullrefer.music.ondevice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.nullrefer.music.MainActivity
import com.nullrefer.music.R

/** 장시간 다운로드·Whisper — Foreground Service로 백그라운드 kill 완화 */
class NrmBackgroundWorkService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    NrmBackgroundWorkCoordinator.onServiceStarted()
    val notification = buildNotification(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    NrmFileLogger.log(
        "bg-work",
        "ForegroundService start tokens=${NrmBackgroundWorkCoordinator.activeForegroundTokenCount()}",
    )
    if (NrmBackgroundWorkCoordinator.activeForegroundTokenCount() == 0) {
      stopSelf()
    }
    return START_STICKY
  }

  override fun onDestroy() {
    if (NrmBackgroundWorkCoordinator.shouldAutoRestartService()) {
      NrmFileLogger.warn(
          "bg-work",
          "ForegroundService destroyed unexpectedly while work remains; restarting service",
      )
      val intent = Intent(applicationContext, NrmBackgroundWorkService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        applicationContext.startForegroundService(intent)
      } else {
        applicationContext.startService(intent)
      }
    }
    clearForegroundNotification(this)
    NrmFileLogger.log("bg-work", "ForegroundService destroy")
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    NrmFileLogger.log("bg-work", "Task removed — stopping background work")
    NrmBackgroundWorkCoordinator.clearAll(applicationContext, "task_removed")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  companion object {
    private const val CHANNEL_ID = "nrm_background_work"
    const val NOTIFICATION_ID = 9001

    fun refreshNotification(context: Context) {
      if (NrmBackgroundWorkCoordinator.activeTokenCount() == 0) return
      ensureChannel(context)
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(NOTIFICATION_ID, buildNotification(context))
    }

    private fun clearForegroundNotification(context: Context) {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.cancel(NOTIFICATION_ID)
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val existing = nm.getNotificationChannel(CHANNEL_ID)
      if (existing != null) return
      val channel =
          NotificationChannel(
              CHANNEL_ID,
              context.getString(R.string.nrm_bg_work_channel_name),
              NotificationManager.IMPORTANCE_LOW,
          ).apply {
            description = context.getString(R.string.nrm_bg_work_channel_desc)
            setShowBadge(false)
          }
      nm.createNotificationChannel(channel)
    }

    private fun buildNotification(context: Context): Notification {
      val launchIntent = Intent(context, MainActivity::class.java)
      val pending =
          PendingIntent.getActivity(
              context,
              0,
              launchIntent,
              PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
          )
      return NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(R.drawable.notification_icon)
          .setContentTitle(context.getString(R.string.nrm_bg_work_notification_title))
          .setContentText(NrmBackgroundWorkCoordinator.notificationBody())
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setContentIntent(pending)
          .setCategory(NotificationCompat.CATEGORY_PROGRESS)
          .setPriority(NotificationCompat.PRIORITY_LOW)
          .build()
    }
  }
}
