package com.nullrefer.music.ondevice

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

/** Forced Alignment 모델 다운로드·설치 (aeneas 번들 / wav2vec2-base INT8 HF) */
object AlignModelDownloader {
  private const val TAG = "AlignModelDl"

  data class AlignModelStatus(
      val modelId: String,
      val installed: Boolean,
      val downloading: Boolean,
      val progress: Int,
  )

  private val activeDownloads = ConcurrentHashMap<String, AtomicBoolean>()
  private val progressByModel = ConcurrentHashMap<String, Int>()

  @Volatile private var eventEmitter: ((String, WritableMap) -> Unit)? = null

  fun setEventEmitter(emit: ((String, WritableMap) -> Unit)?) {
    eventEmitter = emit
  }

  fun progressFor(modelId: String): Int = progressByModel[modelId] ?: -1

  fun progressPercent(): Int {
    for (entry in AlignModelCatalog.ENTRIES) {
      val p = progressFor(entry.id)
      if (p >= 0) return p
    }
    return -1
  }

  fun modelDir(context: Context, entry: AlignModelCatalog.Entry): File {
    val dir = File(context.filesDir, entry.subDir)
    dir.mkdirs()
    return dir
  }

  fun isModelInstalled(context: Context, modelId: String): Boolean {
    if (AlignModelCatalog.isBundleId(modelId)) {
      return resolveModelDir(context, AlignModelCatalog.WAV2VEC2_KO_ID) != null &&
          resolveModelDir(context, AlignModelCatalog.WAV2VEC2_EN_ID) != null
    }
    return resolveModelDir(context, modelId) != null
  }

  fun hasAnyModelInstalled(context: Context): Boolean {
    return AlignModelCatalog.ENTRIES.any { resolveModelDir(context, it.id) != null }
  }

  /** 선택 모델의 FA 에셋 디렉터리, 없으면 null */
  fun resolveModelDir(context: Context, modelId: String): File? {
    val entry = AlignModelCatalog.entryById(modelId) ?: return null
    val dir = modelDir(context, entry)
    cleanupLegacyArtifacts(context)
    when (entry.engine) {
      AlignModelCatalog.EngineKind.AENEAS -> {
        val marker = File(dir, ".installed")
        val engine = File(dir, "engine.json")
        return if (marker.isFile && engine.isFile && engine.length() > 10L) dir else null
      }
      AlignModelCatalog.EngineKind.CTC_ONNX -> {
        for (spec in entry.assets) {
          val dest = File(dir, spec.fileName)
          if (!isAssetReady(dest, spec)) return null
        }
        return dir
      }
    }
  }

  private fun cleanupLegacyArtifacts(context: Context) {
    for (legacyDir in AlignModelCatalog.LEGACY_IGNORE_DIRS) {
      val dir = File(context.filesDir, legacyDir)
      if (dir.isDirectory) {
        dir.listFiles()?.forEach { it.delete() }
      }
    }
  }

  fun listStatuses(context: Context): List<AlignModelStatus> {
    return AlignModelCatalog.ENTRIES.map { entry ->
      val downloading = activeDownloads[entry.id]?.get() == true
      val installed = !downloading && resolveModelDir(context, entry.id) != null
      val progress =
          when {
            downloading -> progressByModel[entry.id] ?: 0
            installed -> 100
            else -> 0
          }
      AlignModelStatus(
          modelId = entry.id,
          installed = installed,
          downloading = downloading,
          progress = progress.coerceIn(0, 100),
      )
    }
  }

  fun removeInvalidAssets(context: Context): Int {
    var removed = 0
    for (entry in AlignModelCatalog.ENTRIES) {
      if (entry.engine != AlignModelCatalog.EngineKind.CTC_ONNX) continue
      val dir = modelDir(context, entry)
      for (spec in entry.assets) {
        val dest = File(dir, spec.fileName)
        val tmp = File(dir, "${spec.fileName}.download")
        if (tmp.isFile && tmp.delete()) removed++
        if (dest.isFile && !isAssetReady(dest, spec)) {
          if (dest.delete()) removed++
        }
      }
    }
    return removed
  }

  private fun isAssetReady(dest: File, spec: AlignModelCatalog.AssetSpec): Boolean {
    if (!dest.isFile || dest.length() < spec.minBytes) return false
    if (!spec.fileName.endsWith(".json")) return true
    return try {
      JSONObject(dest.readText(Charsets.UTF_8))
      true
    } catch (_: Exception) {
      false
    }
  }

