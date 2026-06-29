package com.nullrefer.music.ondevice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.nullrefer.music.R

/** 장시간 다운로드·Whisper — Foreground Service로 백그라운드 kill 완화 */
class NrmBackgroundWorkService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    runningInstance = this
    ensureModelChannel(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    NrmBackgroundWorkCoordinator.onServiceStarted()
    if (NrmBackgroundWorkCoordinator.activeForegroundTokenCount() == 0) {
      stopSelf()
      return START_NOT_STICKY
    }
    NrmForegroundNotificationBinder.syncForeground(this)
    NrmFileLogger.log(
        "bg-work",
        "ForegroundService start tokens=${NrmBackgroundWorkCoordinator.activeForegroundTokenCount()}",
    )
    return START_STICKY
  }

  override fun onDestroy() {
    if (NrmBackgroundWorkCoordinator.shouldAutoRestartService()) {
      NrmFileLogger.warn(
          "bg-work",
          "ForegroundService destroyed unexpectedly while work remains; restarting service",
      )
      NrmBackgroundWorkCoordinator.tryRestartServiceFromBackground(applicationContext)
    }
    NrmForegroundNotificationBinder.clearAllProgressNotifications(this)
    NrmFileLogger.log("bg-work", "ForegroundService destroy")
    runningInstance = null
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (NrmBackgroundWorkCoordinator.activeTokenCount() > 0) {
      NrmFileLogger.log(
          "bg-work",
          "Task removed — work tokens remain (${NrmBackgroundWorkCoordinator.activeTokenCount()}); keeping FGS",
      )
      super.onTaskRemoved(rootIntent)
      return
    }
    NrmFileLogger.log("bg-work", "Task removed — no active work tokens; stopping service")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onLowMemory() {
    NrmFileLogger.warn("bg-work", "onLowMemory — clearing ongoing notifications if idle")
    if (NrmBackgroundWorkCoordinator.activeTokenCount() == 0) {
      NrmStaleWorkNotificationCleanup.forceClearOngoingWorkNotifications(
          applicationContext,
          "low_memory_idle",
      )
    }
    super.onLowMemory()
  }

  companion object {
    const val CHANNEL_ID = "nrm_background_work"
    const val NOTIFICATION_ID = 9001

    @Volatile var runningInstance: NrmBackgroundWorkService? = null

    fun refreshNotification(context: Context) {
      if (NrmBackgroundWorkCoordinator.activeTokenCount() == 0) return
      NrmForegroundNotificationBinder.syncForeground(context)
    }

    fun ensureModelChannel(context: Context) {
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
  }
}
