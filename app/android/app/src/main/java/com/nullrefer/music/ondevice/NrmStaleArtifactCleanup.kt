package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File

/**
 * 프로세스 cold start 시 이전 세션에서 남은 다운로드·후처리 임시 파일을 제거한다.
 *
 * 비정상 종료뿐 아니라 실패·중단 후 정리되지 않은 `nrm-*` 아티팩트도 대상이다.
 * ffmpeg/whisper/shine 바이너리(codeCacheDir), 설치된 whisper 모델(filesDir/whisper),
 * 사용자 Download 폴더 산출물은 건드리지 않는다.
 */
object NrmStaleArtifactCleanup {
  private const val YTDLP_TMP_DIR = "nrm-ytdlp-tmp"

  private val CACHE_FILE_PREFIXES =
      listOf(
          "nrm-local-",
          "nrm-dl-",
          "nrm-whisper-src-",
          "nrm-lrc-",
          "nrm-whisper-",
          "nrm-whisper-out-",
          "nrm-meta-",
          "nrm-cover-",
          "nrm-shine-",
      )

  /** Application cold start — orphan 임시 파일 스윕 */
  fun reconcileOnColdStart(context: Context) {
    val appContext = context.applicationContext
    if (NrmBackgroundWorkCoordinator.activeTokenCount() > 0) return

    var removed = 0
    removed += sweepCacheDir(appContext.cacheDir)
    removed += sweepWhisperPartials(appContext)

    NrmFileLogger.log(
        "startup-cleanup",
        if (removed > 0) {
          "Removed $removed stale artifact(s) on cold start"
        } else {
          "No stale artifacts on cold start"
        },
    )
  }

  private fun sweepCacheDir(cacheDir: File?): Int {
    if (cacheDir == null || !cacheDir.isDirectory) return 0

    var removed = 0
    val children = cacheDir.listFiles() ?: return 0
    for (child in children) {
      if (child.name == YTDLP_TMP_DIR) {
        if (deleteTree(child)) removed++
        continue
      }
      if (!isStaleCacheEntry(child.name)) continue
      if (deleteTree(child)) removed++
    }
    return removed
  }

  private fun sweepWhisperPartials(context: Context): Int {
    val whisperDir = File(context.filesDir, "whisper")
    if (!whisperDir.isDirectory) return 0

    var removed = 0
    val children = whisperDir.listFiles() ?: return 0
    for (child in children) {
      if (!child.isFile || !child.name.endsWith(".download")) continue
      if (child.delete()) removed++
    }
    return removed
  }

  private fun isStaleCacheEntry(name: String): Boolean {
    if (name.startsWith("nrm_yt_cookies_")) return true
    return CACHE_FILE_PREFIXES.any { name.startsWith(it) }
  }

  private fun deleteTree(file: File): Boolean {
    return try {
      if (file.isDirectory) {
        file.listFiles()?.forEach { deleteTree(it) }
      }
      file.delete()
    } catch (_: Exception) {
      false
    }
  }
}