  fun startDownload(context: Context, modelId: String) {
    val trimmed = modelId.trim()
    val entry =
        AlignModelCatalog.entryById(trimmed) ?: AlignModelCatalog.entryForPreference(trimmed)
    if (entry == null) {
      emitComplete(trimmed, false)
      return
    }
    NrmFileLogger.log("forced-align", "startDownload modelId=${entry.id} engine=${entry.engine}")
    removeInvalidAssets(context)
    if (isModelInstalled(context, entry.id)) {
      emitComplete(entry.id, true)
      return
    }
    val flag = activeDownloads.getOrPut(entry.id) { AtomicBoolean(false) }
    if (!flag.compareAndSet(false, true)) return
    progressByModel[entry.id] = 0
    emitProgress(entry.id, 0)
    val appContext = context.applicationContext
    val jobId = "forced-align:${entry.id}"
    val queued =
        NrmModelInstallQueue.enqueue(appContext, jobId, "Forced Alignment ${entry.label}") {
          NrmBackgroundWorkCoordinator.acquire(appContext, jobId)
          var ok = false
          try {
            ok =
                when (entry.engine) {
                  AlignModelCatalog.EngineKind.AENEAS -> installBundledAeneas(appContext, entry)
                  AlignModelCatalog.EngineKind.CTC_ONNX -> downloadOnnxAssets(appContext, entry)
                }
          } catch (e: Exception) {
            Log.w(TAG, "download failed: ${e.message}")
            NrmFileLogger.error("forced-align", "startDownload 실패 modelId=${entry.id}", e)
          } finally {
            flag.set(false)
            progressByModel.remove(entry.id)
            NrmBackgroundWorkCoordinator.release(appContext, jobId)
            emitComplete(entry.id, ok)
          }
        }
    if (!queued) {
      flag.set(false)
      progressByModel.remove(entry.id)
      emitComplete(entry.id, false)
    }
  }

  private fun installBundledAeneas(context: Context, entry: AlignModelCatalog.Entry): Boolean {
    val dir = modelDir(context, entry)
    var copied = 0
    for (assetPath in entry.bundledAssetPaths) {
      val fileName = assetPath.substringAfterLast('/')
      val dest = File(dir, fileName)
      if (copyAssetIfPresent(context, assetPath, dest)) copied++
    }
    if (copied == 0) return false
    File(dir, ".installed").writeText("ok")
    emitProgress(entry.id, 100)
    return isModelInstalled(context, entry.id)
  }

  private fun copyAssetIfPresent(context: Context, assetName: String, dest: File): Boolean {
    return try {
      context.assets.open(assetName).use { input ->
        dest.parentFile?.mkdirs()
        FileOutputStream(dest).use { output -> input.copyTo(output) }
      }
      dest.isFile && dest.length() > 0
    } catch (_: Exception) {
      false
    }
  }

  private fun downloadOnnxAssets(context: Context, entry: AlignModelCatalog.Entry): Boolean {
    val dir = modelDir(context, entry)
    val pending =
        entry.assets.filter { spec ->
          val dest = File(dir, spec.fileName)
          !isAssetReady(dest, spec)
        }
    if (pending.isEmpty()) {
      emitProgress(entry.id, 100)
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
              modelId = entry.id,
              spec = spec,
              dest = dest,
              doneBytes = doneBytes,
              totalBytes = totalBytes,
              fileTotalBytes = fileTotal,
          )
      if (!ok) return false
      doneBytes += knownSizes[spec.fileName] ?: dest.length()
      if (totalBytes <= 0) {
        val idx = entry.assets.indexOf(spec) + 1
        val pct = ((idx * 100) / entry.assets.size).coerceIn(0, 99)
        progressByModel[entry.id] = pct
        emitProgress(entry.id, pct)
      }
    }
    emitProgress(entry.id, 100)
    return isModelInstalled(context, entry.id)
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
      spec: AlignModelCatalog.AssetSpec,
      dest: File,
      doneBytes: Long,
      totalBytes: Long,
      fileTotalBytes: Long,
  ): Boolean {
    val tmp = File(dest.parentFile, "${spec.fileName}.download")
    if (isAssetReady(dest, spec)) return true
    if (dest.isFile) dest.delete()
    NrmFileLogger.log("forced-align", "asset_download_start file=${spec.fileName}")
    val ok =
        NrmResilientHttpDownload.download(
            context = context,
            tag = "forced-align",
            urlStr = spec.url,
            tmp = tmp,
            dest = dest,
            minBytes = spec.minBytes,
            onProgress = { pct, _, _ ->
              if (totalBytes > 0 && fileTotalBytes > 0) {
                val fileAbsolute = (fileTotalBytes * pct) / 100L
                val overall = ((doneBytes + fileAbsolute) * 100 / totalBytes).toInt().coerceIn(0, 99)
                progressByModel[modelId] = overall
                emitProgress(modelId, overall)
              } else {
                progressByModel[modelId] = pct
                emitProgress(modelId, pct)
              }
            },
            isValid = { file -> isAssetReady(file, spec) },
            readTimeoutMs = 600_000,
        )
    NrmFileLogger.log(
        "forced-align",
        "asset_download_done file=${spec.fileName} ok=$ok bytes=${dest.length()}",
    )
    return ok
  }

  private fun emitProgress(modelId: String, pct: Int) {
    val body = Arguments.createMap()
    body.putString("modelId", modelId)
    body.putString("phase", "progress")
    body.putInt("progress", pct)
    eventEmitter?.invoke("AlignModelDownload", body)
  }

  private fun emitComplete(modelId: String, ok: Boolean) {
    val body = Arguments.createMap()
    body.putString("modelId", modelId)
    body.putString("phase", if (ok) "complete" else "failed")
    body.putInt("progress", if (ok) 100 else 0)
    eventEmitter?.invoke("AlignModelDownload", body)
    NrmFileLogger.log("forced-align", "download_${if (ok) "complete" else "failed"} modelId=$modelId")
  }
}
