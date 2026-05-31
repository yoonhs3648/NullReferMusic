package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.nio.charset.Charset
import java.util.concurrent.TimeUnit
/** APK 내 로컬 whisper.cpp 전사 → LRC (모델은 사전 다운로드만) */
class NrmWhisperModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  private val processTimeoutSec = 1800L

  init {
    WhisperModelDownloader.setEventEmitter { event, body -> sendEvent(event, body) }
  }

  override fun getName(): String = "NrmWhisper"

  @ReactMethod
  fun addListener(eventName: String) {
    // RN NativeEventEmitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // RN NativeEventEmitter
  }

  @ReactMethod
  fun getModelStatuses(promise: Promise) {
    try {
      val statuses = WhisperModelDownloader.listStatuses(reactApplicationContext)
      val arr: WritableArray = Arguments.createArray()
      for (s in statuses) {
        val row: WritableMap = Arguments.createMap()
        row.putString("modelId", s.modelId)
        row.putBoolean("installed", s.installed)
        row.putBoolean("downloading", s.downloading)
        row.putInt("progress", s.progress)
        arr.pushMap(row)
      }
      promise.resolve(arr)
    } catch (e: Exception) {
      promise.reject("E_WHISPER_STATUS", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun hasAnyModelInstalled(promise: Promise) {
    try {
      promise.resolve(WhisperModelDownloader.hasAnyModelInstalled(reactApplicationContext))
    } catch (e: Exception) {
      promise.reject("E_WHISPER_STATUS", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun startModelDownload(modelId: String?, promise: Promise) {
    try {
      val id = (modelId ?: "").trim()
      if (!id.startsWith("whisper:")) {
        promise.reject("E_ARG", "invalid_model_id")
        return
      }
      WhisperModelDownloader.startDownload(reactApplicationContext, id)
      val ok = Arguments.createMap()
      ok.putBoolean("started", true)
      promise.resolve(ok)
    } catch (e: Exception) {
      promise.reject("E_WHISPER_DL", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun prefetchModel(modelPreference: String?, promise: Promise) {
    try {
      val id = (modelPreference ?: "").trim()
      if (!id.startsWith("whisper:")) {
        promise.reject("E_ARG", "invalid_model_id")
        return
      }
      WhisperModelDownloader.startDownload(reactApplicationContext, id)
      val ok = Arguments.createMap()
      ok.putBoolean("started", true)
      promise.resolve(ok)
    } catch (e: Exception) {
      promise.reject("E_WHISPER_PREFETCH", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun transcribeToLrc(audioPath: String, modelPreference: String?, promise: Promise) {
    Thread {
          NrmFileLogger.log(
            "whisper",
            "transcribeToLrc audio=$audioPath model=${modelPreference ?: "(default)"}",
          )
          try {
            val inFile = File(audioPath.trim())
            if (!inFile.isFile) {
              NrmFileLogger.warn("whisper", "오디오 파일 없음: $audioPath")
              promise.reject("E_ARG", "오디오 파일이 없습니다.")
              return@Thread
            }
            val paths = WhisperBootstrap.ensure(reactApplicationContext, modelPreference)
            NrmFileLogger.log(
              "whisper",
              "bootstrap cli=${paths.cliPath.ifBlank { "(없음)" }} model=${paths.modelPath.ifBlank { "(없음)" }} ready=${paths.isReady()}",
            )
            if (!paths.isReady()) {
              NrmFileLogger.warn("whisper", "CLI/모델 미준비 — LRC 스킵")
              val ok = Arguments.createMap()
              ok.putString("lrc", "")
              promise.resolve(ok)
              return@Thread
            }

            val ffmpegBin = File(FfmpegBootstrap.binaryPath(reactApplicationContext))
            if (!ffmpegBin.isFile) {
              NrmFileLogger.warn("whisper", "ffmpeg 없음 — LRC 스킵")
              val ok = Arguments.createMap()
              ok.putString("lrc", "")
              promise.resolve(ok)
              return@Thread
            }

            val parent = inFile.parentFile ?: reactApplicationContext.cacheDir
            val wav = File(parent, "nrm-whisper-${System.currentTimeMillis()}.wav")
            val outPrefix = File(parent, "nrm-whisper-out-${System.currentTimeMillis()}")

            try {
              convertTo16kMonoWav(ffmpegBin, inFile, wav)
              runWhisper(paths, wav, outPrefix)
              val lrcFile = File(outPrefix.absolutePath + ".lrc")
              val lrc =
                  normalizeWhisperLrc(
                      if (lrcFile.isFile) lrcFile.readText(Charsets.UTF_8).trim() else "",
                  )
              NrmFileLogger.log("whisper", "transcribeToLrc OK lrcLen=${lrc.length}")
              val ok = Arguments.createMap()
              ok.putString("lrc", lrc)
              promise.resolve(ok)
            } finally {
              wav.delete()
              File(outPrefix.absolutePath + ".lrc").delete()
              File(outPrefix.absolutePath + ".txt").delete()
            }
          } catch (e: Exception) {
            NrmFileLogger.error("whisper", "transcribeToLrc 실패 audio=$audioPath", e)
            promise.reject("E_WHISPER", e.message ?: e.toString(), e)
          }
        }
        .start()
  }

  private fun sendEvent(event: String, body: WritableMap) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, body)
  }

  private fun convertTo16kMonoWav(ffmpeg: File, inFile: File, wavOut: File) {
    val cmd =
        listOf(
            ffmpeg.absolutePath,
            "-y",
            "-i",
            inFile.absolutePath,
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            wavOut.absolutePath,
        )
    runProcess(cmd, "ffmpeg-whisper")
  }

  private fun runWhisper(paths: WhisperBootstrap.WhisperPaths, wav: File, outPrefix: File) {
    val threadCount = Runtime.getRuntime().availableProcessors().coerceAtLeast(2)
    val cmd =
        listOf(
            paths.cliPath,
            "-m",
            paths.modelPath,
            "-l",
            "auto",
            "-t",
            threadCount.toString(),
            "-f",
            wav.absolutePath,
            "-of",
            outPrefix.absolutePath,
            "--output-lrc",
            "--no-prints",
        )
    runProcess(cmd, "whisper")
  }

  private fun normalizeWhisperLrc(lrc: String): String {
    var t = lrc.trim()
    if (t.startsWith("[by:whisper.cpp]")) {
      val nl = t.indexOf('\n')
      t = if (nl >= 0) t.substring(nl + 1).trim() else ""
    }
    return t
  }

  private fun runProcess(cmd: List<String>, tag: String = "whisper") {
    NrmExecutableFile.prepareForExecution(File(cmd.first()))
    NrmFileLogger.log(tag, "프로세스 시작: ${cmd.joinToString(" ")}")
    val pb = ProcessBuilder(cmd)
    pb.redirectErrorStream(true)
    val p = pb.start()
    val out = StringBuilder()
    BufferedReader(InputStreamReader(p.inputStream, Charset.defaultCharset())).use { r ->
      var line: String?
      while (r.readLine().also { line = it } != null) {
        out.append(line).append('\n')
      }
    }
    val finished = p.waitFor(processTimeoutSec, TimeUnit.SECONDS)
    if (!finished) {
      p.destroyForcibly()
      NrmFileLogger.error(tag, "프로세스 타임아웃 (${processTimeoutSec}s)", null)
      throw Exception("whisper_timeout")
    }
    val code = p.exitValue()
    NrmFileLogger.logProcess(tag, cmd, code, out.toString())
    if (code != 0) {
      throw Exception("${tag}_exit_$code")
    }
  }
}
