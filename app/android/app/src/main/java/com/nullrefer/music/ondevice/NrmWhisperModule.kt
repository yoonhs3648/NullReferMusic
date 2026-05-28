package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.nio.charset.Charset
import java.util.concurrent.TimeUnit

/** APK 내 로컬 whisper.cpp 전사(속도 우선 모델) → LRC */
class NrmWhisperModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  private val processTimeoutSec = 90L

  override fun getName(): String = "NrmWhisper"

  @ReactMethod
  fun transcribeToLrc(audioPath: String, modelPreference: String?, promise: Promise) {
    Thread {
          try {
            val inFile = File(audioPath.trim())
            if (!inFile.isFile) {
              promise.reject("E_ARG", "오디오 파일이 없습니다.")
              return@Thread
            }
            val paths = WhisperBootstrap.ensure(reactApplicationContext, modelPreference)
            if (!paths.isReady()) {
              val ok = Arguments.createMap()
              ok.putString("lrc", "")
              promise.resolve(ok)
              return@Thread
            }

            val ffmpegBin = File(FfmpegBootstrap.binaryPath(reactApplicationContext))
            if (!ffmpegBin.isFile) {
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
                  if (lrcFile.isFile) lrcFile.readText(Charsets.UTF_8).trim() else ""
              val ok = Arguments.createMap()
              ok.putString("lrc", lrc)
              promise.resolve(ok)
            } finally {
              wav.delete()
              File(outPrefix.absolutePath + ".lrc").delete()
              File(outPrefix.absolutePath + ".json").delete()
              File(outPrefix.absolutePath + ".wav.json").delete()
              File(outPrefix.absolutePath + ".txt").delete()
            }
          } catch (e: Exception) {
            promise.reject("E_WHISPER", e.message ?: e.toString(), e)
          }
        }
        .start()
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
    runProcess(cmd)
  }

  private fun runWhisper(paths: WhisperBootstrap.WhisperPaths, wav: File, outPrefix: File) {
    val threadCount = Runtime.getRuntime().availableProcessors().coerceAtLeast(2)
    val cmd =
        listOf(
            paths.cliPath,
            "-m",
            paths.modelPath,
            "-t",
            threadCount.toString(),
            "-f",
            wav.absolutePath,
            "-of",
            outPrefix.absolutePath,
            "--output-lrc",
            "--output-json",
            "--no-prints",
        )
    runProcess(cmd)
  }

  private fun runProcess(cmd: List<String>) {
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
      throw Exception("whisper_timeout")
    }
    val code = p.exitValue()
    if (code != 0) {
      throw Exception("whisper_exit_$code")
    }
  }
}
