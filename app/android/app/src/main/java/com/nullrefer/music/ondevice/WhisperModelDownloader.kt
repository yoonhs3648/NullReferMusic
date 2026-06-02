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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * APK에 모델을 넣지 않고 Hugging Face에서 기기 저장소로만 받습니다 (백엔드 통신 없음).
 */
object WhisperModelDownloader {
  private const val TAG = "WhisperModelDl"
  private const val HF_BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/"

  data class ModelStatus(
      val modelId: String,
      val installed: Boolean,
      val downloading: Boolean,
      val progress: Int,
  )

  private val executor = Executors.newCachedThreadPool()
  private val activeDownloads = ConcurrentHashMap<String, AtomicBoolean>()
  private val progressByModel = ConcurrentHashMap<String, Int>()
  private val lowRamWarnAtMsByModel = ConcurrentHashMap<String, Long>()
  private const val LOW_RAM_WARN_DEBOUNCE_MS = 30_000L

  @Volatile private var eventEmitter: ((String, WritableMap) -> Unit)? = null
  @Volatile private var notifContext: Context? = null

  fun progressFor(modelId: String): Int = progressByModel[modelId] ?: -1

  fun setEventEmitter(emit: ((String, WritableMap) -> Unit)?) {
    eventEmitter = emit
  }

  fun whisperDir(context: Context): File {
    val dir = File(context.filesDir, "whisper")
    dir.mkdirs()
    return dir
  }

  fun hasAnyModelInstalled(context: Context): Boolean {
    return WhisperModelCatalog.ENTRIES.any { entry ->
      resolveInstalledFile(context, entry.id) != null
    }
  }

  fun isModelInstalled(context: Context, modelId: String): Boolean {
    return resolveInstalledFile(context, modelId) != null
  }

  fun listStatuses(context: Context): List<ModelStatus> {
    return WhisperModelCatalog.ENTRIES.map { entry ->
      val downloading = activeDownloads[entry.id]?.get() == true
      val progress =
          when {
            downloading -> progressByModel[entry.id] ?: 0
            resolveInstalledFile(context, entry.id) != null -> 100
            else -> 0
          }
      ModelStatus(
          modelId = entry.id,
          installed = !downloading && resolveInstalledFile(context, entry.id) != null,
          downloading = downloading,
          progress = progress.coerceIn(0, 100),
      )
    }
  }

  /** 이미 받아 둔 모델만 반환 (다운로드 없음) */
  fun resolveInstalledFile(context: Context, modelId: String): File? {
    val order = WhisperModelCatalog.ggmlOrderForPreference(context, modelId)
    val lowRam = NrmWhisperDevicePolicy.preferQuantizedGgml(context)
    if (lowRam) {
      maybeLogLowRamResolve(modelId, order, context)
    }
    val dir = whisperDir(context)
    val quantizedHit = findInstalledGgmlInOrder(context, dir, order, allowFullBin = !lowRam)
    if (quantizedHit != null) return quantizedHit
    if (lowRam) {
      maybeWarnLowRamMissingQuantized(modelId)
      return null
    }
    return findInstalledGgmlInOrder(context, dir, order, allowFullBin = true)
  }

  private fun maybeLogLowRamResolve(modelId: String, order: List<String>, context: Context) {
    val now = System.currentTimeMillis()
    val last = lowRamWarnAtMsByModel[modelId] ?: 0L
    if (now - last < LOW_RAM_WARN_DEBOUNCE_MS) return
    lowRamWarnAtMsByModel[modelId] = now
    NrmFileLogger.log(
        "whisper",
        "resolveInstalled preferQuantized modelId=$modelId ${NrmWhisperDevicePolicy.memorySnapshot(context)} order=${order.joinToString()}",
    )
  }

  private fun maybeWarnLowRamMissingQuantized(modelId: String) {
    val now = System.currentTimeMillis()
    val last = lowRamWarnAtMsByModel[modelId] ?: 0L
    if (now - last < LOW_RAM_WARN_DEBOUNCE_MS) return
    lowRamWarnAtMsByModel[modelId] = now
    NrmFileLogger.warn(
        "whisper",
        "resolveInstalled RAM 부족 — 설치된 양자화(q5) ggml 없음. full bin은 사용하지 않습니다. AI 가사 추출 엔진 설정에서 q5 모델을 받아 주세요.",
    )
  }

  private fun findInstalledGgmlInOrder(
      context: Context,
      dir: File,
      order: List<String>,
      allowFullBin: Boolean,
  ): File? {
    for (name in order) {
      if (!allowFullBin && !NrmWhisperDevicePolicy.isQuantizedGgmlFileName(name)) {
        continue
      }
      val dest = File(dir, name)
      val minBytes = WhisperModelCatalog.minBytesFor(name)
      if (dest.isFile && dest.length() >= minBytes) {
        return dest
      }
      copyAssetIfPresent(context, "whisper/$name", dest)
      if (dest.isFile && dest.length() >= minBytes) {
        return dest
      }
    }
    return null
  }

