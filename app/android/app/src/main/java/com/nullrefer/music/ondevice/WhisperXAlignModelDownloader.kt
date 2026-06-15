package com.nullrefer.music.ondevice

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** wav2vec2 CTC forced alignment 에셋 다운로드 (whisperx-align/) */
object WhisperXAlignModelDownloader {
  private const val TAG = "WhisperXAlignDl"

  data class AlignModelStatus(
      val modelId: String,
      val installed: Boolean,
      val downloading: Boolean,
      val progress: Int,
  )

  private val executor = Executors.newSingleThreadExecutor()
  private val downloading = AtomicBoolean(false)
  private var progress = 0

  @Volatile private var eventEmitter: ((String, WritableMap) -> Unit)? = null

  fun setEventEmitter(emit: ((String, WritableMap) -> Unit)?) {
    eventEmitter = emit
  }

  fun alignDir(context: Context): File {
    val dir = File(context.filesDir, "whisperx-align")
    dir.mkdirs()
    return dir
  }

  fun isInstalled(context: Context): Boolean = resolveAlignDir(context) != null

  /** 모든 FA 에셋이 준비된 디렉터리, 없으면 null */
  fun resolveAlignDir(context: Context): File? {
    val dir = alignDir(context)
    for (legacy in WhisperXAlignModelCatalog.LEGACY_IGNORE_FILES) {
      File(dir, legacy).delete()
    }
    for (spec in WhisperXAlignModelCatalog.ASSETS) {
      val dest = File(dir, spec.fileName)
      if (!dest.isFile || dest.length() < spec.minBytes) return null
    }
    return dir
  }

  fun listStatuses(context: Context): List<AlignModelStatus> {
    val active = downloading.get()
    val installed = !active && isInstalled(context)
    val prog =
        when {
          active -> progress
          installed -> 100
          else -> 0
        }
    return listOf(
        AlignModelStatus(
            modelId = WhisperXAlignModelCatalog.MODEL_ID,
            installed = installed,
            downloading = active,
            progress = prog.coerceIn(0, 100),
        ),
    )
  }

  fun startDownload(context: Context) {
    val modelId = WhisperXAlignModelCatalog.MODEL_ID
    NrmFileLogger.log("whisperx-align", "startDownload modelId=$modelId assets=${WhisperXAlignModelCatalog.ASSETS.size}")
    if (isInstalled(context)) {
      emitComplete(modelId, true)
      return
    }
    if (!downloading.compareAndSet(false, true)) return
    progress = 0
    emitProgress(modelId, 0)
    val appContext = context.applicationContext
    NrmBackgroundWorkCoordinator.acquire(appContext, "whisperx-align-model")
    executor.execute {
      var ok = false
      try {
        ok = downloadAllAssets(appContext, modelId)
      } catch (e: Exception) {
        Log.w(TAG, "download failed: ${e.message}")
        NrmFileLogger.error("whisperx-align", "startDownload 실패", e)
      } finally {
        downloading.set(false)
        progress = 0
        NrmBackgroundWorkCoordinator.release(appContext, "whisperx-align-model")
        emitComplete(modelId, ok)
      }
    }
  }

  private fun downloadAllAssets(context: Context, modelId: String): Boolean {
    val dir = alignDir(context)
    val assets = WhisperXAlignModelCatalog.ASSETS
    val pending =
        assets.filter { spec ->
          val dest = File(dir, spec.fileName)
          !(dest.isFile && dest.length() >= spec.minBytes)
        }
    if (pending.isEmpty()) {
      emitProgress(modelId, 100)
      return true
    }

    var totalBytes = 0L
    val knownSizes = mutableMapOf<String, Long>()
    for (spec in pending) {
      val size = probeContentLength(spec.url)
      if (size > 0) {
        knownSizes[spec.fileName] = size
        totalBytes += size
      }
    }

    var doneBytes = 0L
    for (spec in pending) {
      val dest = File(dir, spec.fileName)
      val fileTotal = knownSizes[spec.fileName] ?: 0L
      val ok =
          downloadFile(
              modelId = modelId,
              spec = spec,
              dest = dest,
              onChunk = { chunk ->
                if (totalBytes > 0) {
                  doneBytes += chunk
                  val pct = ((doneBytes * 100) / totalBytes).toInt().coerceIn(0, 99)
                  progress = pct
                  emitProgress(modelId, pct)
                }
              },
              fileTotalBytes = fileTotal,
          )
      if (!ok) return false
      if (totalBytes <= 0) {
        val idx = assets.indexOf(spec) + 1
        progress = ((idx * 100) / assets.size).coerceIn(0, 99)
        emitProgress(modelId, progress)
      }
    }
    emitProgress(modelId, 100)
    return isInstalled(context)
  }

