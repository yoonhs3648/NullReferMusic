package com.nullrefer.music.ondevice

import android.os.SystemClock
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

  /** no-speech threshold 완화 — 인트로·보컬 구간 no-speech 판정 완화 */
  private companion object {
    const val NO_SPEECH_THRESHOLD = "0.45"
  }

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
    val label = File(audioPath.trim()).name
    WhisperTranscribeQueue.submit(label) { queueDepthAtStart ->
      transcribeToLrcBlocking(audioPath, modelPreference, promise, queueDepthAtStart)
    }
  }

  private fun transcribeToLrcBlocking(
      audioPath: String,
      modelPreference: String?,
      promise: Promise,
      queueDepthAtStart: Int = 1,
  ) {
    val perf =
        if (NrmWhisperPerfLog.ENABLED) {
          NrmWhisperPerfLog.session("transcribeToLrc")
        } else {
          null
        }
    perf?.let {
      NrmFileLogger.log(NrmWhisperPerfLog.TAG, "=== WHISPER_PERF_BEGIN audio=$audioPath model=${modelPreference ?: "(default)"} ===")
      NrmWhisperPerfLog.logDeviceSnapshot()
    }

    NrmFileLogger.log(
        "whisper",
        "transcribeToLrc audio=$audioPath model=${modelPreference ?: "(default)"}",
    )
    val lrcToken = "whisper-lrc:${System.currentTimeMillis()}"
    NrmBackgroundWorkCoordinator.acquire(reactApplicationContext, lrcToken)
    try {
      val inFile = File(audioPath.trim())
      perf?.mark("input", "exists=${inFile.isFile}")
      NrmWhisperPerfLog.logFileInfo("inputAudio", inFile)

      if (!inFile.isFile) {
        NrmFileLogger.warn("whisper", "오디오 파일 없음: $audioPath")
        promise.reject("E_ARG", "오디오 파일이 없습니다.")
        return
      }

      val paths = WhisperBootstrap.ensure(reactApplicationContext, modelPreference)
      perf?.mark("bootstrap", "ready=${paths.isReady()}")
      NrmWhisperPerfLog.logPaths(
          paths.cliPath,
          paths.modelPath,
          paths.libDir,
          paths.libDir.ifBlank { null },
      )
      NrmFileLogger.log(
          "whisper",
          "bootstrap cli=${paths.cliPath.ifBlank { "(없음)" }} model=${paths.modelPath.ifBlank { "(없음)" }} ready=${paths.isReady()}",
      )
      if (!paths.isReady()) {
        NrmFileLogger.warn("whisper", "CLI/모델 미준비 — LRC 스킵")
        val ok = Arguments.createMap()
        ok.putString("lrc", "")
        promise.resolve(ok)
        return
      }

      if (FfmpegExec.resolve(reactApplicationContext) == null) {
        NrmFileLogger.warn("whisper", "ffmpeg 없음 — LRC 스킵")
        val ok = Arguments.createMap()
        ok.putString("lrc", "")
        promise.resolve(ok)
        return
      }

      val parent = inFile.parentFile ?: reactApplicationContext.cacheDir
      val wav = File(parent, "nrm-whisper-${System.currentTimeMillis()}.wav")
      val outPrefix = File(parent, "nrm-whisper-out-${System.currentTimeMillis()}")

      try {
        val ffmpegT0 = SystemClock.elapsedRealtime()
        convertTo16kMonoWav(inFile, wav)
        val ffmpegMs = SystemClock.elapsedRealtime() - ffmpegT0
        perf?.mark("ffmpeg", "durationMs=$ffmpegMs")
        NrmWhisperPerfLog.logFileInfo("wav16k", wav)

        val wavDur = NrmWhisperPerfLog.wavDurationSec(wav)
        val whisperT0 = SystemClock.elapsedRealtime()
        val whisperOut = runWhisper(paths, wav, outPrefix, queueDepthAtStart)
        val whisperMs = SystemClock.elapsedRealtime() - whisperT0
        perf?.mark("whisper", "durationMs=$whisperMs exit=${whisperOut.exitCode}")
        NrmWhisperPerfLog.logParsedSummary(whisperOut.parsed, whisperMs, wavDur)

        val lrcFile = File(outPrefix.absolutePath + ".lrc")
        val lrc =
            normalizeWhisperLrc(
                if (lrcFile.isFile) lrcFile.readText(Charsets.UTF_8).trim() else "",
            )
        val firstTs = lrc.lineSequence().firstOrNull { it.startsWith('[') }?.take(32) ?: "(none)"
        NrmFileLogger.log("whisper", "transcribeToLrc OK lrcLen=${lrc.length} firstLine=$firstTs")
        perf?.end("lrcLen=${lrc.length} ffmpegMs=$ffmpegMs whisperMs=$whisperMs firstLine=$firstTs")
        val ok = Arguments.createMap()
        ok.putString("lrc", lrc)
        promise.resolve(ok)
      } finally {
        wav.delete()
        File(outPrefix.absolutePath + ".lrc").delete()
        File(outPrefix.absolutePath + ".txt").delete()
      }
    } catch (e: Exception) {
      perf?.end("error=${e.message}")
      NrmFileLogger.error("whisper", "transcribeToLrc 실패 audio=$audioPath", e)
      promise.reject("E_WHISPER", e.message ?: e.toString(), e)
    } finally {
      NrmBackgroundWorkCoordinator.release(reactApplicationContext, lrcToken)
    }
  }

  private fun sendEvent(event: String, body: WritableMap) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, body)
  }

  private fun convertTo16kMonoWav(inFile: File, wavOut: File) {
    if (NrmWhisperPerfLog.ENABLED) {
      NrmFileLogger.log(
          NrmWhisperPerfLog.TAG,
          "ffmpeg cmd: -y -i ${inFile.absolutePath} -ar 16000 -ac 1 -c:a pcm_s16le ${wavOut.absolutePath}",
      )
    }
    FfmpegExec.run(
        reactApplicationContext,
        listOf(
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
        ),
        tag = "ffmpeg-whisper",
    )
  }

  data class WhisperRunResult(
      val exitCode: Int,
      val output: String,
      val parsed: NrmWhisperPerfLog.ParsedWhisperOutput,
  )

  private fun runWhisper(
      paths: WhisperBootstrap.WhisperPaths,
      wav: File,
      outPrefix: File,
      queueDepthAtStart: Int,
  ): WhisperRunResult {
    val threadCount = NrmWhisperPerfLog.resolveThreadCount(queueDepthAtStart)
    NrmFileLogger.log(
        "whisper",
        "runWhisper threads=$threadCount queueDepth=$queueDepthAtStart wavBytes=${wav.length()}",
    )
    val cmd =
        mutableListOf(
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
            "-bs",
            "1",
            "-bo",
            "1",
            "-nth",
            NO_SPEECH_THRESHOLD,
        )
    NrmFileLogger.log("whisper", "runWhisper nth=$NO_SPEECH_THRESHOLD")
    // perf: --no-prints 제거 → system_info·RTF·timing 로그
    if (NrmWhisperPerfLog.ENABLED) {
      NrmFileLogger.log(
          NrmWhisperPerfLog.TAG,
          "whisper-cli LRC argv=${cmd.drop(1).joinToString(" ")}",
      )
    } else {
      cmd.add("--no-prints")
    }
    return runProcessStreaming(cmd, "whisper", paths.libDir)
  }

  private fun normalizeWhisperLrc(lrc: String): String {
    var t = lrc.trim()
    if (t.startsWith("[by:whisper.cpp]")) {
      val nl = t.indexOf('\n')
      t = if (nl >= 0) t.substring(nl + 1).trim() else ""
    }
    return t
  }

  private fun runProcessStreaming(
      cmd: List<String>,
      tag: String = "whisper",
      libDir: String = "",
  ): WhisperRunResult {
    val bin = File(cmd.first())
    val argv = NrmExecutableFile.buildExecArgv(bin, cmd.drop(1))
    val ldPath =
        if (libDir.isNotBlank()) {
          libDir
        } else {
          bin.parentFile?.absolutePath.orEmpty()
        }
    if (NrmWhisperPerfLog.ENABLED) {
      NrmFileLogger.log(NrmWhisperPerfLog.TAG, "exec argv=${argv.joinToString(" ")}")
      NrmFileLogger.log(NrmWhisperPerfLog.TAG, "exec LD_LIBRARY_PATH=$ldPath")
      val libomp = File(ldPath, "libomp.so")
      NrmFileLogger.log(
          NrmWhisperPerfLog.TAG,
          "libomp exists=${libomp.isFile} bytes=${if (libomp.isFile) libomp.length() else 0}",
      )
    }
    NrmFileLogger.log(tag, "프로세스 시작: ${argv.joinToString(" ")}")
    val pb = ProcessBuilder(argv)
    FfmpegExec.applyLibEnv(pb, ldPath)
    pb.redirectErrorStream(true)
    val procT0 = SystemClock.elapsedRealtime()
    val p = pb.start()
    val out = StringBuilder()
    BufferedReader(InputStreamReader(p.inputStream, Charset.defaultCharset())).use { r ->
      var line: String?
      while (r.readLine().also { line = it } != null) {
        out.append(line).append('\n')
        if (NrmWhisperPerfLog.ENABLED) {
          NrmWhisperPerfLog.logStdoutLine(line!!)
        }
      }
    }
    val finished = p.waitFor(processTimeoutSec, TimeUnit.SECONDS)
    val wallMs = SystemClock.elapsedRealtime() - procT0
    if (!finished) {
      p.destroyForcibly()
      NrmFileLogger.error(tag, "프로세스 타임아웃 (${processTimeoutSec}s) wallMs=$wallMs", null)
      throw Exception("whisper_timeout")
    }
    val code = p.exitValue()
    val fullOut = out.toString()
    NrmFileLogger.logProcess(tag, argv, code, fullOut)
    if (NrmWhisperPerfLog.ENABLED) {
      NrmFileLogger.log(NrmWhisperPerfLog.TAG, "process wallMs=$wallMs exit=$code outputChars=${fullOut.length}")
    }
    if (code != 0) {
      throw Exception("${tag}_exit_$code")
    }
    val parsed = NrmWhisperPerfLog.parseAndSummarize(fullOut)
    return WhisperRunResult(code, fullOut, parsed)
  }
}
