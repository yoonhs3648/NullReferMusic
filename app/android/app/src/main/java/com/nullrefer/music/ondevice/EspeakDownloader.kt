package com.nullrefer.music.ondevice

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.atomic.AtomicBoolean

/** eSpeak NG 다운로드·설치 (FA 전처리 전용) */
object EspeakDownloader {
  data class Status(
      val installed: Boolean,
      val downloading: Boolean,
      val progress: Int,
  )

  private val downloading = AtomicBoolean(false)
  @Volatile private var progress = 0

  @Volatile private var eventEmitter: ((String, WritableMap) -> Unit)? = null

  fun setEventEmitter(emit: ((String, WritableMap) -> Unit)?) {
    eventEmitter = emit
  }

  fun status(context: Context): Status {
    val active = downloading.get()
    val installed = !active && EspeakBootstrap.pathsIfReady(context) != null
    val prog =
        when {
          active -> progress
          installed -> 100
          else -> 0
        }
    return Status(installed = installed, downloading = active, progress = prog.coerceIn(0, 100))
  }

  fun startDownload(context: Context) {
    if (EspeakBootstrap.pathsIfReady(context) != null) {
      emitComplete(true)
      return
    }
    if (!downloading.compareAndSet(false, true)) return
    progress = 0
    emitProgress(0)
    val appContext = context.applicationContext
    val jobId = "espeak-ng:install"
    NrmBackgroundWorkCoordinator.acquire(appContext, jobId)
    Thread {
      var ok = false
      try {
        ok = EspeakBootstrap.ensure(appContext) != null
      } catch (e: Exception) {
        NrmFileLogger.error("espeak", "download 실패", e)
      } finally {
        downloading.set(false)
        progress = 0
        NrmBackgroundWorkCoordinator.release(appContext, jobId)
        emitComplete(ok)
      }
    }.start()
  }

  private fun emitProgress(pct: Int) {
    progress = pct
    val body = Arguments.createMap()
    body.putString("phase", "progress")
    body.putInt("progress", pct)
    eventEmitter?.invoke("EspeakNgDownload", body)
  }

  private fun emitComplete(ok: Boolean) {
    val body = Arguments.createMap()
    body.putString("phase", if (ok) "complete" else "failed")
    body.putInt("progress", if (ok) 100 else 0)
    eventEmitter?.invoke("EspeakNgDownload", body)
    NrmFileLogger.log("espeak", "download_${if (ok) "complete" else "failed"}")
  }
}
