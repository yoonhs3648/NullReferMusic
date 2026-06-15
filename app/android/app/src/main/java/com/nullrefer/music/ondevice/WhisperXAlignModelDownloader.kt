package com.nullrefer.music.ondevice

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

/** wav2vec2 CTC forced alignment 에셋 다운로드 (whisperx-align/) */
object WhisperXAlignModelDownloader {
  private const val TAG = "WhisperXAlignDl"

  data class AlignModelStatus(
      val modelId: String,
      val installed: Boolean,
      val downloading: Boolean,
      val progress: Int,
  )

  private val downloading = AtomicBoolean(false)
  private var progress = 0

  fun progressPercent(): Int = if (downloading.get()) progress else -1

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
      if (!isAssetReady(dest, spec)) return null
    }
    return dir
  }

  /** 손상·미완료 에셋 및 .download 임시 파일 제거 (재시도·cold start 공용) */
  fun removeInvalidAssets(context: Context): Int {
    val dir = alignDir(context)
    var removed = 0
    for (spec in WhisperXAlignModelCatalog.ASSETS) {
      val dest = File(dir, spec.fileName)
      val tmp = File(dir, "${spec.fileName}.download")
      if (tmp.isFile && tmp.delete()) {
        removed++
        NrmFileLogger.log("whisperx-align", "stale_tmp_removed file=${spec.fileName}.download")
      }
      if (dest.isFile && !isAssetReady(dest, spec)) {
        val bytes = dest.length()
        if (dest.delete()) {
          removed++
          NrmFileLogger.warn(
              "whisperx-align",
              "손상 에셋 삭제 file=${spec.fileName} bytes=$bytes",
          )
        }
      }
    }
    return removed
  }

  private fun isAssetReady(dest: File, spec: WhisperXAlignModelCatalog.AssetSpec): Boolean {
    if (!dest.isFile || dest.length() < spec.minBytes) return false
    if (!spec.fileName.endsWith(".json")) return true
    return try {
      JSONObject(dest.readText(Charsets.UTF_8))
      true
    } catch (_: Exception) {
      false
    }
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
    removeInvalidAssets(context)
    if (isInstalled(context)) {
      emitComplete(modelId, true)
      return
    }
    if (!downloading.compareAndSet(false, true)) return
    progress = 0
    emitProgress(modelId, 0)
    val appContext = context.applicationContext
    val jobId = "whisperx-align-model"
    val queued =
        NrmModelInstallQueue.enqueue(appContext, jobId, "WhisperX 정렬 모델") {
          NrmBackgroundWorkCoordinator.acquire(appContext, jobId)
          var ok = false
          try {
            ok = downloadAllAssets(appContext, modelId)
          } catch (e: Exception) {
            Log.w(TAG, "download failed: ${e.message}")
            NrmFileLogger.error("whisperx-align", "startDownload 실패", e)
          } finally {
            downloading.set(false)
            progress = 0
            NrmBackgroundWorkCoordinator.release(appContext, jobId)
            emitComplete(modelId, ok)
          }
        }
    if (!queued) {
      downloading.set(false)
      progress = 0
    }
  }

  private fun downloadAllAssets(context: Context, modelId: String): Boolean {
    val dir = alignDir(context)
    val assets = WhisperXAlignModelCatalog.ASSETS
    val pending =
        assets.filter { spec ->
          val dest = File(dir, spec.fileName)
          !isAssetReady(dest, spec)
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
              context = context,
              modelId = modelId,
              spec = spec,
              dest = dest,
              doneBytes = doneBytes,
              totalBytes = totalBytes,
              fileTotalBytes = fileTotal,
          )
      if (!ok) return false
      doneBytes += knownSizes[spec.fileName] ?: dest.length()
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
      context: Context,
      modelId: String,
      spec: WhisperXAlignModelCatalog.AssetSpec,
      dest: File,
      doneBytes: Long,
      totalBytes: Long,
      fileTotalBytes: Long,
  ): Boolean {
    val tmp = File(dest.parentFile, "${spec.fileName}.download")
    if (isAssetReady(dest, spec)) return true
    if (dest.isFile) dest.delete()
    NrmFileLogger.log("whisperx-align", "asset_download_start file=${spec.fileName}")
    val ok =
        NrmResilientHttpDownload.download(
            context = context,
            tag = "whisperx-align",
            urlStr = spec.url,
            tmp = tmp,
            dest = dest,
            minBytes = spec.minBytes,
            onProgress = { pct, _, _ ->
              if (totalBytes > 0 && fileTotalBytes > 0) {
                val fileAbsolute = (fileTotalBytes * pct) / 100L
                val overall = ((doneBytes + fileAbsolute) * 100 / totalBytes).toInt().coerceIn(0, 99)
                progress = overall
                emitProgress(modelId, overall)
              } else if (fileTotalBytes <= 0) {
                progress = pct
                emitProgress(modelId, pct)
              }
            },
            isValid = { file -> isAssetReady(file, spec) },
            readTimeoutMs = 600_000,
        )
    NrmFileLogger.log(
        "whisperx-align",
        "asset_download_done file=${spec.fileName} ok=$ok bytes=${dest.length()}",
    )
    return ok
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
