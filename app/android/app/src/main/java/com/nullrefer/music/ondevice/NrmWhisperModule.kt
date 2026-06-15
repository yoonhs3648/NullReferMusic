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

/** APK 내 로컬 whisper.cpp 전사 → LRC (모델은 사전 다운로드만) */
class NrmWhisperModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  init {
    WhisperModelDownloader.setEventEmitter { event, body -> sendEvent(event, body) }
    WhisperXAlignModelDownloader.setEventEmitter { event, body -> sendEvent(event, body) }
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
    // 제출 시점 설정을 공유 상태에 기록 — 이후 updateModelPreference가 불리기 전까지
    // 대기 중인 작업들이 이 값을 실행 시점에 읽는다
    if (!modelPreference.isNullOrBlank()) {
      WhisperActiveModel.setPreference(modelPreference)
    }
    val label = File(audioPath.trim()).name
    WhisperTranscribeQueue.submit(label) { queueDepthAtStart ->
      transcribeToLrcBlocking(audioPath, modelPreference, promise, queueDepthAtStart)
    }
  }

  /**
   * JS 설정 화면에서 모델을 변경할 때 호출. 이미 큐에 적재된 미실행 작업들이
   * 다음 실행 시점에 새 모델을 사용하도록 공유 상태를 갱신한다.
   */
  @ReactMethod
  fun updateModelPreference(pref: String?) {
    if (!pref.isNullOrBlank()) {
      WhisperActiveModel.setPreference(pref)
      NrmFileLogger.log("whisper", "updateModelPreference pref=$pref")
    }
  }

  private fun transcribeToLrcBlocking(
      audioPath: String,
      submitTimePref: String?,
      promise: Promise,
      queueDepthAtStart: Int = 1,
  ) {
    // 실행 시점에 최신 모델 설정을 읽는다.
    // 사용자가 설정에서 모델을 바꾸고 updateModelPreference를 호출했다면
    // 대기 중이던 이 작업도 새 모델을 사용하게 된다.
    val modelPreference = WhisperActiveModel.getPreference() ?: submitTimePref
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

      if (NrmWhisperDevicePolicy.preferQuantizedGgml(reactApplicationContext)) {
        NrmFileLogger.log(
            "whisper",
            "transcribe lowRamPolicy ${NrmWhisperDevicePolicy.memorySnapshot(reactApplicationContext)}",
        )
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
        val ffmpegSkipped = convertTo16kMonoWav(inFile, wav)
        val ffmpegMs = SystemClock.elapsedRealtime() - ffmpegT0
        if (ffmpegSkipped) {
          perf?.mark("ffmpeg", "skipped_already_16k_wav durationMs=$ffmpegMs")
        }
        perf?.mark("ffmpeg", "durationMs=$ffmpegMs")
        NrmWhisperPerfLog.logFileInfo("wav16k", wav)

        val wavDur = NrmWhisperPerfLog.wavDurationSec(wav)
        val whisperT0 = SystemClock.elapsedRealtime()
        val whisperOut = runWhisper(paths, wav, outPrefix, queueDepthAtStart)
        val whisperMs = SystemClock.elapsedRealtime() - whisperT0
        perf?.mark("whisper", "durationMs=$whisperMs exit=${whisperOut.exitCode}")

        // 쿨다운 기간 동안 OS 페이지 캐시에 모델을 사전 적재.
        // 다음 작업이 동일 모델을 사용할 경우 로드 시간을 단축한다.
        WhisperActiveModel.scheduleWarmup(paths.modelPath)
        NrmWhisperPerfLog.logParsedSummary(whisperOut.parsed, whisperMs, wavDur)

        val lrcFile = File(outPrefix.absolutePath + ".lrc")
        val lrc =
            normalizeWhisperLrc(
                if (lrcFile.isFile) lrcFile.readText(Charsets.UTF_8).trim() else "",
            )
        val firstTs = lrc.lineSequence().firstOrNull { it.startsWith('[') }?.take(32) ?: "(none)"
        NrmFileLogger.log("whisper", "transcribeToLrc OK lrcLen=${lrc.length} firstLine=$firstTs")
        NrmStageLog.log(
            "whisper",
            "transcribe_ok",
            mapOf(
                "ffmpegMs" to ffmpegMs,
                "whisperMs" to whisperMs,
                "lrcLen" to lrc.length,
                "wavDurSec" to wavDur,
            ),
        )
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
      NrmStageLog.log(
          "whisper",
          "transcribe_fail",
          mapOf("err" to (e.message ?: e.toString()).take(200)),
      )
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

  /** @return true if ffmpeg was skipped (input already usable 16k mono WAV) */
  private fun convertTo16kMonoWav(inFile: File, wavOut: File): Boolean {
    if (canUseAsWhisperWav(inFile)) {
      inFile.copyTo(wavOut, overwrite = true)
      NrmFileLogger.log("whisper", "ffmpeg skip — already 16k mono wav ${inFile.length()} bytes")
      return true
    }
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
    return false
  }

  /** RIFF WAVE pcm_s16le mono 16kHz — whisper 입력으로 재인코딩 생략 */
  private fun canUseAsWhisperWav(file: File): Boolean {
    if (!file.isFile || file.length() < 48) return false
    if (!file.name.lowercase().endsWith(".wav")) return false
    return try {
      file.inputStream().use { input ->
        val h = ByteArray(44)
        if (input.read(h) < 44) return false
        val riff = String(h, 0, 4, Charsets.US_ASCII)
        val wave = String(h, 8, 4, Charsets.US_ASCII)
        val fmt = String(h, 12, 4, Charsets.US_ASCII)
        if (riff != "RIFF" || wave != "WAVE" || fmt != "fmt ") return false
        val channels = (h[22].toInt() and 0xff) or ((h[23].toInt() and 0xff) shl 8)
        val sampleRate =
            (h[24].toInt() and 0xff) or
                ((h[25].toInt() and 0xff) shl 8) or
                ((h[26].toInt() and 0xff) shl 16) or
                ((h[27].toInt() and 0xff) shl 24)
        val bits = (h[34].toInt() and 0xff) or ((h[35].toInt() and 0xff) shl 8)
        channels == 1 && sampleRate == 16_000 && bits == 16
      }
    } catch (_: Exception) {
      false
    }
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
    val modelFile = File(paths.modelPath).name
    // 모델명을 전달해 모델 tier별 최적 스레드 수를 결정한다.
    // RAM 크기는 GGML 스레드 수와 무관하므로 lowRam 조건은 제거됨.
    val threadCount = NrmWhisperPerfLog.resolveThreadCount(modelFile, queueDepthAtStart)
    val beam = NrmWhisperLrcParams.resolveBeam(queueDepthAtStart)
    NrmFileLogger.log(
        "whisper",
        "runWhisper model=$modelFile threads=$threadCount bs=${beam.size} bo=${beam.bestOf} nth=${NrmWhisperLrcParams.NO_SPEECH_THRESHOLD} lpt=${NrmWhisperLrcParams.LOGPROB_THRESHOLD} queueDepth=$queueDepthAtStart wavBytes=${wav.length()}",
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
        )
    cmd.addAll(NrmWhisperLrcParams.qualityTailArgs(beam))
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
    NrmMediaCpuPriority.registerWhisperProcess(p)
    val out = StringBuilder()
    val code: Int
    try {
      BufferedReader(InputStreamReader(p.inputStream, Charset.defaultCharset())).use { r ->
        var line: String?
        while (r.readLine().also { line = it } != null) {
          out.append(line).append('\n')
          if (NrmWhisperPerfLog.ENABLED) {
            NrmWhisperPerfLog.logStdoutLine(line!!)
          }
        }
      }
      p.waitFor()
      val wallMs = SystemClock.elapsedRealtime() - procT0
      code = p.exitValue()
      if (NrmWhisperPerfLog.ENABLED) {
        NrmFileLogger.log(
            NrmWhisperPerfLog.TAG,
            "process wallMs=$wallMs exit=$code outputChars=${out.length}",
        )
      }
    } finally {
      NrmMediaCpuPriority.unregisterWhisperProcess(p)
    }
    val fullOut = out.toString()
    NrmFileLogger.logProcess(tag, argv, code, fullOut)
    if (code != 0) {
      throw Exception("${tag}_exit_$code")
    }
    val parsed = NrmWhisperPerfLog.parseAndSummarize(fullOut)
    return WhisperRunResult(code, fullOut, parsed)
  }

  @ReactMethod
  fun getAlignModelStatuses(promise: Promise) {
    try {
      val statuses = WhisperXAlignModelDownloader.listStatuses(reactApplicationContext)
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
      promise.reject("E_ALIGN_STATUS", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun isAlignModelInstalled(promise: Promise) {
    try {
      promise.resolve(WhisperXAlignModelDownloader.isInstalled(reactApplicationContext))
    } catch (e: Exception) {
      promise.reject("E_ALIGN_STATUS", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun startAlignModelDownload(modelId: String?, promise: Promise) {
    try {
      val id = (modelId ?: "").trim()
      if (id != WhisperXAlignModelCatalog.MODEL_ID) {
        promise.reject("E_ARG", "invalid_align_model_id")
        return
      }
      WhisperXAlignModelDownloader.startDownload(reactApplicationContext)
      val ok = Arguments.createMap()
      ok.putBoolean("started", true)
      promise.resolve(ok)
    } catch (e: Exception) {
      promise.reject("E_ALIGN_DL", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun alignMelonLyricsToLrc(
      audioPath: String,
      lyricsPlain: String,
      mode: String,
      promise: Promise,
  ) {
    Thread {
      val token = "whisperx-align:${System.currentTimeMillis()}"
      NrmBackgroundWorkCoordinator.acquire(reactApplicationContext, token)
      try {
        val inFile = File(audioPath.trim())
        if (!inFile.isFile) {
          promise.reject("E_ARG", "오디오 파일이 없습니다.")
          return@Thread
        }
        val lrc =
            WhisperXAlignEngine.alignToLrc(
                reactApplicationContext,
                inFile,
                lyricsPlain,
                mode,
            )
        val ok = Arguments.createMap()
        ok.putString("lrc", lrc)
        promise.resolve(ok)
      } catch (e: Exception) {
        promise.reject("E_ALIGN", e.message ?: e.toString(), e)
      } finally {
        NrmBackgroundWorkCoordinator.release(reactApplicationContext, token)
      }
    }.start()
  }
}
