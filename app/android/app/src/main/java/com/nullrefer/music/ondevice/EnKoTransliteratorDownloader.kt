package com.nullrefer.music.ondevice

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.atomic.AtomicBoolean

/** en-ko-transliterator 다운로드 — Align/Whisper 와 동일 큐·이벤트 */
object EnKoTransliteratorDownloader {
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
    val installed = !active && EnKoTransliteratorBootstrap.pathsIfReady(context) != null
    val prog =
        when {
          active -> progress
          installed -> 100
          else -> 0
        }
    return Status(installed = installed, downloading = active, progress = prog.coerceIn(0, 100))
  }

  fun startDownload(context: Context) {
    if (EnKoTransliteratorBootstrap.pathsIfReady(context) != null) {
      emitComplete(true)
      return
    }
    if (!downloading.compareAndSet(false, true)) return
    progress = 0
    emitProgress(0)
    val appContext = context.applicationContext
    val jobId = EnKoTransliteratorCatalog.ID
    val queued =
        NrmModelInstallQueue.enqueue(appContext, jobId, "en-ko-transliterator") {
          NrmBackgroundWorkCoordinator.acquire(appContext, jobId)
          var ok = false
          try {
            ok = EnKoTransliteratorBootstrap.ensure(appContext) { pct -> emitProgress(pct) } != null
          } catch (e: Exception) {
            NrmFileLogger.error("en-ko-transliterator", "download 실패", e)
          } finally {
            downloading.set(false)
            progress = 0
            NrmBackgroundWorkCoordinator.release(appContext, jobId)
            emitComplete(ok)
          }
        }
    if (!queued) {
      downloading.set(false)
      progress = 0
      emitComplete(false)
    }
  }

  private fun emitProgress(pct: Int) {
    progress = pct
    val body = Arguments.createMap()
    body.putString("phase", "progress")
    body.putInt("progress", pct)
    eventEmitter?.invoke("EnKoTransliteratorDownload", body)
  }

  private fun emitComplete(ok: Boolean) {
    val body = Arguments.createMap()
    body.putString("phase", if (ok) "complete" else "failed")
    body.putInt("progress", if (ok) 100 else 0)
    eventEmitter?.invoke("EnKoTransliteratorDownload", body)
    NrmFileLogger.log("en-ko-transliterator", "download_${if (ok) "complete" else "failed"}")
  }
}
