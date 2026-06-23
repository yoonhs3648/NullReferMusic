package com.nullrefer.music.ondevice

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import com.nullrefer.music.MainActivity
import com.nullrefer.music.R

/**
 * Foreground Service 알림을 진행 알림(9201/9202) 또는 모델 전용(9001)에 묶는다.
 * - JS 진행 알림과 FG Service가 같은 ID를 공유해 "NullReferenceMusic" 중복 알림을 없앤다.
 * - 오디오 진행·가사 진행·완료 알림은 서로 다른 ID/채널을 유지한다.
 * - FG 알림 우선순위: 가사(9202) > 오디오(9201) — 작업 큐/토큰/JS 흐름은 변경하지 않음.
 */
object NrmForegroundNotificationBinder {
  const val NOTIF_MODEL_ID = NrmBackgroundWorkService.NOTIFICATION_ID
  const val NOTIF_AUDIO_PROGRESS_ID = 9201
  const val NOTIF_LYRICS_PROGRESS_ID = 9202

  @Volatile private var audioProgressActive = false
  @Volatile private var lyricsProgressActive = false
  @Volatile private var audioTitle = ""
  @Volatile private var audioBody = ""
  @Volatile private var lyricsTitle = ""
  @Volatile private var lyricsBody = ""

  fun onAudioProgressShown(title: String, body: String) {
    audioProgressActive = true
    audioTitle = title.trim()
    audioBody = body.trim()
  }

  fun onAudioProgressDismissed() {
    audioProgressActive = false
    audioTitle = ""
    audioBody = ""
  }

  fun onLyricsProgressShown(title: String, body: String) {
    lyricsProgressActive = true
    lyricsTitle = title.trim()
    lyricsBody = body.trim()
  }

  fun onLyricsProgressDismissed() {
    lyricsProgressActive = false
    lyricsTitle = ""
    lyricsBody = ""
  }

  fun syncForeground(context: Context) {
    val appContext = context.applicationContext
    if (NrmBackgroundWorkCoordinator.activeTokenCount() == 0) return

    val target = resolveForegroundTarget(appContext)
    val nm = notificationManager(appContext)
    nm.notify(target.id, target.notification)
    bindRunningService(appContext, target.id, target.notification)
    cancelStaleForegroundNotifications(appContext, boundId = target.id)
  }

  fun clearAllProgressNotifications(context: Context) {
    val appContext = context.applicationContext
    onAudioProgressDismissed()
    onLyricsProgressDismissed()
    val nm = notificationManager(appContext)
    nm.cancel(NOTIF_AUDIO_PROGRESS_ID)
    nm.cancel(NOTIF_LYRICS_PROGRESS_ID)
    nm.cancel(NOTIF_MODEL_ID)
  }

  fun buildAudioProgressNotification(context: Context, title: String, body: String): Notification {
    return buildProgressNotification(
        context = context,
        channelId = NrmProgressNotificationModule.CH_AUDIO_PROGRESS,
        title = title.ifBlank { "오디오 다운로드 중" },
        body = body,
    )
  }

  fun buildLyricsProgressNotification(context: Context, title: String, body: String): Notification {
    return buildProgressNotification(
        context = context,
        channelId = NrmProgressNotificationModule.CH_LYRICS_PROGRESS,
        title = title.ifBlank { "가사 생성 중" },
        body = body,
    )
  }

  private data class ForegroundTarget(val id: Int, val notification: Notification)

  private fun resolveForegroundTarget(context: Context): ForegroundTarget {
    if (lyricsProgressActive) {
      return ForegroundTarget(
          NOTIF_LYRICS_PROGRESS_ID,
          buildLyricsProgressNotification(context, lyricsTitle, lyricsBody),
      )
    }
    if (audioProgressActive) {
      return ForegroundTarget(
          NOTIF_AUDIO_PROGRESS_ID,
          buildAudioProgressNotification(context, audioTitle, audioBody),
      )
    }
    if (NrmBackgroundWorkCoordinator.hasModelInstallTokens()) {
      return ForegroundTarget(
          NOTIF_MODEL_ID,
          buildModelNotification(context),
      )
    }
    if (NrmBackgroundWorkCoordinator.hasLyricsTokens()) {
      return ForegroundTarget(
          NOTIF_LYRICS_PROGRESS_ID,
          buildLyricsProgressNotification(context, "가사 생성 중", ""),
      )
    }
    if (NrmBackgroundWorkCoordinator.hasDownloadTokens()) {
      return ForegroundTarget(
          NOTIF_AUDIO_PROGRESS_ID,
          buildAudioProgressNotification(context, "오디오 다운로드 중", ""),
      )
    }
    return ForegroundTarget(
        NOTIF_MODEL_ID,
        buildModelNotification(context),
    )
  }

  private fun buildModelNotification(context: Context): Notification {
    NrmBackgroundWorkService.ensureModelChannel(context)
    val launchIntent = Intent(context, MainActivity::class.java)
    val pending =
        PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    val body = NrmBackgroundWorkCoordinator.notificationBody()
    return NotificationCompat.Builder(context, NrmBackgroundWorkService.CHANNEL_ID)
        .setSmallIcon(R.drawable.notification_icon)
        .setContentTitle(context.getString(R.string.nrm_bg_work_notification_title))
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setContentIntent(pending)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()
  }

  private fun buildProgressNotification(
      context: Context,
      channelId: String,
      title: String,
      body: String,
  ): Notification {
    val launchIntent = Intent(context, MainActivity::class.java)
    val pending =
        PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    return NotificationCompat.Builder(context, channelId)
        .setSmallIcon(R.drawable.notification_icon)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setContentIntent(pending)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()
  }

  private fun bindRunningService(context: Context, id: Int, notification: Notification) {
    val service = NrmBackgroundWorkService.runningInstance ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      service.startForeground(
          id,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      @Suppress("DEPRECATION")
      service.startForeground(id, notification)
    }
  }

  private fun cancelStaleForegroundNotifications(context: Context, boundId: Int) {
    val nm = notificationManager(context)
    if (boundId != NOTIF_MODEL_ID) {
      nm.cancel(NOTIF_MODEL_ID)
    }
    if (boundId != NOTIF_AUDIO_PROGRESS_ID && !audioProgressActive) {
      nm.cancel(NOTIF_AUDIO_PROGRESS_ID)
    }
    if (boundId != NOTIF_LYRICS_PROGRESS_ID && !lyricsProgressActive) {
      nm.cancel(NOTIF_LYRICS_PROGRESS_ID)
    }
  }

  private fun notificationManager(context: Context) =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
}
