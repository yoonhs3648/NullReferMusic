package com.nullrefer.music.ondevice

import android.content.Context
import android.os.SystemClock
import java.io.File
import kotlin.math.max

/**
 * 멜론 plain 가사 + wav2vec2 CTC forced alignment → LRC.
 *
 * 1) wav2vec2 ONNX로 오디오 CTC log-prob 추론
 * 2) 알려진 멜론 가사를 trellis forced alignment로 프레임에 맞춤
 * 실패 시 Whisper 전사 등 다른 엔진으로 대체하지 않음 — 빈 LRC 반환.
 */
object WhisperXAlignEngine {
  fun alignToLrc(
      context: Context,
      audioFile: File,
      lyricsPlain: String,
      mode: String,
  ): String {
    val stageT0 = SystemClock.elapsedRealtime()
    NrmStageLog.log(
        "whisperx-align",
        "align_start",
        mapOf(
            "audio" to audioFile.name,
            "mode" to mode,
            "plainChars" to lyricsPlain.length,
            "plainLines" to lyricsPlain.lineSequence().count { it.isNotBlank() },
        ),
    )

    val alignDir = WhisperXAlignModelDownloader.resolveAlignDir(context)
    if (alignDir == null) {
      NrmFileLogger.warn("whisperx-align", "align_abort model_not_installed")
      NrmStageLog.log("whisperx-align", "align_fail", mapOf("reason" to "model_not_installed"))
      return ""
    }

    val melonLines =
        lyricsPlain
            .lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toList()
    if (melonLines.isEmpty()) {
      NrmStageLog.log("whisperx-align", "align_fail", mapOf("reason" to "empty_lyrics"))
      return ""
    }

    val parent = audioFile.parentFile ?: context.cacheDir
    val wav = File(parent, "nrm-whisperx-${System.currentTimeMillis()}.wav")

    try {
      convertTo16kMonoWav(context, audioFile, wav)
      val durationMs = wavDurationMs(wav)
      NrmStageLog.log(
          "whisperx-align",
          "scaffold_wav_ready",
          mapOf("wavBytes" to wav.length(), "elapsedMs" to (SystemClock.elapsedRealtime() - stageT0)),
      )

      val alignT0 = SystemClock.elapsedRealtime()
      val ctc =
          Wav2Vec2CtcForcedAligner.alignMelonLinesToLrc(
              alignDir,
              wav,
              melonLines,
              durationMs,
          )
      val aligned = ctc.lrc
      val alignMs = SystemClock.elapsedRealtime() - alignT0
      if (aligned.isBlank()) {
        NrmStageLog.log("whisperx-align", "align_fail", mapOf("reason" to "empty_lrc"))
        return ""
      }

      NrmStageLog.log(
          "whisperx-align",
          "align_ok",
          mapOf(
              "engine" to "ctc_fa",
              "totalElapsedMs" to (SystemClock.elapsedRealtime() - stageT0),
              "alignMs" to alignMs,
              "lrcChars" to aligned.length,
              "lrcLines" to aligned.lineSequence().count { it.isNotBlank() },
              "matchedLines" to "${ctc.alignedLines}/${ctc.totalLines}",
          ),
      )
      NrmFileLogger.log(
          "whisperx-align",
          "align_ok mode=$mode engine=ctc_fa lrcLen=${aligned.length} lines=${melonLines.size}",
      )
      return aligned
    } catch (e: Exception) {
      NrmStageLog.log(
          "whisperx-align",
          "align_fail",
          mapOf(
              "elapsedMs" to (SystemClock.elapsedRealtime() - stageT0),
              "err" to (e.message ?: e.toString()).take(200),
          ),
      )
      NrmFileLogger.error("whisperx-align", "align_fail mode=$mode", e)
      throw e
    } finally {
      wav.delete()
    }
  }

  private fun convertTo16kMonoWav(context: Context, inFile: File, wavOut: File) {
    FfmpegExec.run(
        context,
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
        tag = "ffmpeg-whisperx-align",
    )
  }

  private fun wavDurationMs(wav: File): Long {
    return try {
      val bytes = wav.length()
      if (bytes <= 44) return 180_000L
      val dataBytes = bytes - 44
      val samples = dataBytes / 2
      (samples * 1000L) / 16_000L
    } catch (_: Exception) {
      180_000L
    }
  }
}
