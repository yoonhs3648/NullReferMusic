package com.nullrefer.music.ondevice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.nullrefer.music.R

/**
 * 다운로드 "진행" 알림을 네이티브 ongoing 알림으로 관리한다.
 * - 알림창 "지우기" / 스와이프로 제거되지 않음
 * - 완료 알림은 JS(expo-notifications) 경로를 그대로 사용
 */
class NrmProgressNotificationModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmProgressNotification"

  @ReactMethod
  fun showAudioProgress(title: String, body: String) {
    ensureChannel(CH_AUDIO_PROGRESS, "오디오 다운로드 진행")
    notify(
        id = NOTIF_AUDIO_PROGRESS_ID,
        channelId = CH_AUDIO_PROGRESS,
        title = title.trim(),
        body = body.trim(),
    )
  }

  @ReactMethod
  fun showLyricsProgress(title: String, body: String) {
    ensureChannel(CH_LYRICS_PROGRESS, "가사 생성 진행")
    notify(
        id = NOTIF_LYRICS_PROGRESS_ID,
        channelId = CH_LYRICS_PROGRESS,
        title = title.trim(),
        body = body.trim(),
    )
  }

  @ReactMethod
  fun dismissAudioProgress() {
    notificationManager().cancel(NOTIF_AUDIO_PROGRESS_ID)
  }

  @ReactMethod
  fun dismissLyricsProgress() {
    notificationManager().cancel(NOTIF_LYRICS_PROGRESS_ID)
  }

  private fun notify(id: Int, channelId: String, title: String, body: String) {
    val notification =
        NotificationCompat.Builder(reactContext, channelId)
            .setSmallIcon(R.drawable.notification_icon)
            .setContentTitle(title.ifBlank { "작업 진행 중" })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    notificationManager().notify(id, notification)
  }

  private fun ensureChannel(channelId: String, name: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = notificationManager()
    val existing = nm.getNotificationChannel(channelId)
    if (existing != null) return
    val channel =
        NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_LOW).apply {
          setShowBadge(false)
          description = "다운로드 진행 상태 알림"
        }
    nm.createNotificationChannel(channel)
  }

  private fun notificationManager(): NotificationManager {
    return reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  }

  companion object {
    private const val CH_AUDIO_PROGRESS = "nrm_audio_progress"
    private const val CH_LYRICS_PROGRESS = "nrm_lyrics_progress"
    private const val NOTIF_AUDIO_PROGRESS_ID = 9201
    private const val NOTIF_LYRICS_PROGRESS_ID = 9202
  }
}
