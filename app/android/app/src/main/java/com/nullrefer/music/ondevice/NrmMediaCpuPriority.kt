package com.nullrefer.music.ondevice

import android.os.Build
import android.os.Process as AndroidProcess
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * ffmpeg·shineenc(오디오 변환)가 whisper-cli보다 CPU/RAM을 우선한다.
 *
 * - ffmpeg 계열이 시작되면 실행 중인 whisper 자식 프로세스를 SIGSTOP으로 잠시 멈춘다.
 * - ffmpeg가 끝나면 SIGCONT로 whisper를 이어서 돌린다.
 * - 오디오 파이프라인 순서·병렬 구조는 그대로 두고, 리소스 경쟁만 조정한다.
 */
object NrmMediaCpuPriority {
  private const val SIGSTOP = 19
  private const val SIGCONT = 18

  private val lock = ReentrantLock()
  private var ffmpegActiveCount = 0
  private var activeWhisperProcess: Process? = null
  private var whisperPausedByFfmpeg = false

  /** ffmpeg / shineenc / ffmpeg-meta 등 오디오 변환 구간 */
  fun <T> runFfmpegPriority(block: () -> T): T {
    lock.withLock {
      ffmpegActiveCount++
      pauseActiveWhisperLocked()
    }
    try {
      return block()
    } finally {
      lock.withLock {
        ffmpegActiveCount--
        if (ffmpegActiveCount <= 0) {
          ffmpegActiveCount = 0
          resumeActiveWhisperLocked()
        }
      }
    }
  }

  /** whisper-cli 자식 프로세스 등록 — ffmpeg가 돌고 있으면 즉시 일시정지 */
  fun registerWhisperProcess(process: Process) {
    lock.withLock {
      activeWhisperProcess = process
      whisperPausedByFfmpeg = false
      if (ffmpegActiveCount > 0) {
        pauseProcess(process)
        whisperPausedByFfmpeg = true
        NrmFileLogger.log(
            "cpu-priority",
            "paused whisper pid=${pidOf(process)} for ffmpegActive=$ffmpegActiveCount",
        )
      }
    }
  }

  fun unregisterWhisperProcess(process: Process) {
    lock.withLock {
      if (activeWhisperProcess === process) {
        activeWhisperProcess = null
        whisperPausedByFfmpeg = false
      }
    }
  }

  private fun pauseActiveWhisperLocked() {
    val proc = activeWhisperProcess ?: return
    if (whisperPausedByFfmpeg) return
    pauseProcess(proc)
    whisperPausedByFfmpeg = true
    NrmFileLogger.log(
        "cpu-priority",
        "paused whisper pid=${pidOf(proc)} ffmpegActive=$ffmpegActiveCount",
    )
  }

  private fun resumeActiveWhisperLocked() {
    val proc = activeWhisperProcess ?: return
    if (!whisperPausedByFfmpeg) return
    resumeProcess(proc)
    whisperPausedByFfmpeg = false
    NrmFileLogger.log(
        "cpu-priority",
        "resumed whisper pid=${pidOf(proc)}",
    )
  }

  private fun pauseProcess(process: Process) {
    val pid = pidOf(process) ?: return
    signalProcess(pid, SIGSTOP)
  }

  private fun resumeProcess(process: Process) {
    val pid = pidOf(process) ?: return
    signalProcess(pid, SIGCONT)
  }

  private fun signalProcess(pid: Int, signal: Int) {
    if (pid <= 0) return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        AndroidProcess.sendSignal(pid, signal)
      }
    } catch (e: Exception) {
      NrmFileLogger.warn(
          "cpu-priority",
          "sendSignal pid=$pid signal=$signal failed: ${e.message}",
      )
    }
  }

  private fun pidOf(process: Process): Int? {
    return try {
      val m = process.javaClass.getMethod("pid")
      m.invoke(process) as Int
    } catch (_: Exception) {
      try {
        val f = process.javaClass.getDeclaredField("pid")
        f.isAccessible = true
        f.getInt(process)
      } catch (_: Exception) {
        null
      }
    }
  }
}
