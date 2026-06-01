package com.nullrefer.music.ondevice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import java.util.concurrent.ConcurrentHashMap

/**
 * 다운로드·Whisper 등 장시간 작업 중 프로세스가 OS에 의해 kill 되지 않도록
 * Foreground Service + (선택) WakeLock 참조 카운트를 관리합니다.
 *
 * 사용자가 최근 앱 목록에서 스와이프 종료하면 프로세스와 함께 종료됩니다.
 */
object NrmBackgroundWorkCoordinator {
  private val tokens = ConcurrentHashMap.newKeySet<String>()
  @Volatile private var wakeLock: PowerManager.WakeLock? = null

  fun activeTokenCount(): Int = tokens.size

  fun acquire(context: Context, token: String) {
    val trimmed = token.trim()
    if (trimmed.isEmpty()) return
    tokens.add(trimmed)
    ensureService(context.applicationContext)
    acquireWakeLock(context.applicationContext)
    NrmBackgroundWorkService.refreshNotification(context.applicationContext)
  }

  fun release(context: Context, token: String) {
    val trimmed = token.trim()
    if (trimmed.isEmpty()) return
    tokens.remove(trimmed)
    if (tokens.isEmpty()) {
      releaseWakeLock()
      stopService(context.applicationContext)
    } else {
      NrmBackgroundWorkService.refreshNotification(context.applicationContext)
    }
  }

  /** 최근 앱 스와이프 종료 등 비정상 경로에서도 잔존 상태를 강제 정리 */
  fun clearAll(context: Context, reason: String) {
    val appContext = context.applicationContext
    val hadTokens = tokens.size
    tokens.clear()
    releaseWakeLock()
    stopService(appContext)
    NrmFileLogger.log("bg-work", "Force clear reason=$reason tokens=$hadTokens")
  }

  fun notificationBody(): String {
    val count = tokens.size
    return if (count <= 1) {
      "다운로드·가사 생성 작업을 계속 진행합니다."
    } else {
      "다운로드·가사 생성 작업 $count 건을 계속 진행합니다."
    }
  }

  private fun ensureService(context: Context) {
    val intent = Intent(context, NrmBackgroundWorkService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }

  private fun stopService(context: Context) {
    context.stopService(Intent(context, NrmBackgroundWorkService::class.java))
  }

  private fun acquireWakeLock(context: Context) {
    if (wakeLock?.isHeld == true) return
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    val wl =
        pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NullReferenceMusic:nrm-bg-work").apply {
          setReferenceCounted(false)
        }
    wl.acquire(6L * 60L * 60L * 1000L)
    wakeLock = wl
    NrmFileLogger.log("bg-work", "WakeLock acquire tokens=${tokens.size}")
  }

  private fun releaseWakeLock() {
    val wl = wakeLock ?: return
    if (wl.isHeld) {
      try {
        wl.release()
      } catch (_: RuntimeException) {
        /* already released */
      }
    }
    wakeLock = null
    NrmFileLogger.log("bg-work", "WakeLock release")
  }
}