  private fun probeContentLength(urlStr: String): Long {
    return try {
      val conn = URL(urlStr).openConnection() as HttpURLConnection
      conn.connectTimeout = 15_000
      conn.readTimeout = 15_000
      conn.requestMethod = "HEAD"
      conn.instanceFollowRedirects = true
      conn.connect()
      val len = conn.contentLengthLong
      conn.disconnect()
      len.coerceAtLeast(0L)
    } catch (_: Exception) {
      0L
    }
  }

  private fun downloadFile(
      modelId: String,
      spec: WhisperXAlignModelCatalog.AssetSpec,
      dest: File,
      onChunk: (Long) -> Unit,
      fileTotalBytes: Long,
  ): Boolean {
    val tmp = File(dest.parentFile, "${spec.fileName}.download")
    return try {
      if (dest.isFile && dest.length() >= spec.minBytes) return true
      if (tmp.isFile) tmp.delete()
      NrmFileLogger.log("whisperx-align", "asset_download_start file=${spec.fileName}")
      val conn = URL(spec.url).openConnection() as HttpURLConnection
      conn.connectTimeout = 30_000
      conn.readTimeout = 600_000
      conn.instanceFollowRedirects = true
      conn.requestMethod = "GET"
      conn.connect()
      if (conn.responseCode !in 200..299) {
        NrmFileLogger.warn(
            "whisperx-align",
            "asset_download_http_${conn.responseCode} file=${spec.fileName}",
        )
        return false
      }
      val total = conn.contentLengthLong.coerceAtLeast(fileTotalBytes).coerceAtLeast(0L)
      BufferedInputStream(conn.inputStream).use { input ->
        FileOutputStream(tmp).use { output ->
          val buf = ByteArray(256 * 1024)
          var read: Int
          var done = 0L
          while (input.read(buf).also { read = it } != -1) {
            output.write(buf, 0, read)
            done += read
            onChunk(read.toLong())
            if (total > 0 && fileTotalBytes <= 0) {
              val pct = ((done * 100) / total).toInt().coerceIn(0, 99)
              progress = pct
              emitProgress(modelId, pct)
            }
          }
        }
      }
      conn.disconnect()
      if (!tmp.renameTo(dest)) {
        tmp.copyTo(dest, overwrite = true)
        tmp.delete()
      }
      val ok = dest.isFile && dest.length() >= spec.minBytes
      NrmFileLogger.log(
          "whisperx-align",
          "asset_download_done file=${spec.fileName} ok=$ok bytes=${dest.length()}",
      )
      ok
    } catch (e: Exception) {
      tmp.delete()
      NrmFileLogger.error("whisperx-align", "asset_download_fail file=${spec.fileName}", e)
      false
    }
  }

  private fun emitProgress(modelId: String, pct: Int) {
    val body = Arguments.createMap()
    body.putString("modelId", modelId)
    body.putString("phase", "progress")
    body.putInt("progress", pct)
    eventEmitter?.invoke("WhisperXAlignModelDownload", body)
  }

  private fun emitComplete(modelId: String, ok: Boolean) {
    val body = Arguments.createMap()
    body.putString("modelId", modelId)
    body.putString("phase", if (ok) "complete" else "failed")
    body.putInt("progress", if (ok) 100 else 0)
    eventEmitter?.invoke("WhisperXAlignModelDownload", body)
    NrmFileLogger.log("whisperx-align", "download_${if (ok) "complete" else "failed"} modelId=$modelId")
  }
}
