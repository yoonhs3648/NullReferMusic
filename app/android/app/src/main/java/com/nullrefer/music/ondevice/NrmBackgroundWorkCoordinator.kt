package com.nullrefer.music.ondevice

import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import com.nullrefer.music.NrmBrand
import java.util.concurrent.ConcurrentHashMap

/**
 * 다운로드·Whisper 등 장시간 작업 중 프로세스가 OS에 의해 kill 되지 않도록
 * Foreground Service + (선택) WakeLock 참조 카운트를 관리합니다.
 *
 * 작업 토큰이 활성인 동안 최근 앱 스와이프로도 FGS를 유지합니다.
 */
object NrmBackgroundWorkCoordinator {
  private val tokens = ConcurrentHashMap.newKeySet<String>()
  private val stopHandler = Handler(Looper.getMainLooper())
  @Volatile private var pendingStopRunnable: Runnable? = null
  @Volatile private var wakeLock: PowerManager.WakeLock? = null
  @Volatile private var stopRequested: Boolean = false
  @Volatile private var pendingServiceRestart: Boolean = false

  /** lane 전환·큐 handoff 시 FGS/WakeLock 0 틈 방지 (ms) */
  private const val STOP_DEFER_MS = 750L

  fun activeTokenCount(): Int = tokens.size

  fun hasDownloadTokens(): Boolean = tokens.any { it.startsWith("dl:") }

  fun hasLyricsTokens(): Boolean =
      tokens.any { it.startsWith("lyrics:") || it.startsWith("whisper-lrc:") }

  fun hasBlockingExitWork(): Boolean =
      hasDownloadTokens() || hasLyricsTokens() || hasModelInstallTokens()

  fun hasModelInstallTokens(): Boolean =
      tokens.any {
        it == "model-install-queue" ||
            it.startsWith("whisper-model:") ||
            it.startsWith("forced-align:")
      }

  fun hasModelTokens(): Boolean = hasModelInstallTokens()

  /** FGS startForeground type — 다운로드(dataSync) vs 가사·align(mediaProcessing, API 34+) */
  fun resolveForegroundServiceType(): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
    var type = 0
    if (hasDownloadTokens()) {
      type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    }
    val mediaWork =
        hasLyricsTokens() ||
            tokens.any { it.startsWith("forced-align:") || it.startsWith("whisper-lrc:") }
    if (mediaWork && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING
    }
    if (type == 0) {
      type = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    }
    return type
  }

  fun acquire(context: Context, token: String) {
    val trimmed = token.trim()
    if (trimmed.isEmpty()) return
    cancelPendingStop()
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
      scheduleStopIfIdle(context.applicationContext)
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
    cancelPendingStop()
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

    val forcedAlignDownloads = tokens.filter { it.startsWith("forced-align:") }.sorted()
    for (token in forcedAlignDownloads) {
      val modelId = token.removePrefix("forced-align:").trim()
      val entry = AlignModelCatalog.entryById(modelId)
      val label = entry?.label ?: modelId
      val pct = AlignModelDownloader.progressFor(modelId)
      lines.add(
          if (pct in 0..99) {
            "«$label» 모델 다운로드 중 ($pct%)"
          } else {
            "«$label» 모델 다운로드 중"
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

    val lyricsJs = tokens.count { it.startsWith("lyrics:") }
    val whisperLrc = tokens.count { it.startsWith("whisper-lrc:") }
    val forcedAlign = tokens.count { it.startsWith("forced-align:") }
    val lyricsBusy = lyricsJs + whisperLrc + forcedAlign
    if (lyricsBusy > 0) {
      lines.add(
          if (lyricsBusy == 1) {
            "가사(LRC) 생성 중"
          } else {
            "가사(LRC) 생성 중 (${lyricsBusy}곡 대기)"
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

  /** onDestroy에서 FGS 재시작이 OS에 막힌 경우 — Activity 재진입 시 재시도 */
  fun markPendingServiceRestart(pending: Boolean) {
    pendingServiceRestart = pending
  }

  fun hasPendingServiceRestart(): Boolean = pendingServiceRestart

  fun restartPendingServiceIfNeeded(context: Context) {
    if (!pendingServiceRestart) return
    if (!shouldRunForegroundService()) {
      pendingServiceRestart = false
      return
    }
    try {
      ensureService(context.applicationContext)
      pendingServiceRestart = false
      NrmFileLogger.log("bg-work", "ForegroundService restart recovered on foreground")
    } catch (e: Exception) {
      NrmFileLogger.warn("bg-work", "FGS pending restart still blocked err=${e.message}")
    }
  }

  /** onDestroy 등 백그라운드에서 FGS 재시작 시도 — 실패하면 pending 플래그만 설정 */
  fun tryRestartServiceFromBackground(context: Context): Boolean {
    if (!shouldAutoRestartService()) return false
    return try {
      ensureService(context.applicationContext)
      pendingServiceRestart = false
      true
    } catch (e: Exception) {
      pendingServiceRestart = true
      NrmFileLogger.warn("bg-work", "FGS restart deferred err=${e.message}")
      false
    }
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

  private fun cancelPendingStop() {
    pendingStopRunnable?.let { stopHandler.removeCallbacks(it) }
    pendingStopRunnable = null
  }

  /** 마지막 토큰 release 직후 lane handoff 틈 — WakeLock·FGS를 즉시 내리지 않음 */
  private fun scheduleStopIfIdle(context: Context) {
    cancelPendingStop()
    val runnable =
        Runnable {
          pendingStopRunnable = null
          if (tokens.isNotEmpty()) return@Runnable
          stopRequested = true
          releaseWakeLock()
          NrmStaleWorkNotificationCleanup.markWorkActive(context, false)
          stopService(context)
          NrmFileLogger.log("bg-work", "Deferred stop complete active=0")
        }
    pendingStopRunnable = runnable
    stopHandler.postDelayed(runnable, STOP_DEFER_MS)
    NrmFileLogger.log("bg-work", "Deferred stop scheduled ms=$STOP_DEFER_MS")
  }
}
