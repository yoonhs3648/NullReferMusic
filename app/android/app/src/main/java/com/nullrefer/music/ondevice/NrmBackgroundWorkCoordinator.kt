package com.nullrefer.music.ondevice

import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import com.nullrefer.music.NrmBrand
import java.util.concurrent.ConcurrentHashMap

/**
 * 다운로드·Whisper·Forced Alignment 등 장시간 작업 중 프로세스가 OS에 의해 kill 되지 않도록
 * Foreground Service + WakeLock(+다운로드 시 WifiLock) 참조 카운트를 관리합니다.
 *
 * 작업 토큰이 활성인 동안 최근 앱 스와이프로도 FGS를 유지합니다.
 *
 * 참고: Android에서 "절대 안 죽음"은 불가능하다. 목표는 생존 가능성 최대화.
 */
object NrmBackgroundWorkCoordinator {
  private val tokens = ConcurrentHashMap.newKeySet<String>()
  /** yt-dlp/innertube 추출이 실제 진행 중인 jobId — 큐 대기(dl 토큰만)와 구분 */
  private val activeAudioExtractJobs = ConcurrentHashMap.newKeySet<String>()
  private val stopHandler = Handler(Looper.getMainLooper())
  @Volatile private var pendingStopRunnable: Runnable? = null
  @Volatile private var wakeLock: PowerManager.WakeLock? = null
  @Volatile private var wifiLock: WifiManager.WifiLock? = null
  @Volatile private var stopRequested: Boolean = false
  @Volatile private var pendingServiceRestart: Boolean = false

  /** lane 전환·큐 handoff 시 FGS/WakeLock 0 틈 방지 (ms) */
  private const val STOP_DEFER_MS = 750L

  fun activeTokenCount(): Int = tokens.size

  fun hasDownloadTokens(): Boolean =
      tokens.any {
        it.startsWith("dl:") ||
            it.startsWith("whisper-model:") ||
            it.startsWith("forced-align:") ||
            it == "whisperx-align-model" ||
            it.startsWith("en-ko-transliterator") ||
            it.startsWith("espeak")
      }

  fun hasActiveAudioExtractJobs(): Boolean = activeAudioExtractJobs.isNotEmpty()

  fun registerActiveAudioExtract(jobId: String) {
    val trimmed = jobId.trim()
    if (trimmed.isEmpty()) return
    activeAudioExtractJobs.add(trimmed)
    NrmFileLogger.log("bg-work", "audio_extract_start jobId=$trimmed active=${activeAudioExtractJobs.size}")
  }

  fun unregisterActiveAudioExtract(jobId: String) {
    val trimmed = jobId.trim()
    if (trimmed.isEmpty()) return
    if (activeAudioExtractJobs.remove(trimmed)) {
      NrmFileLogger.log("bg-work", "audio_extract_end jobId=$trimmed active=${activeAudioExtractJobs.size}")
    }
  }

  fun hasLyricsTokens(): Boolean =
      tokens.any {
        it.startsWith("lyrics:") ||
            it.startsWith("whisper-lrc:") ||
            it.startsWith("align-run:")
      }

  fun hasBlockingExitWork(): Boolean =
      hasDownloadTokens() || hasLyricsTokens() || hasModelInstallTokens()

  fun hasModelInstallTokens(): Boolean =
      tokens.any {
        it == "model-install-queue" ||
            it.startsWith("whisper-model:") ||
            it.startsWith("forced-align:")
      }

  fun hasModelTokens(): Boolean = hasModelInstallTokens()

  /**
   * FGS type: wav2vec2/모델 DL/오디오 DL 모두 **dataSync** 우선.
   * (mediaProcessing은 제조사/정책에 따라 더 공격적으로 잘릴 수 있어 align에도 쓰지 않음)
   */
  fun resolveForegroundServiceType(): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
    return ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
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
    refreshWifiLock(context.applicationContext)
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
    refreshWifiLock(context.applicationContext)
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
    releaseWifiLock()
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
    val alignRun = tokens.count { it.startsWith("align-run:") }
    val lyricsBusy = lyricsJs + whisperLrc + alignRun
    if (lyricsBusy > 0) {
      val queueDepth = ForcedAlignWorkQueue.pendingCount().coerceAtLeast(alignRun)
      lines.add(
          when {
            alignRun > 0 && queueDepth > 1 ->
                "가사(LRC) 생성 중 · Forced Alignment (${queueDepth}곡 큐)"
            alignRun > 0 -> "가사(LRC) 생성 중 · Forced Alignment"
            lyricsBusy == 1 -> "가사(LRC) 생성 중"
            else -> "가사(LRC) 생성 중 (${lyricsBusy}곡 대기)"
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

  /** 모델·오디오 다운로드 중 Wi-Fi radio sleep 완화 */
  private fun refreshWifiLock(context: Context) {
    if (hasDownloadTokens()) {
      acquireWifiLock(context)
    } else {
      releaseWifiLock()
    }
  }

  @Suppress("DEPRECATION")
  private fun acquireWifiLock(context: Context) {
    if (wifiLock?.isHeld == true) return
    try {
      val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      val lock =
          wm.createWifiLock(
                  WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                  "${NrmBrand.STORAGE_FOLDER_NAME}:nrm-wifi",
              )
              .apply { setReferenceCounted(false) }
      lock.acquire()
      wifiLock = lock
      NrmFileLogger.log("bg-work", "WifiLock acquire tokens=${tokens.size}")
    } catch (t: Throwable) {
      NrmFileLogger.warn("bg-work", "WifiLock acquire failed err=${t.message}")
    }
  }

  private fun releaseWifiLock() {
    val lock = wifiLock ?: return
    if (lock.isHeld) {
      try {
        lock.release()
      } catch (_: RuntimeException) {
        /* already released */
      }
    }
    wifiLock = null
    NrmFileLogger.log("bg-work", "WifiLock release")
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
          releaseWifiLock()
          NrmStaleWorkNotificationCleanup.markWorkActive(context, false)
          stopService(context)
          NrmFileLogger.log("bg-work", "Deferred stop complete active=0")
        }
    pendingStopRunnable = runnable
    stopHandler.postDelayed(runnable, STOP_DEFER_MS)
    NrmFileLogger.log("bg-work", "Deferred stop scheduled ms=$STOP_DEFER_MS")
  }
}
