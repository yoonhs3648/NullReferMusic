package com.nullrefer.music.ondevice

import android.content.Context
import android.os.SystemClock
import java.io.File
import java.util.Locale
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
      val sourceExt = audioFile.extension.lowercase(Locale.US).ifBlank { "unknown" }
      val sourceBytes = audioFile.length()
      val sourceDurationMs = probeSourceDurationMs(context, audioFile)
      convertTo16kMonoWav(context, audioFile, wav)
      durationMs = wavDurationMs(wav)
      val durationDeltaMs =
          if (sourceDurationMs != null) durationMs - sourceDurationMs else null
      NrmStageLog.log(
          "forced-align",
          "fa_audio_probe",
          mapOf(
              "sourceExt" to sourceExt,
              "sourceBytes" to sourceBytes,
              "sourceDurationMs" to (sourceDurationMs ?: -1L),
              "faWavDurationMs" to durationMs,
              "durationDeltaMs" to (durationDeltaMs ?: -1L),
          ),
      )
      NrmFileLogger.log(
          "forced-align",
          "fa_audio_probe ext=$sourceExt sourceMs=${sourceDurationMs ?: -1} faWavMs=$durationMs deltaMs=${durationDeltaMs ?: -1}",
      )

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

  /** ffmpeg -i 헤더만 읽어 Duration 파싱 (전체 디코드 없음). */
  private fun probeSourceDurationMs(context: Context, file: File): Long? {
    if (!file.isFile) return null
    val paths = FfmpegExec.resolve(context) ?: return null
    return try {
      val (_, output) =
          FfmpegExec.runCapture(
              paths.binary,
              paths.libDir,
              listOf("-hide_banner", "-i", file.absolutePath),
              tag = "ffmpeg-fa-probe",
              timeoutSec = 20,
          )
      parseFfmpegDurationMs(output)
    } catch (t: Throwable) {
      NrmFileLogger.warn(
          "forced-align",
          "fa_audio_probe_fail file=${file.name} err=${t.message?.take(80)}",
      )
      null
    }
  }

  private val FFMPEG_DURATION_RE =
      Regex("""Duration:\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?""")

  private fun parseFfmpegDurationMs(output: String): Long? {
    val m = FFMPEG_DURATION_RE.find(output) ?: return null
    val h = m.groupValues[1].toLongOrNull() ?: return null
    val min = m.groupValues[2].toLongOrNull() ?: return null
    val sec = m.groupValues[3].toLongOrNull() ?: return null
    val fracRaw = m.groupValues[4]
    val fracMs =
        when {
          fracRaw.isEmpty() -> 0L
          fracRaw.length == 1 -> (fracRaw.toLongOrNull() ?: 0L) * 100L
          fracRaw.length == 2 -> (fracRaw.toLongOrNull() ?: 0L) * 10L
          else -> fracRaw.take(3).toLongOrNull() ?: 0L
        }
    return h * 3_600_000L + min * 60_000L + sec * 1_000L + fracMs
  }
}
