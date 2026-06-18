package com.nullrefer.music.ondevice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import com.nullrefer.music.NrmBrand
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
  @Volatile private var stopRequested: Boolean = false

  fun activeTokenCount(): Int = tokens.size

  fun hasDownloadTokens(): Boolean = tokens.any { it.startsWith("dl:") }

  fun hasLyricsTokens(): Boolean =
      tokens.any {
        it.startsWith("whisper-lrc:") || it.startsWith("whisperx-align:")
      }

  fun hasBlockingExitWork(): Boolean = hasDownloadTokens() || hasLyricsTokens()

  fun hasModelInstallTokens(): Boolean =
      tokens.any {
        it == "model-install-queue" ||
            it.startsWith("whisper-model:") ||
            it.startsWith("whisperx-align-model")
      }

  fun hasModelTokens(): Boolean = hasModelInstallTokens()

  fun acquire(context: Context, token: String) {
    val trimmed = token.trim()
    if (trimmed.isEmpty()) return
    tokens.add(trimmed)
    stopRequested = false
    if (tokens.size == 1) {
      NrmStaleWorkNotificationCleanup.markWorkActive(context.applicationContext, true)
    }
    if (shouldRunForegroundService()) {
      ensureService(context.applicationContext)
    } else {
      stopService(context.applicationContext)
    }
    acquireWakeLock(context.applicationContext)
    NrmFileLogger.log("bg-work", "acquire token=$trimmed active=${tokens.size}")
    if (shouldRunForegroundService()) {
      NrmBackgroundWorkService.refreshNotification(context.applicationContext)
    }
  }

  fun release(context: Context, token: String) {
    val trimmed = token.trim()
    if (trimmed.isEmpty()) return
    tokens.remove(trimmed)
    NrmFileLogger.log("bg-work", "release token=$trimmed active=${tokens.size}")
    if (tokens.isEmpty()) {
      stopRequested = true
      releaseWakeLock()
      NrmStaleWorkNotificationCleanup.markWorkActive(context.applicationContext, false)
      stopService(context.applicationContext)
    } else {
      if (shouldRunForegroundService()) {
        NrmBackgroundWorkService.refreshNotification(context.applicationContext)
      } else {
        stopService(context.applicationContext)
      }
    }
  }

  /** 최근 앱 스와이프 종료 등 비정상 경로에서도 잔존 상태를 강제 정리 */
  fun clearAll(context: Context, reason: String) {
    val appContext = context.applicationContext
    val hadTokens = tokens.size
    tokens.clear()
    stopRequested = true
    releaseWakeLock()
    NrmStaleWorkNotificationCleanup.markWorkActive(appContext, false)
    NrmStaleWorkNotificationCleanup.forceClearOngoingWorkNotifications(appContext, reason)
    NrmFileLogger.log("bg-work", "Force clear reason=$reason tokens=$hadTokens")
  }

  fun notificationBody(): String {
    if (tokens.isEmpty()) {
      return "작업을 마무리하는 중입니다."
    }

    val lines = mutableListOf<String>()

    val modelTokens = tokens.filter { it.startsWith("whisper-model:") }.sorted()
    for (token in modelTokens) {
      val modelId = token.removePrefix("whisper-model:").trim()
      val label = WhisperModelCatalog.displayLabel(modelId)
      val pct = WhisperModelDownloader.progressFor(modelId)
      lines.add(
          if (pct in 0..99) {
            "Whisper 모델 «$label» 다운로드 중 ($pct%)"
          } else {
            "Whisper 모델 «$label» 다운로드 중"
          },
      )
    }

    if (tokens.any { it == "whisperx-align-model" }) {
      val pct = AlignModelDownloader.progressPercent()
      lines.add(
          if (pct in 0..99) {
            "Forced Alignment 모델 설치 중 ($pct%)"
          } else {
            "Forced Alignment 모델 설치 중"
          },
      )
    }

    val waitCount = NrmModelInstallQueue.pendingCount()
    val runningLabel = NrmModelInstallQueue.currentLabel()
    if (waitCount > 1 && runningLabel != null) {
      lines.add("모델 설치 대기 중 (${waitCount - 1}건)")
    }

    val dlCount = tokens.count { it.startsWith("dl:") }
    if (dlCount > 0) {
      lines.add(
          if (dlCount == 1) {
            "오디오 파일 다운로드 중"
          } else {
            "오디오 파일 다운로드 중 (${dlCount}곡)"
          },
      )
    }

    val whisperLrc = tokens.count { it.startsWith("whisper-lrc:") }
    if (whisperLrc > 0) {
      lines.add(
          if (whisperLrc == 1) {
            "가사(LRC) 생성 중"
          } else {
            "가사(LRC) 생성 중 (${whisperLrc}곡 대기)"
          },
      )
    }

    if (lines.isEmpty()) {
      val count = tokens.size
      return if (count <= 1) {
        "백그라운드 작업을 계속 진행합니다."
      } else {
        "백그라운드 작업 $count 건을 계속 진행합니다."
      }
    }

    return lines.joinToString("\n")
  }

  private fun ensureService(context: Context) {
    stopRequested = false
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

  fun shouldAutoRestartService(): Boolean {
    return shouldRunForegroundService() && !stopRequested
  }

  fun onServiceStarted() {
    if (shouldRunForegroundService()) {
      stopRequested = false
    }
  }

  fun activeForegroundTokenCount(): Int = tokens.size

  /** 오디오 다운로드·LRC·모델 다운로드 등 활성 작업이 있으면 Foreground Service 유지 */
  private fun shouldRunForegroundService(): Boolean = tokens.isNotEmpty()

  private fun acquireWakeLock(context: Context) {
    if (wakeLock?.isHeld == true) return
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    val wl =
        pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "${NrmBrand.STORAGE_FOLDER_NAME}:nrm-bg-work").apply {
          setReferenceCounted(false)
        }
    wl.acquire()
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
