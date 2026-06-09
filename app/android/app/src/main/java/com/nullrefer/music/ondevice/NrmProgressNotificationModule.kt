package com.nullrefer.music.ondevice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 오디오/가사 "진행" 알림 — Foreground Service와 동일 ID를 공유한다.
 * 완료 알림은 JS(expo-notifications)에서 항목별 개별 ID로 표시한다.
 */
class NrmProgressNotificationModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmProgressNotification"

  @ReactMethod
  fun showAudioProgress(title: String, body: String) {
    ensureChannel(CH_AUDIO_PROGRESS, "오디오 다운로드 진행")
    val trimmedTitle = title.trim()
    val trimmedBody = body.trim()
    NrmForegroundNotificationBinder.onAudioProgressShown(trimmedTitle, trimmedBody)
    val notification =
        NrmForegroundNotificationBinder.buildAudioProgressNotification(
            reactContext,
            trimmedTitle,
            trimmedBody,
        )
    notificationManager().notify(NOTIF_AUDIO_PROGRESS_ID, notification)
    NrmForegroundNotificationBinder.syncForeground(reactContext)
  }

  @ReactMethod
  fun showLyricsProgress(title: String, body: String) {
    ensureChannel(CH_LYRICS_PROGRESS, "가사 생성 진행")
    val trimmedTitle = title.trim()
    val trimmedBody = body.trim()
    NrmForegroundNotificationBinder.onLyricsProgressShown(trimmedTitle, trimmedBody)
    val notification =
        NrmForegroundNotificationBinder.buildLyricsProgressNotification(
            reactContext,
            trimmedTitle,
            trimmedBody,
        )
    notificationManager().notify(NOTIF_LYRICS_PROGRESS_ID, notification)
    NrmForegroundNotificationBinder.syncForeground(reactContext)
  }

  @ReactMethod
  fun dismissAudioProgress() {
    NrmForegroundNotificationBinder.onAudioProgressDismissed()
    notificationManager().cancel(NOTIF_AUDIO_PROGRESS_ID)
    NrmForegroundNotificationBinder.syncForeground(reactContext)
  }

  @ReactMethod
  fun dismissLyricsProgress() {
    NrmForegroundNotificationBinder.onLyricsProgressDismissed()
    notificationManager().cancel(NOTIF_LYRICS_PROGRESS_ID)
    NrmForegroundNotificationBinder.syncForeground(reactContext)
  }

  /** JS cold start 시 네이티브·expo 잔존 진행 알림 이중 정리 */
  @ReactMethod
  fun reconcileStaleProgressOnColdStart() {
    NrmStaleWorkNotificationCleanup.reconcileOnColdStart(reactContext)
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
    const val CH_AUDIO_PROGRESS = "nrm_audio_progress"
    const val CH_LYRICS_PROGRESS = "nrm_lyrics_progress"
    private const val NOTIF_AUDIO_PROGRESS_ID = NrmForegroundNotificationBinder.NOTIF_AUDIO_PROGRESS_ID
    private const val NOTIF_LYRICS_PROGRESS_ID = NrmForegroundNotificationBinder.NOTIF_LYRICS_PROGRESS_ID
  }
}