  fun startDownload(context: Context, modelId: String) {
    NrmFileLogger.log("whisper", "startDownload modelId=$modelId")
    if (isModelInstalled(context, modelId)) {
      NrmFileLogger.log("whisper", "startDownload 이미 설치됨 modelId=$modelId")
      emitComplete(modelId, true)
      return
    }
    val flag = activeDownloads.computeIfAbsent(modelId) { AtomicBoolean(false) }
    if (!flag.compareAndSet(false, true)) {
      return
    }
    progressByModel[modelId] = 0
    emitProgress(modelId, 0)
    val appContext = context.applicationContext
    notifContext = appContext
    NrmBackgroundWorkCoordinator.acquire(appContext, "whisper-model:$modelId")
    executor.execute {
      var ok = false
      try {
        val order = WhisperModelCatalog.ggmlOrderForPreference(appContext, modelId)
        if (NrmWhisperDevicePolicy.preferQuantizedGgml(appContext)) {
          NrmFileLogger.log(
              "whisper",
              "startDownload preferQuantized modelId=$modelId order=${order.joinToString()}",
          )
        }
        for (name in order) {
          val dest = File(whisperDir(appContext), name)
          val minBytes = WhisperModelCatalog.minBytesFor(name)
          if (dest.isFile && dest.length() >= minBytes) {
            ok = true
            break
          }
          if (downloadModel(appContext, modelId, name, dest, minBytes)) {
            ok = true
            break
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "startDownload failed $modelId: ${e.message}")
        NrmFileLogger.error("whisper", "startDownload 실패 modelId=$modelId", e)
      } finally {
        flag.set(false)
        activeDownloads.remove(modelId)
        progressByModel.remove(modelId)
        NrmBackgroundWorkCoordinator.release(appContext, "whisper-model:$modelId")
        if (activeDownloads.isEmpty()) {
          notifContext = null
        }
        emitComplete(modelId, ok)
      }
    }
  }

  private fun downloadModel(
      context: Context,
      modelId: String,
      fileName: String,
      dest: File,
      minBytes: Long,
  ): Boolean {
    val tmp = File(dest.parentFile, "$fileName.download")
    return try {
      if (dest.isFile && dest.length() >= minBytes) {
        emitProgress(modelId, 100)
        return true
      }
      if (tmp.isFile) tmp.delete()
      val url = URL(HF_BASE + fileName + "?download=true")
      Log.i(TAG, "download start: $fileName ($modelId)")
      NrmFileLogger.log("whisper", "모델 다운로드 시작 file=$fileName modelId=$modelId")
      val conn = url.openConnection() as HttpURLConnection
      conn.connectTimeout = 30_000
      conn.readTimeout = 600_000
      conn.instanceFollowRedirects = true
      conn.requestMethod = "GET"
      conn.connect()
      if (conn.responseCode !in 200..299) {
        Log.w(TAG, "download http ${conn.responseCode} for $fileName")
        NrmFileLogger.warn("whisper", "모델 HTTP ${conn.responseCode} file=$fileName")
        return false
      }
      val total = conn.contentLengthLong.coerceAtLeast(0L)
      var copied = 0L
      var lastPct = -1
      BufferedInputStream(conn.inputStream).use { input ->
        FileOutputStream(tmp).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            output.write(buffer, 0, read)
            copied += read
            if (total > 0) {
              val pct = ((copied * 100) / total).toInt().coerceIn(0, 99)
              if (pct != lastPct) {
                lastPct = pct
                progressByModel[modelId] = pct
                emitProgress(modelId, pct)
              }
            }
          }
        }
      }
      conn.disconnect()
      if (!tmp.isFile || tmp.length() < minBytes) {
        tmp.delete()
        Log.w(TAG, "download too small: $fileName")
        NrmFileLogger.warn("whisper", "모델 파일 너무 작음 file=$fileName size=${tmp.length()}")
        return false
      }
      if (dest.isFile) dest.delete()
      if (!tmp.renameTo(dest)) {
        tmp.copyTo(dest, overwrite = true)
        tmp.delete()
      }
      emitProgress(modelId, 100)
      Log.i(TAG, "download ok: $fileName (${dest.length()} bytes)")
      NrmFileLogger.log("whisper", "모델 다운로드 완료 file=$fileName bytes=${dest.length()}")
      true
    } catch (e: Exception) {
      Log.w(TAG, "download failed $fileName: ${e.message}")
      NrmFileLogger.error("whisper", "모델 다운로드 실패 file=$fileName", e)
      tmp.delete()
      false
    }
  }

  private fun emitProgress(modelId: String, progress: Int) {
    val body =
        Arguments.createMap().apply {
          putString("modelId", modelId)
          putString("phase", "progress")
          putInt("progress", progress)
        }
    eventEmitter?.invoke("WhisperModelDownload", body)
    notifContext?.let { NrmBackgroundWorkService.refreshNotification(it) }
  }

  private fun emitComplete(modelId: String, ok: Boolean) {
    val body =
        Arguments.createMap().apply {
          putString("modelId", modelId)
          putString("phase", if (ok) "complete" else "failed")
          putInt("progress", if (ok) 100 else 0)
        }
    eventEmitter?.invoke("WhisperModelDownload", body)
  }

  private fun copyAssetIfPresent(context: Context, assetName: String, dest: File) {
    try {
      context.assets.open(assetName).use { input ->
        dest.parentFile?.mkdirs()
        FileOutputStream(dest).use { output -> input.copyTo(output) }
      }
    } catch (_: Exception) {
      // optional dev bundle
    }
  }
}
