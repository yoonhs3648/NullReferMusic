package com.nullrefer.music.ondevice

import android.content.Context
import android.os.SystemClock
import java.io.File
import kotlin.math.max

/**
 * 멜론 plain 가사 + Forced Alignment → LRC.
 * aeneas(MFCC·에너지) 또는 wav2vec2-base CTC(KO/EN) 중 선택된 엔진 사용.
 */
object ForcedAlignEngine {
  data class AlignOutcome(
      val lrc: String,
      val memoryInsufficient: Boolean = false,
  )

  fun alignToLrc(
      context: Context,
      audioFile: File,
      lyricsPlain: String,
      mode: String,
      alignModelId: String,
      syncOptions: MelonSyncAlignOptions = MelonSyncAlignOptions(),
  ): AlignOutcome {
    val stageT0 = SystemClock.elapsedRealtime()
    NrmStageLog.log(
        "forced-align",
        "align_start",
        mapOf(
            "audio" to audioFile.name,
            "mode" to mode,
            "engine" to alignModelId,
            "plainChars" to lyricsPlain.length,
        ),
    )

    val entry =
        AlignModelCatalog.entryById(alignModelId)
            ?: AlignModelCatalog.entryForPreference(alignModelId)
    if (entry == null) {
      NrmStageLog.log("forced-align", "align_fail", mapOf("reason" to "unknown_model"))
      return AlignOutcome(lrc = "")
    }

    val alignDir = AlignModelDownloader.resolveModelDir(context, entry.id)
    if (alignDir == null) {
      NrmStageLog.log("forced-align", "align_fail", mapOf("reason" to "model_not_installed"))
      return AlignOutcome(lrc = "")
    }

    val melonLines =
        lyricsPlain
            .lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toList()
    if (melonLines.isEmpty()) {
      NrmStageLog.log("forced-align", "align_fail", mapOf("reason" to "empty_lyrics"))
      return AlignOutcome(lrc = "")
    }

    val parent = audioFile.parentFile ?: context.cacheDir
    val wav = File(parent, "nrm-fa-${System.currentTimeMillis()}.wav")
    var durationMs = 180_000L

    try {
      NrmMemoryGuard.prepareForHeavyInference(context, "forced-align")
      convertTo16kMonoWav(context, audioFile, wav)
      durationMs = wavDurationMs(wav)

      val alignT0 = SystemClock.elapsedRealtime()
      val result =
          when (entry.engine) {
            AlignModelCatalog.EngineKind.AENEAS -> {
              val aeneas = AeneasForcedAligner.alignMelonLinesToLrc(wav, melonLines, durationMs)
              Wav2Vec2CtcForcedAligner.AlignResult(
                  lrc = aeneas.lrc,
                  alignedLines = aeneas.alignedLines,
                  totalLines = aeneas.totalLines,
                  memoryInsufficient = false,
              )
            }
            AlignModelCatalog.EngineKind.CTC_ONNX -> {
              Wav2Vec2CtcForcedAligner.alignMelonLinesToLrc(
                  context,
                  alignDir,
                  wav,
                  melonLines,
                  durationMs,
                  onnxReserveMb = entry.onnxReserveMb,
                  options = syncOptions,
              )
            }
          }

      val alignMs = SystemClock.elapsedRealtime() - alignT0
      if (result.memoryInsufficient) {
        NrmStageLog.log("forced-align", "align_fail", mapOf("reason" to "low_memory"))
        return AlignOutcome(lrc = "", memoryInsufficient = true)
      }
      if (result.lrc.isBlank()) {
        NrmStageLog.log("forced-align", "align_fail", mapOf("reason" to "empty_lrc"))
        return AlignOutcome(lrc = "")
      }

      NrmStageLog.log(
          "forced-align",
          "align_ok",
          mapOf(
              "engine" to entry.id,
              "alignMs" to alignMs,
              "lrcLines" to result.alignedLines,
              "totalLines" to result.totalLines,
          ),
      )
      return AlignOutcome(lrc = result.lrc)
    } catch (t: Throwable) {
      NrmStageLog.log(
          "forced-align",
          "align_fail",
          mapOf("err" to (t.message ?: t.toString()).take(200)),
      )
      NrmFileLogger.error("forced-align", "align_fail mode=$mode engine=${entry.id}", t)
      return AlignOutcome(lrc = "")
    } finally {
      wav.delete()
      if (entry.engine == AlignModelCatalog.EngineKind.CTC_ONNX) {
        Wav2Vec2CtcForcedAligner.releaseOnnxSession()
      }
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
        tag = "ffmpeg-forced-align",
    )
  }

  private fun wavDurationMs(wav: File): Long {
    return try {
      val bytes = wav.length()
      if (bytes <= 44) return 180_000L
      val samples = (bytes - 44) / 2
      max(1_000L, (samples * 1000L) / 16_000L)
    } catch (_: Exception) {
      180_000L
    }
  }
}
