package com.nullrefer.music.ondevice
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.FloatBuffer
import java.nio.ShortBuffer
import java.util.Locale
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import org.json.JSONObject
/**
 * wav2vec2 CTC forced alignment ???뚮젮吏?媛??硫쒕줎)瑜??ㅻ뵒???꾨젅?꾩뿉 留욎텣??
 * WhisperX Python FA? 媛숈? 怨꾩뿴(CTC trellis), ONNX Runtime?쇰줈 ?⑤뵒諛붿씠???ㅽ뻾.
 *
 * ?꾨왂: 蹂댁뺄 援ш컙 媛먯? ??媛?ν븯硫??꾩껜 媛??1-pass ?뺣젹.
 * trellis ?쒕룄 珥덇낵쨌OOM ?쒖뿉留?媛??湲몄씠 鍮꾩쑉濡??곸쓳 遺꾪븷?쒕떎.
 * ONNX 異붾줎留?4珥??⑥쐞 泥?겕(硫붾え由ъ슜)濡??섎늿??
 */
object Wav2Vec2CtcForcedAligner {
  private val env: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }
  private const val SAMPLE_RATE = 16_000
  private const val MAX_AUDIO_SAMPLES = SAMPLE_RATE * 60 * 20
  private const val MAX_TRELLIS_CELLS = 8_000_000L
  private const val MAX_TRELLIS_CELLS_HIGH = 12_000_000L
  /** trellis 異붿젙 ?ъ쑀 (?ㅼ젣 ?좏겙쨌?꾨젅?꾩씠 異붿젙蹂대떎 ?????덉쓬) */
  private const val TRELLIS_PLAN_MARGIN = 0.85
  /** wav2vec2 CNN stride ??320 samples/frame @16kHz */
  private const val FRAME_STRIDE_SAMPLES = 320
  private const val VOCAL_FRAME_SIZE = 512
  private const val VOCAL_FRAME_HOP = 160
  /** 인트로(연주)와 첫 가사 사이 최소 간격 — CTC가 0초에 붙는 것 방지 */
  private const val MIN_INTRO_MS = 800
  private const val ONSET_SUSTAIN_FRAMES = 10
  data class AlignResult(
      val lrc: String,
      val alignedLines: Int,
      val totalLines: Int,
      val memoryInsufficient: Boolean = false,
  )
  private data class VocalRange(
      val startMs: Long,
      val endMs: Long,
  ) {
    fun durationMs(totalMs: Long): Long = (endMs - startMs).coerceIn(1L, totalMs)
  }
  private data class PlannedSegment(
      val lines: List<String>,
      val weightStart: Double,
      val weightEnd: Double,
  )
  fun alignMelonLinesToLrc(
      context: Context,
      alignDir: File,
      wav: File,
      melonLines: List<String>,
      audioDurationMs: Long,
      onnxReserveMb: Long = 220L,
      options: MelonSyncAlignOptions = MelonSyncAlignOptions(),
  ): AlignResult {
    if (melonLines.isEmpty()) {
      return AlignResult(lrc = "", alignedLines = 0, totalLines = 0)
    }
    val durationMs = audioDurationMs.coerceAtLeast(1_000L)
    try {
      val wavBytes = wav.length()
      val sampleCount = ((wavBytes - 44).coerceAtLeast(0) / 2).toInt()
      if (sampleCount <= 0) {
        throw IllegalStateException("empty_wav")
      }
      preflightInference(sampleCount)
      if (NrmMemoryGuard.shouldDeferForActiveDownload(context)) {
        NrmFileLogger.warn(
            "whisperx-align",
            "ctc_fa_defer_download availMb=${NrmMemoryGuard.availMemMb(context)}",
        )
        return alignMemoryFailed(melonLines)
      }
      if (!NrmMemoryGuard.canAttemptCtcAlign(context, onnxReserveMb)) {
        NrmFileLogger.warn(
            "whisperx-align",
            "ctc_fa_low_mem_pre_session availMb=${NrmMemoryGuard.availMemMb(context)} need=${NrmMemoryGuard.minAvailMbForCtcAttempt(onnxReserveMb)}",
        )
        return alignMemoryFailed(melonLines)
      }
      val modelFile = File(alignDir, "model.onnx")
      if (!modelFile.isFile) {
        return alignFailed(melonLines)
      }
      NrmMemoryGuard.prepareForHeavyInference(context, "whisperx-align")
      val profile = NrmMemoryGuard.resolveCtcProfile(context, options.quality)
      if (profile.tier == "blocked") {
        NrmFileLogger.warn(
            "whisperx-align",
            "ctc_fa_blocked availMb=${NrmMemoryGuard.availMemMb(context)}",
        )
        return alignMemoryFailed(melonLines)
      }
      val chunkSamples = NrmMemoryGuard.effectiveChunkSamples(context, profile.chunkSamples)
      NrmFileLogger.log(
          "whisperx-align",
          "ctc_fa_profile tier=${profile.tier} quality=${options.quality} chunkSamples=$chunkSamples availMb=${NrmMemoryGuard.availMemMb(context)}",
      )
      var result =
          try {
            alignMelonLinesAdaptive(
                context,
                alignDir,
                wav,
                melonLines,
                durationMs,
                sampleCount,
                chunkSamples,
                modelFile,
                options,
            )
          } catch (t: Throwable) {
            if (t is OutOfMemoryError || t.cause is OutOfMemoryError) {
              NrmFileLogger.warn(
                  "whisperx-align",
                  "ctc_fa_oom availMb=${NrmMemoryGuard.availMemMb(context)}",
              )
              return alignMemoryFailed(melonLines)
            } else {
              throw t
            }
          }
      if (result.lrc.isBlank() && !result.memoryInsufficient) {
        NrmFileLogger.warn("whisperx-align", "ctc_fa_retry_standard lines=${melonLines.size}")
        val relaxed = options.copy(quality = MelonSyncAlignOptions.QUALITY_STANDARD)
        result =
            try {
              alignMelonLinesAdaptive(
                  context,
                  alignDir,
                  wav,
                  melonLines,
                  durationMs,
                  sampleCount,
                  chunkSamples,
                  modelFile,
                  relaxed,
              )
            } catch (t: Throwable) {
              if (t is OutOfMemoryError || t.cause is OutOfMemoryError) {
                return alignMemoryFailed(melonLines)
              }
              AlignResult(lrc = "", alignedLines = 0, totalLines = melonLines.size)
            }
      }
      if (result.lrc.isBlank()) {
        return if (result.memoryInsufficient) alignMemoryFailed(melonLines) else alignFailed(melonLines)
      }
      return result
    } catch (t: Throwable) {
      if (t is OutOfMemoryError || t.cause is OutOfMemoryError) {
        NrmFileLogger.warn(
            "whisperx-align",
            "ctc_fa_oom availMb=${NrmMemoryGuard.availMemMb(context)}",
        )
        return alignMemoryFailed(melonLines)
      }
      NrmFileLogger.error(
          "whisperx-align",
          "ctc_fa_fail lines=${melonLines.size} durMs=$audioDurationMs err=${t.message?.take(120)}",
          t,
      )
      return alignFailed(melonLines)
    }
  }
  fun releaseOnnxSession() {
    // ephemeral ONNX ?몄뀡留??ъ슜 ??罹먯떆 ?놁쓬
  }
  private fun alignFailed(melonLines: List<String>): AlignResult {
    return AlignResult(lrc = "", alignedLines = 0, totalLines = melonLines.size)
  }
  private fun alignMemoryFailed(melonLines: List<String>): AlignResult {
    return AlignResult(
        lrc = "",
        alignedLines = 0,
        totalLines = melonLines.size,
        memoryInsufficient = true,
    )
  }
  private fun alignMelonLinesAdaptive(
      context: Context,
      alignDir: File,
      wav: File,
      melonLines: List<String>,
      durationMs: Long,
      totalSamples: Int,
      chunkSamples: Int,
      modelFile: File,
      options: MelonSyncAlignOptions,
  ): AlignResult {
    val pcm = readMonoPcm16(wav, totalSamples)
    val vocal =
        if (options.vocalRangeAutoDetect) detectVocalRange(pcm, durationMs, totalSamples)
        else VocalRange(0L, durationMs)
    val vocabFile = File(alignDir, "vocab.json")
    val vocab = loadVocab(vocabFile)
    val blankId = vocab.charToId["<pad>"] ?: vocab.charToId["|"] ?: 0
    val vocalStartSample = msToSample(vocal.startMs, totalSamples)
    val vocalEndSample = msToSample(vocal.endMs, totalSamples).coerceAtLeast(vocalStartSample + 1)
    val vocalSamples = vocalEndSample - vocalStartSample
    val vocalFrames = estimateFrameCount(vocalSamples)
    var segments = planLyricSegments(melonLines, vocab, blankId, vocalFrames, context, options)
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_plan segments=${segments.size} vocalMs=${vocal.startMs}-${vocal.endMs} frames=$vocalFrames lines=${melonLines.size}",
    )
    val session = env.createSession(modelFile.absolutePath, buildSessionOptions(NrmMemoryGuard.availMemMb(context)))
    return try {
      try {
        alignPlannedSegments(
            context,
            alignDir,
            wav,
            modelFile,
            segments,
            vocal,
            durationMs,
            totalSamples,
            chunkSamples,
            pcm,
            session,
            vocab,
            options,
        )
      } catch (t: Throwable) {
        if ((t is OutOfMemoryError || t.cause is OutOfMemoryError) && segments.size == 1) {
          NrmFileLogger.warn("whisperx-align", "ctc_fa_oom_retry_split lines=${melonLines.size}")
          val split = balancedSplitIndex(melonLines, options.vocabKind())
          val left = melonLines.subList(0, split)
          val right = melonLines.subList(split, melonLines.size)
          val lw = lineCharWeights(left, options.vocabKind()).sum().toDouble()
          val rw = lineCharWeights(right, options.vocabKind()).sum().toDouble().coerceAtLeast(1.0)
          val total = lw + rw
          val mid = lw / total
          segments =
              listOf(
                  PlannedSegment(left, 0.0, mid),
                  PlannedSegment(right, mid, 1.0),
              )
          alignPlannedSegments(
              context,
              alignDir,
              wav,
              modelFile,
              segments,
              vocal,
              durationMs,
              totalSamples,
              chunkSamples,
              pcm,
              session,
              vocab,
              options,
          )
        } else {
          throw t
        }
      }
    } finally {
      try {
        session.close()
      } catch (_: Exception) {
        // ignore
      }
      NrmMemoryGuard.trimBetweenInferenceSteps(context, "whisperx-align", force = true)
    }
  }
  private fun alignPlannedSegments(
      context: Context,
      alignDir: File,
      wav: File,
      modelFile: File,
      segments: List<PlannedSegment>,
      vocal: VocalRange,
      durationMs: Long,
      totalSamples: Int,
      chunkSamples: Int,
      pcm: ShortArray,
      session: OrtSession,
      cachedVocab: Vocab,
      options: MelonSyncAlignOptions,
  ): AlignResult {
    val vocalDurationMs = vocal.durationMs(durationMs)
    val sb = StringBuilder()
    var aligned = 0
    var totalLines = 0
    for ((idx, segment) in segments.withIndex()) {
      if (!NrmMemoryGuard.waitForChunkMemory(context, "whisperx-align")) {
        NrmFileLogger.warn(
            "whisperx-align",
            "ctc_fa_low_mem_segment availMb=${NrmMemoryGuard.availMemMb(context)}",
        )
        return alignMemoryFailed(segments.flatMap { it.lines })
      }
      val startMs = vocal.startMs + (segment.weightStart * vocalDurationMs).toLong()
      val endMs = vocal.startMs + (segment.weightEnd * vocalDurationMs).toLong()
      val segDuration = (endMs - startMs).coerceAtLeast(500L)
      val startSample = msToSample(startMs, totalSamples)
      val endSample = msToSample(endMs, totalSamples).coerceAtLeast(startSample + 1)
      val segAudio = readPcmSegment(pcm, startSample, endSample)
      if (segAudio.isEmpty()) {
        totalLines += segment.lines.size
        continue
      }
      val effectiveChunk =
          NrmMemoryGuard.effectiveChunkSamples(
              context,
              NrmMemoryGuard.resolveLiveCtcProfile(
                      context,
                      NrmMemoryGuard.CtcInferenceProfile(tier = "live", chunkSamples = chunkSamples),
                  )
                  .chunkSamples,
          )
      val part =
          try {
            alignAudioToLines(
                context,
                alignDir,
                modelFile,
                segAudio,
                segment.lines,
                segDuration,
                timeOffsetMs = startMs.toInt(),
                chunkSamples = effectiveChunk,
                session = session,
                cachedVocab = cachedVocab,
                options = options,
            )
          } catch (t: Throwable) {
            if (t is OutOfMemoryError || t.cause is OutOfMemoryError) {
              NrmFileLogger.warn(
                  "whisperx-align",
                  "ctc_fa_segment_oom seg=$idx lines=${segment.lines.size}",
              )
              throw t
            }
            if (t.message?.contains("trellis_too_large") == true && segment.lines.size > 1) {
              NrmFileLogger.warn(
                  "whisperx-align",
                  "ctc_fa_trellis_split seg=$idx lines=${segment.lines.size}",
              )
              val split = balancedSplitIndex(segment.lines, options.vocabKind())
              val left = segment.lines.subList(0, split)
              val right = segment.lines.subList(split, segment.lines.size)
              val lw = lineCharWeights(left, options.vocabKind()).sum().toDouble()
              val rw = lineCharWeights(right, options.vocabKind()).sum().toDouble().coerceAtLeast(1.0)
              val total = lw + rw
              val midW = segment.weightStart + (segment.weightEnd - segment.weightStart) * (lw / total)
              val subSegments =
                  listOf(
                      PlannedSegment(left, segment.weightStart, midW),
                      PlannedSegment(right, midW, segment.weightEnd),
                  )
              val sub =
                  alignPlannedSegments(
                      context,
                      alignDir,
                      wav,
                      modelFile,
                      subSegments,
                      vocal,
                      durationMs,
                      totalSamples,
                      chunkSamples,
                      pcm,
                      session,
                      cachedVocab,
                      options,
                  )
              if (sub.lrc.isNotBlank()) {
                sb.append(sub.lrc).append('\n')
                aligned += sub.alignedLines
              }
              totalLines += segment.lines.size
              NrmMemoryGuard.trimBetweenInferenceSteps(context, "whisperx-align")
              continue
            }
            throw t
          }
      if (part.lrc.isNotBlank()) {
        sb.append(part.lrc).append('\n')
        aligned += part.alignedLines
      }
      totalLines += segment.lines.size
      NrmFileLogger.log(
          "whisperx-align",
          "ctc_fa_segment idx=$idx lines=${segment.lines.size} startMs=$startMs endMs=$endMs samples=${segAudio.size}",
      )
      NrmMemoryGuard.trimBetweenInferenceSteps(context, "whisperx-align")
    }
    return AlignResult(
        lrc = sb.toString().trim(),
        alignedLines = aligned,
        totalLines = totalLines,
    )
  }
  /** trellis ?쒕룄 ??1-pass ?곗꽑, 珥덇낵 ??媛??湲몄씠 鍮꾩쑉濡??ш? 遺꾪븷 */
  private fun maxTrellisCells(context: Context, options: MelonSyncAlignOptions): Long {
    val avail = NrmMemoryGuard.availMemMb(context)
    return when (options.quality) {
      MelonSyncAlignOptions.QUALITY_FAST ->
          when {
            avail >= 1_400 -> MAX_TRELLIS_CELLS
            else -> 6_000_000L
          }
      MelonSyncAlignOptions.QUALITY_STANDARD ->
          when {
            avail >= 1_800 -> MAX_TRELLIS_CELLS_HIGH
            avail >= 1_400 -> 10_000_000L
            else -> MAX_TRELLIS_CELLS
          }
      else ->
          when {
            avail >= 2_000 -> 18_000_000L
            avail >= 1_800 -> MAX_TRELLIS_CELLS_HIGH
            avail >= 1_400 -> 10_000_000L
            else -> MAX_TRELLIS_CELLS
          }
    }
  }

  private fun planLyricSegments(
      lines: List<String>,
      vocab: Vocab,
      blankId: Int,
      frameCount: Int,
      context: Context,
      options: MelonSyncAlignOptions,
  ): List<PlannedSegment> {
    return planRecursive(
        lines,
        0.0,
        1.0,
        frameCount.coerceAtLeast(1),
        vocab,
        blankId,
        maxTrellisCells(context, options),
        options,
    )
  }
  private fun planRecursive(
      lines: List<String>,
      weightStart: Double,
      weightEnd: Double,
      frames: Int,
      vocab: Vocab,
      blankId: Int,
      trellisLimit: Long,
      options: MelonSyncAlignOptions,
  ): List<PlannedSegment> {
    if (lines.isEmpty()) return emptyList()
    val cells = estimateTrellisCells(lines, vocab, blankId, frames, options.vocabKind())
    val limit = (trellisLimit * options.trellisPlanMargin()).toLong()
    if (cells <= limit || lines.size <= 1) {
      return listOf(PlannedSegment(lines, weightStart, weightEnd))
    }
    val splitAt = balancedSplitIndex(lines, options.vocabKind())
    val left = lines.subList(0, splitAt)
    val right = lines.subList(splitAt, lines.size)
    val leftWeight = lineCharWeights(left, options.vocabKind()).sum().toDouble()
    val rightWeight = lineCharWeights(right, options.vocabKind()).sum().toDouble().coerceAtLeast(1.0)
    val total = leftWeight + rightWeight
    val midWeight = weightStart + (weightEnd - weightStart) * (leftWeight / total)
    val leftFrames = max(1, (frames * leftWeight / total).toInt())
    val rightFrames = max(1, frames - leftFrames)
    return planRecursive(left, weightStart, midWeight, leftFrames, vocab, blankId, trellisLimit, options) +
        planRecursive(right, midWeight, weightEnd, rightFrames, vocab, blankId, trellisLimit, options)
  }
  /** ?먮꼫吏 湲곕컲 蹂댁뺄 援ш컙 ???명듃濡쑣룹븘?껎듃濡?臾댁쓬 ?쒖쇅 */
  private fun detectVocalRange(pcm: ShortArray, durationMs: Long, totalSamples: Int): VocalRange {
    if (pcm.isEmpty()) {
      return VocalRange(0L, durationMs)
    }
    val energies = computeFrameLogEnergies(pcm)
    if (energies.size < 8) {
      return VocalRange(0L, durationMs)
    }
    val sorted = energies.copyOf().apply { sort() }
    val median = sorted[sorted.size / 2]
    val p75 = sorted[(sorted.size * 3) / 4]
    val threshold = median + (p75 - median) * 0.55f
    var first = -1
    for (f in energies.indices) {
      if (energies[f] >= threshold) {
        first = f
        break
      }
    }
    var last = -1
    for (f in energies.indices.reversed()) {
      if (energies[f] >= threshold) {
        last = f
        break
      }
    }
    if (first < 0 || last < first) {
      return VocalRange(0L, durationMs)
    }
    val padBeforeMs = 200L
    val padAfterMs = 900L
    var rawStartMs = (first.toLong() * VOCAL_FRAME_HOP * 1000L) / SAMPLE_RATE
    val rawEndMs = ((last + 1).toLong() * VOCAL_FRAME_HOP * 1000L) / SAMPLE_RATE
    var startMs = (rawStartMs - padBeforeMs).coerceAtLeast(0L)
    val endMs = (rawEndMs + padAfterMs).coerceAtMost(durationMs)
    if (endMs - startMs < 4_000L) {
      return VocalRange(0L, durationMs)
    }
    if (startMs <= 500L && durationMs > 45_000L) {
      val singingOnset = detectSingingOnsetMs(energies)
      if (singingOnset in 1_000L..(durationMs - 5_000L)) {
        startMs = (singingOnset - 400L).coerceAtLeast(0L)
        rawStartMs = singingOnset
        NrmFileLogger.log(
            "whisperx-align",
            "ctc_fa_singing_onset onsetMs=$singingOnset startMs=$startMs",
        )
      }
    }
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_vocal startMs=$startMs endMs=$endMs durMs=${endMs - startMs} threshold=$threshold rawStartMs=$rawStartMs",
    )
    return VocalRange(startMs, endMs)
  }

  private fun detectSingingOnsetMs(energies: FloatArray): Long {
    if (energies.size < ONSET_SUSTAIN_FRAMES + 20) return 0L
    val sorted = energies.copyOf().apply { sort() }
    val p60 = sorted[(sorted.size * 3) / 5]
    val p85 = sorted[(sorted.size * 17) / 20]
    val startThreshold = p60 + (p85 - p60) * 0.65f
    val sustainThreshold = p60 + (p85 - p60) * 0.35f
    val lookbackFrames = min(300, energies.size / 4)
    for (f in 20 until energies.size - ONSET_SUSTAIN_FRAMES) {
      if (energies[f] < startThreshold) continue
      var sustained = true
      for (j in 1 until ONSET_SUSTAIN_FRAMES) {
        if (energies[f + j] < sustainThreshold) {
          sustained = false
          break
        }
      }
      if (!sustained) continue
      if (lookbackFrames >= 30) {
        var introSum = 0f
        for (k in f - lookbackFrames until f) {
          introSum += energies[k]
        }
        val introAvg = introSum / lookbackFrames
        if (introAvg >= energies[f] - 0.35f) continue
      }
      return (f.toLong() * VOCAL_FRAME_HOP * 1000L) / SAMPLE_RATE
    }
    return 0L
  }

  private fun estimateFirstLineOnsetMs(
      logProbs: Array<FloatArray>,
      tokens: IntArray,
      charToToken: IntArray,
      lineCharStarts: IntArray,
      blankId: Int,
      frameMs: Double,
      options: MelonSyncAlignOptions,
  ): Int {
    if (lineCharStarts.isEmpty() || tokens.isEmpty()) return -1
    val firstChar = lineCharStarts[0]
    if (firstChar !in charToToken.indices) return -1
    val firstTokenIdx = charToToken[firstChar]
    if (firstTokenIdx !in tokens.indices) return -1
    val firstVocabId = tokens[firstTokenIdx]
    val probeTokens = linkedSetOf(firstVocabId)
    for (c in firstChar until min(firstChar + 8, charToToken.size)) {
      if (c !in charToToken.indices) break
      val ti = charToToken[c]
      if (ti in tokens.indices) probeTokens.add(tokens[ti])
    }
    var bestFrame = 0
    var bestScore = Float.NEGATIVE_INFINITY
    val scores = FloatArray(logProbs.size)
    for (t in logProbs.indices) {
      var maxTok = Float.NEGATIVE_INFINITY
      for (vid in probeTokens) {
        if (vid in logProbs[t].indices) {
          maxTok = max(maxTok, logProbs[t][vid])
        }
      }
      val blank = if (blankId in logProbs[t].indices) logProbs[t][blankId] else 0f
      scores[t] = maxTok - blank
      if (scores[t] > bestScore) {
        bestScore = scores[t]
        bestFrame = t
      }
    }
    if (bestScore <= Float.NEGATIVE_INFINITY + 1f) return -1
    val threshold = bestScore - options.onsetProbeThreshold()
    for (t in logProbs.indices) {
      if (scores[t] >= threshold) {
        return max(options.minIntroMs(), (t * frameMs).toInt())
      }
    }
    return max(options.minIntroMs(), (bestFrame * frameMs).toInt())
  }
  private fun alignAudioToLines(
      context: Context,
      alignDir: File,
      modelFile: File,
      audio: FloatArray,
      melonLines: List<String>,
      audioDurationMs: Long,
      timeOffsetMs: Int,
      chunkSamples: Int,
      session: OrtSession,
      cachedVocab: Vocab? = null,
      options: MelonSyncAlignOptions,
  ): AlignResult {
    if (audio.isEmpty() || melonLines.isEmpty()) {
      return AlignResult(lrc = "", alignedLines = 0, totalLines = melonLines.size)
    }
    val vocabKind = options.vocabKind()
    val vocab = cachedVocab ?: loadVocab(File(alignDir, "vocab.json"))
    val blankId = vocab.charToId["<pad>"] ?: vocab.charToId["|"] ?: 0
    val logProbs =
        inferLogProbsForAudio(
            context,
            session,
            audio,
            chunkSamples,
            options.chunkOverlapSamples(),
        )
    if (logProbs.isEmpty()) {
      throw IllegalStateException("empty_logits")
    }
    val frameMs = audioDurationMs.toDouble() / logProbs.size.toDouble()
    val lineCharStarts = IntArray(melonLines.size)
    val full = StringBuilder()
    for (i in melonLines.indices) {
      lineCharStarts[i] = full.length
      val lineNorm = normalizeLine(melonLines[i], vocabKind)
      if (lineNorm.isNotEmpty()) {
        full.append(lineNorm)
      }
      if (i < melonLines.lastIndex) full.append('|')
    }
    if (full.isEmpty()) {
      throw IllegalStateException("empty_normalized_lines")
    }
    val charToTokenIndex = buildCharToTokenIndex(full.toString(), vocab, blankId)
    val tokens = charToTokenIndex.distinctTokenIds()
    if (tokens.isEmpty()) {
      throw IllegalStateException("empty_tokens")
    }
    val trellisLimit = maxTrellisCells(context, options)
    val trellisCells = logProbs.size.toLong() * (tokens.size * 2L + 1L)
    if (trellisCells > trellisLimit) {
      throw IllegalStateException("trellis_too_large cells=$trellisCells")
    }
    val charToToken = charToTokenIndex.charToToken
    val tokenStartFrames = forcedAlignTokenStarts(logProbs, tokens, blankId, trellisLimit)
    val firstLineOnsetMs =
        if (options.firstLineIntroCorrection) {
          estimateFirstLineOnsetMs(
              logProbs,
              tokens,
              charToToken,
              lineCharStarts,
              blankId,
              frameMs,
              options,
          )
        } else {
          -1
        }
    val rawMs = IntArray(melonLines.size)
    for (i in melonLines.indices) {
      val charStart = lineCharStarts[i]
      val tokenIdx =
          if (charStart in charToToken.indices) charToToken[charStart]
          else charToToken.lastOrNull() ?: 0
      val frame =
          if (tokenIdx in tokenStartFrames.indices) tokenStartFrames[tokenIdx]
          else tokenStartFrames.lastOrNull() ?: 0
      rawMs[i] = timeOffsetMs + (frame * frameMs).toInt().coerceAtLeast(0)
    }
    if (melonLines.isNotEmpty() && options.firstLineIntroCorrection && firstLineOnsetMs >= 0) {
      val minFirst = timeOffsetMs + firstLineOnsetMs
      if (rawMs[0] < minFirst) {
        val delta = minFirst - rawMs[0]
        val adjusted =
            if (delta > 12_000) {
              rawMs[0] + (delta * 2) / 3
            } else {
              minFirst
            }
        NrmFileLogger.log(
            "whisperx-align",
            "ctc_fa_first_line_bump before=${rawMs[0]} after=$adjusted delta=$delta",
        )
        rawMs[0] = adjusted
      }
    }
    for (i in 1 until rawMs.size) {
      if (rawMs[i] <= rawMs[i - 1]) {
        rawMs[i] = rawMs[i - 1] + 65
      }
    }
    val sb = StringBuilder()
    for (i in melonLines.indices) {
      sb.append(formatLrcTimestamp(rawMs[i])).append(melonLines[i]).append('\n')
    }
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa frames=${logProbs.size} tokens=${tokens.size} lines=${melonLines.size}",
    )
    return AlignResult(
        lrc = sb.toString().trim(),
        alignedLines = melonLines.size,
        totalLines = melonLines.size,
    )
  }
  private data class Vocab(val charToId: Map<String, Int>)
  private fun loadVocab(file: File): Vocab {
    val json = JSONObject(file.readText(Charsets.UTF_8))
    val map = mutableMapOf<String, Int>()
    for (key in json.keys()) {
      map[key] = json.getInt(key)
    }
    return Vocab(map)
  }
  private fun normalizeLine(text: String, vocabKind: MelonSyncVocabKind): String {
    val trimmed = text.trim().replace(Regex("""\s+"""), " ")
    return when (vocabKind) {
      MelonSyncVocabKind.KO ->
          HangulJamo.decompose(trimmed.lowercase(Locale.ROOT)).replace(" ", "|")
      MelonSyncVocabKind.EN ->
          trimmed.uppercase(Locale.ROOT).replace(" ", "|")
    }
  }
  private fun lineCharWeights(lines: List<String>, vocabKind: MelonSyncVocabKind): IntArray {
    return IntArray(lines.size) { i -> normalizeLine(lines[i], vocabKind).length.coerceAtLeast(1) }
  }
  private fun balancedSplitIndex(lines: List<String>, vocabKind: MelonSyncVocabKind): Int {
    val weights = lineCharWeights(lines, vocabKind)
    val total = weights.sum().coerceAtLeast(1)
    val half = total / 2
    var cum = 0
    for (i in 0 until lines.lastIndex) {
      cum += weights[i]
      if (cum >= half) return i + 1
    }
    return max(1, lines.size / 2)
  }
  private fun estimateFrameCount(sampleCount: Int): Int {
    return max(1, (sampleCount + FRAME_STRIDE_SAMPLES - 1) / FRAME_STRIDE_SAMPLES)
  }
  private fun estimateTrellisCells(
      lines: List<String>,
      vocab: Vocab,
      blankId: Int,
      frameCount: Int,
      vocabKind: MelonSyncVocabKind,
  ): Long {
    val full = buildNormalizedFullText(lines, vocabKind)
    if (full.isEmpty()) return 0
    val tokenCount = buildCharToTokenIndex(full, vocab, blankId).distinctTokenIds().size
    return frameCount.toLong() * (tokenCount * 2L + 1L)
  }
  private fun buildNormalizedFullText(lines: List<String>, vocabKind: MelonSyncVocabKind): String {
    val full = StringBuilder()
    for (i in lines.indices) {
      val lineNorm = normalizeLine(lines[i], vocabKind)
      if (lineNorm.isNotEmpty()) full.append(lineNorm)
      if (i < lines.lastIndex) full.append('|')
    }
    return full.toString()
  }
  private fun msToSample(ms: Long, totalSamples: Int): Int {
    return ((ms * SAMPLE_RATE) / 1000L).toInt().coerceIn(0, totalSamples)
  }
  private fun buildCharToTokenIndex(text: String, vocab: Vocab, blankId: Int): CharTokenIndex {
    val charToToken = IntArray(text.length) { -1 }
    val tokens = mutableListOf<Int>()
    var i = 0
    while (i < text.length) {
      var matched = false
      for (len in min(4, text.length - i) downTo 1) {
        val piece = text.substring(i, i + len)
        val id = vocab.charToId[piece]
        if (id != null) {
          val tokenIdx = tokens.size
          tokens.add(id)
          for (j in i until i + len) {
            charToToken[j] = tokenIdx
          }
          i += len
          matched = true
          break
        }
      }
      if (!matched) {
        val ch = text[i].toString()
        val tokenIdx = tokens.size
        tokens.add(vocab.charToId[ch] ?: blankId)
        charToToken[i] = tokenIdx
        i += 1
      }
    }
    return CharTokenIndex(charToToken, tokens.toIntArray())
  }
  private data class CharTokenIndex(
      val charToToken: IntArray,
      private val tokenIds: IntArray,
  ) {
    fun distinctTokenIds(): IntArray = tokenIds
  }
  private fun readMonoPcm16(wav: File, totalSamples: Int): ShortArray {
    if (!wav.isFile || wav.length() <= 44) return ShortArray(0)
    return RandomAccessFile(wav, "r").use { raf ->
      val count = min(totalSamples, ((raf.length() - 44) / 2).toInt())
      if (count <= 0) return ShortArray(0)
      raf.seek(44L)
      val bytes = ByteArray(count * 2)
      raf.readFully(bytes)
      val shorts = ShortArray(count)
      val buf = ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
      (buf.asShortBuffer() as ShortBuffer).get(shorts)
      shorts
    }
  }
  private fun computeFrameLogEnergies(pcm: ShortArray): FloatArray {
    val frameCount = max(0, (pcm.size - VOCAL_FRAME_SIZE) / VOCAL_FRAME_HOP + 1)
    if (frameCount <= 0) return FloatArray(0)
    val energies = FloatArray(frameCount)
    for (fi in 0 until frameCount) {
      val start = fi * VOCAL_FRAME_HOP
      var sum = 0.0
      for (i in 0 until VOCAL_FRAME_SIZE) {
        val idx = start + i
        if (idx >= pcm.size) break
        val s = pcm[idx].toDouble() / 32768.0
        sum += s * s
      }
      energies[fi] = ln(max(1e-10, sum / VOCAL_FRAME_SIZE)).toFloat()
    }
    return energies
  }
  private fun readWavSegment(wav: File, startSample: Int, endSample: Int): FloatArray {
    if (!wav.isFile || wav.length() <= 44) return FloatArray(0)
    return RandomAccessFile(wav, "r").use { raf ->
      val totalShorts = ((raf.length() - 44) / 2).toInt()
      val start = startSample.coerceIn(0, totalShorts)
      val end = endSample.coerceIn(start, totalShorts)
      val shortCount = end - start
      if (shortCount <= 0) return FloatArray(0)
      raf.seek(44L + start * 2L)
      val bytes = ByteArray(shortCount * 2)
      raf.readFully(bytes)
      val shorts = ShortArray(shortCount)
      val buf = ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
      (buf.asShortBuffer() as ShortBuffer).get(shorts)
      normalizeSamples(shorts)
    }
  }
  private fun normalizeSamples(shorts: ShortArray): FloatArray {
    if (shorts.isEmpty()) return FloatArray(0)
    val audio = FloatArray(shorts.size)
    var sum = 0.0
    for (i in shorts.indices) {
      audio[i] = shorts[i] / 32768.0f
      sum += audio[i].toDouble()
    }
    val mean = (sum / shorts.size).toFloat()
    var varSum = 0.0
    for (v in audio) {
      val d = v - mean
      varSum += d * d
    }
    val std = sqrt(varSum / shorts.size + 1e-7).toFloat()
    for (i in audio.indices) {
      audio[i] = (audio[i] - mean) / std
    }
    return audio
  }
  private fun preflightInference(sampleCount: Int) {
    if (sampleCount <= 0) {
      throw IllegalStateException("empty_audio")
    }
    if (sampleCount > MAX_AUDIO_SAMPLES) {
      throw IllegalStateException("audio_too_long samples=$sampleCount")
    }
  }
  private fun buildSessionOptions(availMb: Long = 0): OrtSession.SessionOptions {
    val opts = OrtSession.SessionOptions()
    val threads = if (availMb >= 1_500) 2 else 1
    opts.setIntraOpNumThreads(threads)
    opts.setInterOpNumThreads(1)
    opts.setMemoryPatternOptimization(false)
    return opts
  }
  private fun readPcmSegment(pcm: ShortArray, startSample: Int, endSample: Int): FloatArray {
    if (pcm.isEmpty()) return FloatArray(0)
    val start = startSample.coerceIn(0, pcm.size)
    val end = endSample.coerceIn(start, pcm.size)
    if (end <= start) return FloatArray(0)
    return normalizeSamples(pcm.copyOfRange(start, end))
  }

  private fun inferLogProbsForAudio(
      context: Context,
      session: OrtSession,
      audio: FloatArray,
      chunkSamples: Int,
      chunkOverlapSamples: Int = 0,
  ): Array<FloatArray> {
    NrmMemoryGuard.trimBetweenInferenceSteps(context, "whisperx-align")
    if (!NrmMemoryGuard.waitForChunkMemory(context, "whisperx-align")) {
      throw IllegalStateException("low_memory_before_onnx")
    }
    val effectiveChunk = NrmMemoryGuard.effectiveChunkSamples(context, chunkSamples)
    if (audio.size <= effectiveChunk) {
      return inferLogProbsChunk(session, audio, effectiveChunk, offsetSamples = 0)
    }
    val overlap = chunkOverlapSamples.coerceIn(0, effectiveChunk / 4)
    val discardFrames = if (overlap > 0) max(1, overlap / FRAME_STRIDE_SAMPLES) else 0
    val allFrames = ArrayList<FloatArray>(max(1, audio.size / FRAME_STRIDE_SAMPLES))
    var offset = 0
    var chunkIndex = 0
    while (offset < audio.size) {
      if (!NrmMemoryGuard.waitForChunkMemory(context, "whisperx-align")) {
        throw IllegalStateException("low_memory_onnx_chunk")
      }
      val liveChunk = NrmMemoryGuard.effectiveChunkSamples(context, effectiveChunk)
      val end = min(offset + liveChunk, audio.size)
      val chunkLen = end - offset
      val chunk = FloatArray(chunkLen)
      System.arraycopy(audio, offset, chunk, 0, chunkLen)
      val chunkProbs = inferLogProbsChunk(session, chunk, liveChunk, offsetSamples = offset)
      if (chunkIndex == 0) {
        allFrames.addAll(chunkProbs.toList())
      } else {
        val skip = min(discardFrames, chunkProbs.size)
        allFrames.addAll(chunkProbs.drop(skip))
      }
      if (chunkIndex == 0 || chunkIndex % 4 == 0 || end >= audio.size) {
        NrmFileLogger.log(
            "whisperx-align",
            "onnx_chunk idx=$chunkIndex offset=$offset end=$end frames=${chunkProbs.size} overlap=$overlap chunkSamples=$liveChunk availMb=${NrmMemoryGuard.availMemMb(context)}",
        )
      }
      if (end >= audio.size) break
      offset = max(offset + 1, end - overlap)
      chunkIndex += 1
      if (chunkIndex % 3 == 0) {
        NrmMemoryGuard.trimBetweenInferenceSteps(context, "whisperx-align")
      }
    }
    return allFrames.toTypedArray()
  }

  private fun inferLogProbsEphemeral(
      context: Context,
      modelFile: File,
      audio: FloatArray,
      chunkSamples: Int,
      chunkOverlapSamples: Int = 0,
  ): Array<FloatArray> {
    NrmMemoryGuard.trimBetweenInferenceSteps(context, "whisperx-align")
    if (!NrmMemoryGuard.waitForChunkMemory(context, "whisperx-align")) {
      throw IllegalStateException("low_memory_before_onnx")
    }
    val session = env.createSession(modelFile.absolutePath, buildSessionOptions(NrmMemoryGuard.availMemMb(context)))
    try {
      return inferLogProbsForAudio(context, session, audio, chunkSamples, chunkOverlapSamples)
    } finally {
      try {
        session.close()
      } catch (_: Exception) {
        // ignore
      }
      NrmMemoryGuard.trimBetweenInferenceSteps(context, "whisperx-align", force = true)
    }
  }

  private fun inferLogProbsChunk(
      session: OrtSession,
      audio: FloatArray,
      chunkLimit: Int,
      offsetSamples: Int,
  ): Array<FloatArray> {
    if (audio.size > chunkLimit) {
      throw IllegalStateException("chunk_too_large samples=${audio.size} limit=$chunkLimit")
    }
    val inputName = session.inputNames.first()
    val shape = longArrayOf(1, audio.size.toLong())
    try {
      OnnxTensor.createTensor(env, FloatBuffer.wrap(audio), shape).use { inputTensor ->
        session.run(mapOf(inputName to inputTensor)).use { result ->
          val value = result[0].value
          val logits3d =
              when (value) {
                is Array<*> -> value as Array<Array<FloatArray>>
                else -> throw IllegalStateException("unexpected_onnx_output")
              }
          val logits = logits3d[0]
          return logits.map { frame -> logSoftmax(frame) }.toTypedArray()
        }
      }
    } catch (t: Throwable) {
      NrmFileLogger.error(
          "whisperx-align",
          "onnx_infer_fail offsetSamples=$offsetSamples chunkSamples=${audio.size}",
          t,
      )
      throw IllegalStateException("onnx_infer_failed: ${t.message ?: t.javaClass.simpleName}", t)
    }
  }
  private fun logSoftmax(logits: FloatArray): FloatArray {
    var maxLogit = logits[0]
    for (i in 1 until logits.size) {
      maxLogit = max(maxLogit, logits[i])
    }
    var sum = 0.0
    val exp = DoubleArray(logits.size)
    for (i in logits.indices) {
      exp[i] = kotlin.math.exp((logits[i] - maxLogit).toDouble())
      sum += exp[i]
    }
    val logSum = ln(sum)
    return FloatArray(logits.size) { i -> ((logits[i] - maxLogit).toDouble() - logSum).toFloat() }
  }
  private fun forcedAlignTokenStarts(
      logProbs: Array<FloatArray>,
      tokens: IntArray,
      blankId: Int,
      trellisLimit: Long,
  ): IntArray {
    val labels = mutableListOf<Int>()
    labels.add(blankId)
    for (t in tokens) {
      labels.add(t)
      labels.add(blankId)
    }
    val T = logProbs.size
    val S = labels.size
    if (T <= 0 || S <= 0) {
      throw IllegalStateException("empty_trellis T=$T S=$S")
    }
    val cells = T.toLong() * S.toLong()
    if (cells > trellisLimit) {
      throw IllegalStateException("trellis_too_large T=$T S=$S cells=$cells")
    }
    val negInf = -1e20f
    val dp = Array(T) { FloatArray(S) { negInf } }
    val back = Array(T) { IntArray(S) { -1 } }
    dp[0][0] = logProbs[0][labels[0]]
    if (S > 1) dp[0][1] = logProbs[0][labels[1]]
    for (t in 1 until T) {
      for (s in 0 until S) {
        val label = labels[s]
        val emit = logProbs[t][label]
        var best = negInf
        var from = s
        val stay = dp[t - 1][s] + emit
        if (stay > best) {
          best = stay
          from = s
        }
        if (s >= 1) {
          val prev = dp[t - 1][s - 1] + emit
          if (prev > best) {
            best = prev
            from = s - 1
          }
        }
        if (s >= 2 && labels[s] != blankId && labels[s - 1] != blankId) {
          val skip = dp[t - 1][s - 2] + emit
          if (skip > best) {
            best = skip
            from = s - 2
          }
        }
        dp[t][s] = best
        back[t][s] = from
      }
    }
    var s = if (dp[T - 1][S - 1] >= dp[T - 1][S - 2]) S - 1 else S - 2
    val stateAtFrame = IntArray(T)
    for (t in T - 1 downTo 0) {
      stateAtFrame[t] = s
      val prev = back[t][s]
      s = if (prev >= 0) prev else 0
    }
    val tokenStarts = IntArray(tokens.size) { T - 1 }
    for (t in 0 until T) {
      val st = stateAtFrame[t]
      if (st % 2 == 1) {
        val labelPos = st / 2
        if (labelPos in tokens.indices) {
          tokenStarts[labelPos] = min(tokenStarts[labelPos], t)
        }
      }
    }
    for (i in 1 until tokenStarts.size) {
      if (tokenStarts[i] < tokenStarts[i - 1]) {
        tokenStarts[i] = tokenStarts[i - 1]
      }
    }
    return tokenStarts
  }
  private fun formatLrcTimestamp(startMs: Int): String {
    val totalCs = max(0, startMs / 10)
    val cs = totalCs % 100
    val totalSec = totalCs / 100
    val sec = totalSec % 60
    val min = (totalSec / 60) % 60
    val hour = totalSec / 3600
    val mm = String.format(Locale.US, "%02d", min + hour * 60)
    val ss = String.format(Locale.US, "%02d", sec)
    val cc = String.format(Locale.US, "%02d", cs)
    return "[$mm:$ss.$cc]"
  }
}
