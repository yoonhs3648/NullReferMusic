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
import kotlin.math.abs
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
  /** trellis 추정 여유 (레거시 — 실제 분할은 options.trellisPlanMargin 사용) */
  private const val TRELLIS_PLAN_MARGIN = 0.85
  /** wav2vec2 CNN stride ≈ 320 samples/frame @16kHz */
  private const val FRAME_STRIDE_SAMPLES = 320
  private const val VOCAL_FRAME_SIZE = 512
  private const val VOCAL_FRAME_HOP = 160
  /** 인트로(연주)와 첫 가사 사이 최소 간격 — CTC가 0초에 붙는 것 방지 */
  private const val MIN_INTRO_MS = 800
  /** first_line_bump 최대 이동 — 초과 시 CTC 결과 유지 (onset 오탐 방지) */
  private const val MAX_INTRO_BUMP_MS = 15_000
  /** 2패스 경계 gap 보정 최소 초과 (ms) */
  private const val BOUNDARY_CLOSE_MIN_GAP_MS = 3_000
  /** onset 프로브: 보컬 구간 대비·절대 상한 (ms) */
  private const val ONSET_PROBE_MAX_MS = 60_000
  private const val ONSET_PROBE_VOCAL_FRACTION = 0.35
  private const val ONSET_SUSTAIN_FRAMES = 10
  /** Line/Silence Anchor — 시간 기반 재앵커링 (ms) */
  private const val ANCHOR_TIME_MS = 25_000L
  /** Silence Anchor — 최소 무음 길이 (ms) */
  private const val SILENCE_GAP_MIN_MS = 800L
  /** Confidence: trigger realign only when quite low (로그상 0.35면 너무 많은 재정렬) */
  private const val LINE_CONF_LOW = 0.15f
  /** After one realign, accept even if still below this (재시도 금지) */
  private const val LINE_CONF_ACCEPT = 0.10f
  private const val LOCAL_REALIGN_WINDOW_MS = 4_000
  /** Per segment: max lines to local-realign (was 8 — LMKD/CPU 폭주 원인) */
  private const val MAX_LOCAL_REALIGN_PER_SEGMENT = 2
  /** Low-confidence line ratio above this → skip remaining realigns for segment */
  private const val LOW_CONF_RATIO_ABORT = 0.45f
  /** Adaptive blank bias (log-prob) */
  private const val BLANK_BIAS_EARLY = 0.12f
  private const val BLANK_BIAS_LATE = -0.10f
  private const val BLANK_BIAS_CLAMP = 0.15f
  /** Adaptive overlap samples @16kHz — max ~300ms (was 6400≈400ms) */
  private const val OVERLAP_MIN_SAMPLES = 1_500
  private const val OVERLAP_MAX_SAMPLES = 4_800
  /** Chunk shrink when confidence very low */
  private const val CONF_CHUNK_SHRINK = 0.15f
  /** Chunk input pool (reuse FloatArray across ONNX chunks) */
  private val chunkAudioPool = ThreadLocal<FloatArray?>()
  /** Service/큐 수명 동안 재사용하는 ONNX Session (곡마다 create/close 금지) */
  private val sessionLock = Any()
  @Volatile private var sharedSession: OrtSession? = null
  @Volatile private var sharedModelPath: String? = null

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
    synchronized(sessionLock) {
      try {
        sharedSession?.close()
      } catch (_: Exception) {
        // ignore
      }
      sharedSession = null
      sharedModelPath = null
      NrmFileLogger.log("whisperx-align", "ctc_fa_onnx_session released")
      NrmNativeMemoryProbe.log("whisperx-align", "session_released")
    }
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
    val blankId = resolveBlankId(vocab)
    val vocalStartSample = msToSample(vocal.startMs, totalSamples)
    val vocalEndSample = msToSample(vocal.endMs, totalSamples).coerceAtLeast(vocalStartSample + 1)
    val vocalSamples = vocalEndSample - vocalStartSample
    val vocalFrames = estimateFrameCount(vocalSamples)
    var segments =
        planLyricSegments(
            melonLines,
            vocab,
            blankId,
            vocalFrames,
            context,
            options,
            pcm,
            vocalStartSample,
            vocalEndSample,
        )
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_plan segments=${segments.size} vocalMs=${vocal.startMs}-${vocal.endMs} frames=$vocalFrames lines=${melonLines.size}",
    )
    val session = obtainOrCreateSession(context, modelFile)
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
          val lw = combinedGroupWeight(left, options.vocabKind())
          val rw = combinedGroupWeight(right, options.vocabKind())
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
      // shared session — ForcedAlignWorkQueue idle 시에만 releaseOnnxSession()
      NrmMemoryGuard.trimBetweenInferenceSteps(context, "whisperx-align")
    }
  }

  private fun obtainOrCreateSession(context: Context, modelFile: File): OrtSession {
    val path = modelFile.absolutePath
    synchronized(sessionLock) {
      val existing = sharedSession
      if (existing != null && sharedModelPath == path) {
        NrmFileLogger.log("whisperx-align", "ctc_fa_onnx_session reuse path=${modelFile.name}")
        return existing
      }
      try {
        existing?.close()
      } catch (_: Exception) {
        // ignore
      }
      sharedSession = null
      sharedModelPath = null
      val created =
          OrtSession.SessionOptions().let { raw ->
            // SessionOptions는 createSession 이후 반드시 close — native leak 방지
            configureSessionOptions(raw, context, NrmMemoryGuard.availMemMb(context))
            try {
              env.createSession(path, raw)
            } finally {
              try {
                raw.close()
              } catch (_: Exception) {
                // ignore
              }
            }
          }
      sharedSession = created
      sharedModelPath = path
      NrmNativeMemoryProbe.log("whisperx-align", "session_create")
      NrmFileLogger.log("whisperx-align", "ctc_fa_onnx_session create path=${modelFile.name}")
      return created
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
      val pct = ((idx + 1) * 100) / segments.size.coerceAtLeast(1)
      NrmForegroundNotificationBinder.onLyricsProgressShown(
          "가사 생성 중",
          "Forced Alignment · 세그먼트 ${idx + 1}/${segments.size} ($pct%)",
      )
      NrmBackgroundWorkService.refreshNotification(context)
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
                applyFirstLineIntroCorrection =
                    idx == 0 &&
                        segment.weightStart < 0.02 &&
                        options.firstLineIntroCorrection,
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
              val lw = combinedGroupWeight(left, options.vocabKind())
              val rw = combinedGroupWeight(right, options.vocabKind())
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
        var segLrc =
            stretchLrcTimestampsToVocalEnd(
                part.lrc,
                VocalRange(startMs, endMs),
                durationMs,
                segmentScoped = true,
            )
        if (idx > 0) {
          val prevLastMs = lastTimestampMsInLrc(sb.toString())
          if (prevLastMs >= 0) {
            segLrc =
                closeSegmentBoundaryGap(
                    segLrc,
                    prevLastMs,
                    segmentStartMs = startMs,
                    options.vocabKind(),
                )
          }
        }
        sb.append(segLrc).append('\n')
        aligned += part.alignedLines
      }
      totalLines += segment.lines.size
      NrmFileLogger.log(
          "whisperx-align",
          "ctc_fa_segment idx=$idx lines=${segment.lines.size} startMs=$startMs endMs=$endMs samples=${segAudio.size}",
      )
      NrmNativeMemoryProbe.log("whisperx-align", "segment_$idx")
      NrmMemoryGuard.trimBetweenInferenceSteps(context, "whisperx-align")
    }
    val stitched = sb.toString().trim()
    val finalLrc =
        if (segments.size > 1) {
          NrmFileLogger.log(
              "whisperx-align",
              "ctc_fa_stitch segments=${segments.size} globalStretch=true vocalMs=${vocal.startMs}-${vocal.endMs}",
          )
          stretchLrcTimestampsToVocalEnd(stitched, vocal, durationMs, segmentScoped = false)
        } else {
          stretchLrcTimestampsToVocalEnd(stitched, vocal, durationMs)
        }
    return AlignResult(
        lrc = finalLrc,
        alignedLines = aligned,
        totalLines = totalLines,
    )
  }
  /** trellis 한도 — accurate도 12e6 상한 (18e6는 거의 미사용·메모리만 소모) */
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
            avail >= 1_800 -> MAX_TRELLIS_CELLS_HIGH
            avail >= 1_400 -> 10_000_000L
            else -> MAX_TRELLIS_CELLS
          }
    }
  }

  /**
   * Silence + Time Anchor로 먼저 분할한 뒤, trellis cell 한도로 재귀 분할.
   * 고RAM에서도 25초/무음마다 새 trellis → 후반 누적 drift 완화.
   */
  private fun planLyricSegments(
      lines: List<String>,
      vocab: Vocab,
      blankId: Int,
      frameCount: Int,
      context: Context,
      options: MelonSyncAlignOptions,
      pcm: ShortArray,
      vocalStartSample: Int,
      vocalEndSample: Int,
  ): List<PlannedSegment> {
    val limit = maxTrellisCells(context, options)
    val anchored =
        planByAnchors(
            lines,
            options,
            pcm,
            vocalStartSample,
            vocalEndSample.coerceAtLeast(vocalStartSample + 1),
        )
    val out = ArrayList<PlannedSegment>()
    for (seg in anchored) {
      val segFrames =
          max(1, (frameCount * (seg.weightEnd - seg.weightStart)).toInt().coerceAtLeast(1))
      out.addAll(
          planRecursive(
              seg.lines,
              seg.weightStart,
              seg.weightEnd,
              segFrames,
              vocab,
              blankId,
              limit,
              options,
          ),
      )
    }
    return out
  }

  /** 무음 갭·시간(25s) 앵커 → 줄 경계에 스냅한 PlannedSegment 목록 */
  private fun planByAnchors(
      lines: List<String>,
      options: MelonSyncAlignOptions,
      pcm: ShortArray,
      vocalStartSample: Int,
      vocalEndSample: Int,
  ): List<PlannedSegment> {
    if (lines.isEmpty()) return emptyList()
    if (lines.size == 1) return listOf(PlannedSegment(lines, 0.0, 1.0))
    val vocalSamples = (vocalEndSample - vocalStartSample).coerceAtLeast(1)
    val vocalMs = (vocalSamples.toLong() * 1000L) / SAMPLE_RATE
    val weights = lineCharWeights(lines, options.vocabKind())
    val totalW = weights.sum().coerceAtLeast(1).toDouble()
    val cumW = DoubleArray(lines.size + 1)
    for (i in lines.indices) {
      cumW[i + 1] = cumW[i] + weights[i] / totalW
    }

    val splitWeights = sortedSetOf<Double>()
    var silenceSplits = 0
    var timeSplits = 0

    // Silence anchors
    val silenceMids = findSilenceGapMidsMs(pcm, vocalStartSample, vocalEndSample)
    for (midMs in silenceMids) {
      val w = (midMs.toDouble() / vocalMs.toDouble()).coerceIn(0.05, 0.95)
      // 너무 가장자리(초반/후반 5%) 제외
      if (w in 0.08..0.92) {
        splitWeights.add(w)
        silenceSplits += 1
      }
    }

    // Time anchors every ~25s
    var t = ANCHOR_TIME_MS
    while (t < vocalMs - ANCHOR_TIME_MS / 2) {
      val w = (t.toDouble() / vocalMs.toDouble()).coerceIn(0.05, 0.95)
      if (w in 0.08..0.92) {
        val before = splitWeights.size
        splitWeights.add(w)
        if (splitWeights.size > before) timeSplits += 1
      }
      t += ANCHOR_TIME_MS
    }

    // Snap to line boundaries (avoid splitting mid-line): pick nearest cumW index
    val lineSplitIdx = linkedSetOf<Int>()
    for (w in splitWeights) {
      var bestI = 1
      var bestD = Double.MAX_VALUE
      for (i in 1 until lines.size) {
        val d = abs(cumW[i] - w)
        if (d < bestD) {
          bestD = d
          bestI = i
        }
      }
      // 최소 2줄씩 유지
      if (bestI in 1 until lines.size) lineSplitIdx.add(bestI)
    }

    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_plan anchors=${lineSplitIdx.size + 1} silenceSplits=$silenceSplits timeSplits=$timeSplits vocalMs=$vocalMs lines=${lines.size}",
    )

    if (lineSplitIdx.isEmpty()) {
      return listOf(PlannedSegment(lines, 0.0, 1.0))
    }

    val cuts = (listOf(0) + lineSplitIdx.sorted() + listOf(lines.size)).distinct().sorted()
    val segs = ArrayList<PlannedSegment>()
    for (c in 0 until cuts.size - 1) {
      val a = cuts[c]
      val b = cuts[c + 1]
      if (b <= a) continue
      segs.add(PlannedSegment(lines.subList(a, b), cumW[a], cumW[b]))
    }
    return if (segs.isEmpty()) listOf(PlannedSegment(lines, 0.0, 1.0)) else segs
  }

  /** 보컬 구간 내 무음 갭 중심 (보컬 상대 ms) */
  private fun findSilenceGapMidsMs(
      pcm: ShortArray,
      vocalStartSample: Int,
      vocalEndSample: Int,
  ): List<Long> {
    if (pcm.isEmpty() || vocalEndSample <= vocalStartSample + SAMPLE_RATE) return emptyList()
    val start = vocalStartSample.coerceIn(0, pcm.size)
    val end = vocalEndSample.coerceIn(start, pcm.size)
    if (end - start < SAMPLE_RATE) return emptyList()
    val energies = computeFrameLogEnergies(pcm.copyOfRange(start, end))
    if (energies.size < 16) return emptyList()
    val sorted = energies.copyOf().apply { sort() }
    val median = sorted[sorted.size / 2]
    val silenceThresh = median - 0.8f
    val minSilentFrames =
        ((SILENCE_GAP_MIN_MS * SAMPLE_RATE) / (VOCAL_FRAME_HOP * 1000L)).toInt().coerceAtLeast(4)
    val mids = ArrayList<Long>()
    var runStart = -1
    for (f in energies.indices) {
      val silent = energies[f] < silenceThresh
      if (silent) {
        if (runStart < 0) runStart = f
      } else if (runStart >= 0) {
        val len = f - runStart
        if (len >= minSilentFrames) {
          val midFrame = runStart + len / 2
          val midMs = (midFrame.toLong() * VOCAL_FRAME_HOP * 1000L) / SAMPLE_RATE
          mids.add(midMs)
        }
        runStart = -1
      }
    }
    if (runStart >= 0) {
      val len = energies.size - runStart
      if (len >= minSilentFrames) {
        val midFrame = runStart + len / 2
        mids.add((midFrame.toLong() * VOCAL_FRAME_HOP * 1000L) / SAMPLE_RATE)
      }
    }
    return mids
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
    val leftWeight = combinedGroupWeight(left, options.vocabKind())
    val rightWeight = combinedGroupWeight(right, options.vocabKind())
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
        val lookbackStart = max(0, f - lookbackFrames)
        for (k in lookbackStart until f) {
          introSum += energies[k]
        }
        val introAvg = introSum / (f - lookbackStart)
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
      audioDurationMs: Long,
      options: MelonSyncAlignOptions,
  ): Int {
    if (lineCharStarts.isEmpty() || tokens.isEmpty() || logProbs.isEmpty() || frameMs <= 0.0) {
      return -1
    }
    try {
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
      val searchWindowMs =
          min(
                  (audioDurationMs.coerceAtLeast(1L) * ONSET_PROBE_VOCAL_FRACTION).toLong(),
                  ONSET_PROBE_MAX_MS.toLong(),
              )
              .coerceAtLeast(options.minIntroMs().toLong())
      val searchEndFrame =
          min(
              logProbs.size,
              max(1, (searchWindowMs / frameMs).toInt()),
          )
      val scores = FloatArray(searchEndFrame)
      var bestScore = Float.NEGATIVE_INFINITY
      for (t in 0 until searchEndFrame) {
        var maxTok = Float.NEGATIVE_INFINITY
        for (vid in probeTokens) {
          if (vid in logProbs[t].indices) {
            maxTok = max(maxTok, logProbs[t][vid])
          }
        }
        val blank = if (blankId in logProbs[t].indices) logProbs[t][blankId] else 0f
        scores[t] = maxTok - blank
        if (scores[t] > bestScore) bestScore = scores[t]
      }
      if (bestScore <= Float.NEGATIVE_INFINITY + 1f) return -1
      val threshold = bestScore - options.onsetProbeThreshold()
      for (t in 0 until searchEndFrame) {
        if (scores[t] >= threshold) {
          return max(options.minIntroMs(), (t * frameMs).toInt())
        }
      }
      return -1
    } catch (_: Throwable) {
      return -1
    }
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
      applyFirstLineIntroCorrection: Boolean = options.firstLineIntroCorrection,
      allowLocalRealign: Boolean = true,
  ): AlignResult {
    if (audio.isEmpty() || melonLines.isEmpty()) {
      return AlignResult(lrc = "", alignedLines = 0, totalLines = melonLines.size)
    }
    val vocabKind = options.vocabKind()
    val vocab = cachedVocab ?: loadVocab(File(alignDir, "vocab.json"))
    val blankId = resolveBlankId(vocab)
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
    val estimatedFrames = estimateFrameCount(audio.size)
    val estimatedTrellisCells = estimatedFrames.toLong() * (tokens.size * 2L + 1L)
    if (estimatedTrellisCells > trellisLimit) {
      throw IllegalStateException("trellis_too_large cells=$estimatedTrellisCells")
    }
    val (adaptedChunk, adaptedOverlap) =
        adaptChunkAndOverlap(
            audio,
            chunkSamples,
            melonLines,
            options,
            shrinkForLowConf = !allowLocalRealign,
        )
    val logProbs =
        inferLogProbsForAudio(
            context,
            session,
            audio,
            adaptedChunk,
            adaptedOverlap,
        )
    if (logProbs.isEmpty()) {
      throw IllegalStateException("empty_logits")
    }
    val frameMs =
        if (logProbs.isEmpty()) 0.0
        else {
          val actualDurationMs = audio.size.toDouble() * 1000.0 / SAMPLE_RATE.toDouble()
          actualDurationMs / logProbs.size.toDouble()
        }
    val trellisCells = logProbs.size.toLong() * (tokens.size * 2L + 1L)
    if (trellisCells > trellisLimit) {
      throw IllegalStateException("trellis_too_large cells=$trellisCells")
    }
    val charToToken = charToTokenIndex.charToToken
    val frameEnergies = frameLogEnergiesFromAudio(audio, logProbs.size)
    val tokenStartFrames =
        forcedAlignTokenStarts(logProbs, tokens, blankId, trellisLimit, frameEnergies)
    val firstLineOnsetMs =
        if (applyFirstLineIntroCorrection && options.firstLineIntroCorrection) {
          estimateFirstLineOnsetMs(
              logProbs,
              tokens,
              charToToken,
              lineCharStarts,
              blankId,
              frameMs,
              audioDurationMs,
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
    if (melonLines.isNotEmpty() && applyFirstLineIntroCorrection && options.firstLineIntroCorrection && firstLineOnsetMs >= 0) {
      val minFirst = timeOffsetMs + firstLineOnsetMs
      if (rawMs[0] < minFirst) {
        val delta = minFirst - rawMs[0]
        val msFromSegmentStart = rawMs[0] - timeOffsetMs
        if (delta > MAX_INTRO_BUMP_MS) {
          NrmFileLogger.log(
              "whisperx-align",
              "ctc_fa_first_line_bump_skip delta=$delta max=$MAX_INTRO_BUMP_MS raw=${rawMs[0]} minFirst=$minFirst",
          )
        } else {
          val adjusted =
              when {
                msFromSegmentStart < 6_000 && delta > 10_000 ->
                    (timeOffsetMs + options.minIntroMs()).coerceAtLeast(rawMs[0])
                delta > 12_000 -> rawMs[0] + (delta * 2) / 3
                else -> minFirst
              }
          if (adjusted != rawMs[0]) {
            NrmFileLogger.log(
                "whisperx-align",
                "ctc_fa_first_line_bump before=${rawMs[0]} after=$adjusted delta=$delta fromSegStart=$msFromSegmentStart",
            )
            rawMs[0] = adjusted
          }
        }
      }
    }
    spreadCollapsedLineTimestamps(
        rawMs,
        melonLines,
        lineCharStarts,
        charToToken,
        tokenStartFrames,
        frameMs,
        timeOffsetMs,
        options.vocabKind(),
    )
    enforceMonotonicAdaptive(rawMs, melonLines, options.vocabKind())
    val lineConf =
        estimateLineConfidences(
            logProbs,
            tokens,
            blankId,
            tokenStartFrames,
            lineCharStarts,
            charToToken,
            melonLines.size,
        )
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_line_conf avg=${"%.3f".format(Locale.US, lineConf.average())} low=${lineConf.count { it < LINE_CONF_LOW }}/${lineConf.size}",
    )
    if (allowLocalRealign) {
      applyLocalRealignIfNeeded(
          context,
          alignDir,
          modelFile,
          audio,
          melonLines,
          rawMs,
          lineConf,
          audioDurationMs,
          timeOffsetMs,
          adaptedChunk,
          session,
          vocab,
          options,
      )
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

  /** 보컬 밀도(상위 에너지 프레임 비율)로 chunk/overlap 보정 */
  private fun adaptChunkAndOverlap(
      audio: FloatArray,
      baseChunkSamples: Int,
      lines: List<String>,
      options: MelonSyncAlignOptions,
      shrinkForLowConf: Boolean = false,
  ): Pair<Int, Int> {
    val density = vocalDensity(audio)
    val chunkScale =
        when {
          shrinkForLowConf -> 0.50f
          density < 0.22f -> 1.20f
          density > 0.55f -> 0.72f
          density > 0.40f -> 0.88f
          else -> 1.0f
        }
    val adaptedChunk =
        (baseChunkSamples * chunkScale)
            .toInt()
            .coerceIn(SAMPLE_RATE * 2, max(baseChunkSamples, SAMPLE_RATE * 20))
    val qualityOverlap = options.chunkOverlapSamples()
    val shortLineRatio =
        if (lines.isEmpty()) 0f
        else {
          val short =
              lines.count { it.trim().length in 1..12 }.toFloat() / lines.size.toFloat()
          short
        }
    val densityOverlap =
        when {
          density > 0.55f || shortLineRatio > 0.45f -> OVERLAP_MAX_SAMPLES
          density < 0.22f -> OVERLAP_MIN_SAMPLES
          else -> (OVERLAP_MIN_SAMPLES + OVERLAP_MAX_SAMPLES) / 2
        }
    val adaptedOverlap =
        when {
          qualityOverlap <= 0 ->
              densityOverlap.coerceIn(OVERLAP_MIN_SAMPLES, (OVERLAP_MIN_SAMPLES + OVERLAP_MAX_SAMPLES) / 2)
          else ->
              ((qualityOverlap * 0.35f) + (densityOverlap * 0.65f))
                  .toInt()
                  .coerceIn(OVERLAP_MIN_SAMPLES, OVERLAP_MAX_SAMPLES)
        }
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_chunk_adapt density=${"%.3f".format(Locale.US, density)} chunk=$adaptedChunk overlap=$adaptedOverlap shortLine=${"%.2f".format(Locale.US, shortLineRatio)} shrinkLowConf=$shrinkForLowConf",
    )
    return adaptedChunk to adaptedOverlap
  }

  private fun vocalDensity(audio: FloatArray): Float {
    if (audio.size < FRAME_STRIDE_SAMPLES * 8) return 0.35f
    val frames = max(1, audio.size / FRAME_STRIDE_SAMPLES)
    val energies = FloatArray(frames)
    for (t in 0 until frames) {
      val start = t * FRAME_STRIDE_SAMPLES
      val end = min(audio.size, start + FRAME_STRIDE_SAMPLES)
      var sum = 0.0
      for (i in start until end) {
        val v = audio[i].toDouble()
        sum += v * v
      }
      energies[t] = ln((sum / (end - start).coerceAtLeast(1)) + 1e-12).toFloat()
    }
    val sorted = energies.copyOf().apply { sort() }
    val median = sorted[sorted.size / 2]
    val thresh = median + 0.35f
    var hot = 0
    for (e in energies) if (e >= thresh) hot++
    return hot.toFloat() / frames.toFloat()
  }

  private fun frameLogEnergiesFromAudio(audio: FloatArray, frameCount: Int): FloatArray {
    if (frameCount <= 0) return FloatArray(0)
    val out = FloatArray(frameCount)
    for (t in 0 until frameCount) {
      val start = (t.toLong() * FRAME_STRIDE_SAMPLES).toInt().coerceIn(0, audio.size)
      val end = min(audio.size, start + FRAME_STRIDE_SAMPLES)
      if (end <= start) {
        out[t] = -10f
        continue
      }
      var sum = 0.0
      for (i in start until end) {
        val v = audio[i].toDouble()
        sum += v * v
      }
      out[t] = ln((sum / (end - start)) + 1e-12).toFloat()
    }
    return out
  }

  private fun estimateLineConfidences(
      logProbs: Array<FloatArray>,
      tokens: IntArray,
      blankId: Int,
      tokenStartFrames: IntArray,
      lineCharStarts: IntArray,
      charToToken: IntArray,
      lineCount: Int,
  ): FloatArray {
    val conf = FloatArray(lineCount) { 0.5f }
    if (logProbs.isEmpty() || tokens.isEmpty() || lineCount <= 0) return conf
    for (i in 0 until lineCount) {
      val c0 = lineCharStarts[i].coerceIn(0, charToToken.size)
      val c1 =
          if (i + 1 < lineCount) lineCharStarts[i + 1].coerceIn(0, charToToken.size)
          else charToToken.size
      val t0 =
          if (c0 in charToToken.indices) charToToken[c0]
          else 0
      val t1 =
          if (c1 > c0 && (c1 - 1) in charToToken.indices) charToToken[c1 - 1]
          else t0
      var sum = 0.0
      var n = 0
      for (ti in t0..t1.coerceAtMost(tokens.lastIndex)) {
        val frame = tokenStartFrames.getOrElse(ti) { 0 }.coerceIn(0, logProbs.lastIndex)
        val tok = tokens[ti]
        val frameLp = logProbs[frame]
        if (tok in frameLp.indices && blankId in frameLp.indices) {
          sum += (frameLp[tok] - frameLp[blankId]).toDouble()
          n++
        }
      }
      val avg = if (n > 0) (sum / n).toFloat() else 0f
      conf[i] = (1.0 / (1.0 + kotlin.math.exp(-avg.toDouble()))).toFloat()
    }
    return conf
  }

  private fun applyLocalRealignIfNeeded(
      context: Context,
      alignDir: File,
      modelFile: File,
      audio: FloatArray,
      melonLines: List<String>,
      rawMs: IntArray,
      confidences: FloatArray,
      audioDurationMs: Long,
      timeOffsetMs: Int,
      chunkSamples: Int,
      session: OrtSession,
      vocab: Vocab,
      options: MelonSyncAlignOptions,
  ) {
    if (confidences.isEmpty()) return
    val lowCount = confidences.count { it < LINE_CONF_LOW }
    val lowRatio = lowCount.toFloat() / confidences.size.toFloat()
    // 줄당 최대 1회, 세그먼트당 상한. 저신뢰 비율이 높으면 조기 중단.
    val maxRealign =
        when {
          lowRatio >= LOW_CONF_RATIO_ABORT -> 1
          else -> min(MAX_LOCAL_REALIGN_PER_SEGMENT, melonLines.size)
        }
    if (lowRatio >= LOW_CONF_RATIO_ABORT) {
      NrmFileLogger.log(
          "whisperx-align",
          "ctc_fa_realign_abort reason=low_conf_ratio ratio=${"%.2f".format(Locale.US, lowRatio)} low=$lowCount/${confidences.size} maxRealign=$maxRealign",
      )
    }
    // 가장 낮은 confidence 줄부터 (폭주 방지)
    val candidates =
        confidences.indices
            .filter { confidences[it] < LINE_CONF_LOW }
            .sortedBy { confidences[it] }
    var done = 0
    val visited = HashSet<Int>()
    for (i in candidates) {
      if (done >= maxRealign) break
      if (!visited.add(i)) continue
      val centerRel = (rawMs[i] - timeOffsetMs).coerceIn(0, audioDurationMs.toInt())
      val winStartMs = max(0, centerRel - LOCAL_REALIGN_WINDOW_MS)
      val winEndMs = min(audioDurationMs.toInt(), centerRel + LOCAL_REALIGN_WINDOW_MS)
      if (winEndMs - winStartMs < 800) continue
      val from = max(0, i - 1)
      val to = min(melonLines.lastIndex, i + 1)
      // 인접 줄도 visit 처리 — 같은 윈도우 재추론 중복 방지
      for (j in from..to) visited.add(j)
      val subLines = melonLines.subList(from, to + 1)
      val s0 = ((winStartMs.toLong() * SAMPLE_RATE) / 1000L).toInt().coerceIn(0, audio.size)
      val s1 =
          ((winEndMs.toLong() * SAMPLE_RATE) / 1000L).toInt().coerceIn(s0 + SAMPLE_RATE / 4, audio.size)
      val subAudio = audio.copyOfRange(s0, s1)
      val subDur = ((s1 - s0).toLong() * 1000L) / SAMPLE_RATE
      val before = rawMs[i]
      val shrinkChunk =
          if (confidences[i] < CONF_CHUNK_SHRINK) {
            (chunkSamples / 2).coerceAtLeast(SAMPLE_RATE * 2)
          } else {
            chunkSamples
          }
      try {
        val local =
            alignAudioToLines(
                context,
                alignDir,
                modelFile,
                subAudio,
                subLines,
                subDur,
                timeOffsetMs = timeOffsetMs + winStartMs,
                chunkSamples = shrinkChunk,
                session = session,
                cachedVocab = vocab,
                options = options,
                applyFirstLineIntroCorrection = false,
                allowLocalRealign = false, // 줄당 1회 — 재귀/연쇄 realign 금지
            )
        val parsed = parseLrcTimestampLines(local.lrc)
        if (parsed.size != subLines.size) {
          done += 1
          NrmFileLogger.log(
              "whisperx-align",
              "ctc_fa_local_realign_accept idx=$i before=$before after=$before conf=${"%.3f".format(Locale.US, confidences[i])} reason=parse_mismatch",
          )
          continue
        }
        val candidate = rawMs.copyOf()
        for (k in parsed.indices) {
          candidate[from + k] = parsed[k].ms
        }
        val after = candidate[i]
        val absWinStart = timeOffsetMs + winStartMs
        val absWinEnd = timeOffsetMs + winEndMs
        if (after in absWinStart..absWinEnd) {
          var monoOk = true
          for (j in 1 until candidate.size) {
            if (candidate[j] < candidate[j - 1]) {
              monoOk = false
              break
            }
          }
          if (monoOk) {
            for (k in from..to) {
              rawMs[k] = candidate[k]
            }
            enforceMonotonicAdaptive(rawMs, melonLines, options.vocabKind())
          }
        }
        // 1회 realign 후 confidence가 여전히 낮아도 재시도하지 않고 수용
        done += 1
        NrmFileLogger.log(
            "whisperx-align",
            "ctc_fa_local_realign idx=$i before=$before after=${rawMs[i]} conf=${"%.3f".format(Locale.US, confidences[i])} acceptBelow=${LINE_CONF_ACCEPT}",
        )
        NrmNativeMemoryProbe.log("whisperx-align", "after_realign_$i")
      } catch (t: Throwable) {
        done += 1
        NrmFileLogger.log(
            "whisperx-align",
            "ctc_fa_local_realign_skip idx=$i reason=${t.message ?: t.javaClass.simpleName}",
        )
      }
    }
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
  private fun resolveBlankId(vocab: Vocab): Int {
    return vocab.charToId["<pad>"]
        ?: vocab.charToId["[PAD]"]
        ?: vocab.charToId["|"]
        ?: 0
  }

  private fun normalizeLine(text: String, vocabKind: MelonSyncVocabKind): String {
    val trimmed = text.trim().replace(Regex("""\s+"""), " ")
    return when (vocabKind) {
      MelonSyncVocabKind.KO ->
          HangulJamo.decompose(trimmed.lowercase(Locale.ROOT)).replace(" ", "|")
      MelonSyncVocabKind.EN ->
          trimmed.uppercase(Locale.ROOT).replace(" ", "|")
      MelonSyncVocabKind.XLSR ->
          trimmed.lowercase(Locale.ROOT).replace(" ", "|")
    }
  }
  private fun lineCharWeights(lines: List<String>, vocabKind: MelonSyncVocabKind): IntArray {
    return IntArray(lines.size) { i -> normalizeLine(lines[i], vocabKind).length.coerceAtLeast(1) }
  }

  /** 2패스 분할 가중치: 줄 수 60% + 글자 수 40% */
  private fun combinedGroupWeight(lines: List<String>, vocabKind: MelonSyncVocabKind): Double {
    if (lines.isEmpty()) return 0.001
    val charWeights = lineCharWeights(lines, vocabKind)
    val n = lines.size
    val totalChars = charWeights.sum().coerceAtLeast(1)
    var sum = 0.0
    for (i in 0 until n) {
      sum += 0.6 * (1.0 / n) + 0.4 * (charWeights[i].toDouble() / totalChars)
    }
    return sum.coerceAtLeast(0.001)
  }

  private fun balancedSplitIndex(lines: List<String>, vocabKind: MelonSyncVocabKind): Int {
    val charWeights = lineCharWeights(lines, vocabKind)
    val n = lines.size
    if (n <= 1) return 1
    val totalChars = charWeights.sum().coerceAtLeast(1)
    val combined =
        DoubleArray(n) { i ->
          0.6 * (1.0 / n) + 0.4 * (charWeights[i].toDouble() / totalChars)
        }
    val half = combined.sum() / 2.0
    var cum = 0.0
    for (i in 0 until lines.lastIndex) {
      cum += combined[i]
      if (cum >= half) return i + 1
    }
    return max(1, n / 2)
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
  private fun configureSessionOptions(
      opts: OrtSession.SessionOptions,
      context: Context,
      availMb: Long,
  ) {
    val threads = NrmThermalGuard.onnxIntraOpThreads(context, availMb)
    opts.setIntraOpNumThreads(threads)
    opts.setInterOpNumThreads(1)
    opts.setMemoryPatternOptimization(true)
    val thermal = NrmThermalGuard.thermalStatus(context)
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_onnx_opts threads=$threads availMb=$availMb cores=${Runtime.getRuntime().availableProcessors()} bigCores=${NrmThermalGuard.estimatedBigCoreCount()} thermal=${NrmThermalGuard.thermalLabel(thermal)} memPattern=true",
    )
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
      return inferLogProbsChunk(session, audio, audio.size, effectiveChunk, offsetSamples = 0)
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
      val pooled = obtainChunkAudioBuffer(chunkLen)
      System.arraycopy(audio, offset, pooled, 0, chunkLen)
      val chunkProbs =
          inferLogProbsChunk(session, pooled, chunkLen, liveChunk, offsetSamples = offset)
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
        if (chunkIndex == 0 || chunkIndex % 8 == 0 || end >= audio.size) {
          NrmNativeMemoryProbe.log("whisperx-align", "onnx_chunk_$chunkIndex")
        }
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

  private fun obtainChunkAudioBuffer(minLen: Int): FloatArray {
    val cached = chunkAudioPool.get()
    if (cached != null && cached.size >= minLen) return cached
    val grown = FloatArray(max(minLen, SAMPLE_RATE * 4))
    chunkAudioPool.set(grown)
    return grown
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
    val session = obtainOrCreateSession(context, modelFile)
    try {
      return inferLogProbsForAudio(context, session, audio, chunkSamples, chunkOverlapSamples)
    } finally {
      NrmMemoryGuard.trimBetweenInferenceSteps(context, "whisperx-align", force = true)
    }
  }

  private fun inferLogProbsChunk(
      session: OrtSession,
      audio: FloatArray,
      sampleCount: Int,
      chunkLimit: Int,
      offsetSamples: Int,
  ): Array<FloatArray> {
    val n = sampleCount.coerceIn(0, audio.size)
    if (n > chunkLimit) {
      throw IllegalStateException("chunk_too_large samples=$n limit=$chunkLimit")
    }
    val inputName = session.inputNames.first()
    val shape = longArrayOf(1, n.toLong())
    try {
      // FloatBuffer.wrap(heap) — allocateDirect 금지. Tensor/Result는 use로 반드시 close.
      // Result.close 전에 float 값을 Java 힙으로 완전 복사 (native view 참조 잔존 방지).
      OnnxTensor.createTensor(env, FloatBuffer.wrap(audio, 0, n), shape).use { inputTensor ->
        session.run(mapOf(inputName to inputTensor)).use { result ->
          val value = result[0].value
          @Suppress("UNCHECKED_CAST")
          val logits3d =
              when (value) {
                is Array<*> -> value as Array<Array<FloatArray>>
                else -> throw IllegalStateException("unexpected_onnx_output")
              }
          val logits = logits3d[0]
          val copied = Array(logits.size) { t -> logits[t].copyOf() }
          return Array(copied.size) { t -> logSoftmax(copied[t]) }
        }
      }
    } catch (t: Throwable) {
      NrmFileLogger.error(
          "whisperx-align",
          "onnx_infer_fail offsetSamples=$offsetSamples chunkSamples=$n",
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
      frameEnergies: FloatArray? = null,
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
    fun blankBias(t: Int): Float {
      val progress = t.toFloat() / max(1, T - 1).toFloat()
      val timeBias = BLANK_BIAS_EARLY * (1f - progress) + BLANK_BIAS_LATE * progress
      val e =
          if (frameEnergies != null && t in frameEnergies.indices) frameEnergies[t]
          else 0f
      val energyAdj =
          when {
            e < -1.2f -> 0.04f
            e > 0.8f -> -0.04f
            else -> 0f
          }
      return (timeBias + energyAdj).coerceIn(-BLANK_BIAS_CLAMP, BLANK_BIAS_CLAMP)
    }
    fun emitAt(t: Int, label: Int): Float {
      var emit = logProbs[t][label]
      if (label == blankId) emit += blankBias(t)
      return emit
    }
    dp[0][0] = emitAt(0, labels[0])
    if (S > 1) dp[0][1] = emitAt(0, labels[1])
    var biasEarlySum = 0.0
    var biasLateSum = 0.0
    var biasN = 0
    for (t in 1 until T) {
      val b = blankBias(t)
      if (t < T / 4) {
        biasEarlySum += b
        biasN += 1
      } else if (t >= (T * 3) / 4) {
        biasLateSum += b
      }
      for (s in 0 until S) {
        val label = labels[s]
        val emit = emitAt(t, label)
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
    val earlyAvg = if (biasN > 0) biasEarlySum / biasN else blankBias(0).toDouble()
    val lateN = max(1, T / 4)
    val lateAvg = biasLateSum / lateN
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_blank_adapt early=${"%.3f".format(Locale.US, earlyAvg)} late=${"%.3f".format(Locale.US, lateAvg)} T=$T",
    )
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

  /**
   * CTC가 동일 프레임에 여러 줄을 붙이면(특히 영어·인트로 직후) 한꺼번에 뭉친다.
   * 토큰 종료 프레임까지 글자 수 비율로 펼친다 — ONNX 추가 없음.
   */
  private fun spreadCollapsedLineTimestamps(
      rawMs: IntArray,
      lines: List<String>,
      lineCharStarts: IntArray,
      charToToken: IntArray,
      tokenStartFrames: IntArray,
      frameMs: Double,
      timeOffsetMs: Int,
      vocabKind: MelonSyncVocabKind,
  ) {
    if (lines.size < 2 || frameMs <= 0.0) return
    val collapseWindowMs =
        when (vocabKind) {
          MelonSyncVocabKind.KO -> 100
          MelonSyncVocabKind.EN, MelonSyncVocabKind.XLSR -> 120
        }
    var i = 0
    while (i < lines.size) {
      var j = i + 1
      while (j < lines.size && rawMs[j] - rawMs[i] < collapseWindowMs) j++
      if (j - i < 2) {
        i = j
        continue
      }
      val startMs = rawMs[i]
      val lastInRun = j - 1
      val lastChar = lineCharStarts[lastInRun].coerceIn(0, charToToken.size - 1)
      val lastTok = charToToken[lastChar].coerceAtLeast(0)
      var endFrame = tokenStartFrames.getOrElse(lastTok) { tokenStartFrames.lastOrNull() ?: 0 }
      if (j < lines.size) {
        val nextChar = lineCharStarts[j].coerceIn(0, charToToken.size - 1)
        val nextTok = charToToken[nextChar].coerceAtLeast(0)
        endFrame = max(endFrame, tokenStartFrames.getOrElse(nextTok) { endFrame })
      }
      var endMs = timeOffsetMs + (endFrame * frameMs).toInt()
      if (endMs <= startMs + collapseWindowMs) {
        endMs = startMs + collapseWindowMs * (j - i)
      }
      val weights = IntArray(j - i) { k ->
        normalizeLine(lines[i + k], vocabKind).length.coerceAtLeast(1)
      }
      val totalW = weights.sum().coerceAtLeast(1)
      var cum = 0
      for (k in 1 until j - i) {
        cum += weights[k]
        rawMs[i + k] = startMs + ((endMs - startMs) * cum / totalW)
      }
      NrmFileLogger.log(
          "whisperx-align",
          "ctc_fa_spread_run start=$i end=${j - 1} lines=${j - i} windowMs=${endMs - startMs}",
      )
      i = j
    }
  }

  private fun enforceMonotonicAdaptive(
      rawMs: IntArray,
      lines: List<String>,
      vocabKind: MelonSyncVocabKind,
  ) {
    for (i in 1 until rawMs.size) {
      val minGap = minGapForLine(lines[i], vocabKind)
      if (rawMs[i] < rawMs[i - 1] + minGap) {
        rawMs[i] = rawMs[i - 1] + minGap
      }
    }
  }

  private fun minGapForLine(line: String, vocabKind: MelonSyncVocabKind): Int {
    val chars = normalizeLine(line, vocabKind).length.coerceAtLeast(1)
    val perChar =
        when (vocabKind) {
          MelonSyncVocabKind.KO -> 35
          MelonSyncVocabKind.EN, MelonSyncVocabKind.XLSR -> 38
        }
    return max(52, min(480, chars * perChar))
  }

  /**
   * CTC는 후반으로 갈수록 프레임 누적 오차가 난다.
   * 첫 줄은 고정, 마지막 줄을 보컬(또는 세그먼트) 끝에 맞춰 선형 보정한다.
   */
  private fun stretchLrcTimestampsToVocalEnd(
      lrc: String,
      vocal: VocalRange,
      durationMs: Long,
      segmentScoped: Boolean = false,
  ): String {
    val parsed = parseLrcTimestampLines(lrc)
    if (parsed.size < 4) {
      logStretchSkip(
          segmentScoped,
          "too_few_lines",
          parsed.size,
          vocal,
          durationMs,
          drift = null,
          ratio = null,
          firstMs = parsed.firstOrNull()?.ms,
          lastMs = parsed.lastOrNull()?.ms,
          targetEnd = null,
      )
      return lrc
    }
    val firstMs = parsed.first().ms
    val lastMs = parsed.last().ms
    val span = (lastMs - firstMs).coerceAtLeast(1)
    val outroPadMs =
        when {
          segmentScoped -> 320L
          parsed.size >= 28 -> 2_600L
          else -> 1_600L
        }
    // 첫 줄이 이미 곡 끝 근처면 (firstMs+12s) > (duration-400) → coerceIn 예외.
    // stretch는 품질용 후처리이므로 불가능하면 원본 LRC 유지.
    val clampMin = (firstMs + 12_000).toLong()
    val clampMax = (durationMs - 400L).coerceAtLeast((firstMs + 1).toLong())
    if (clampMin > clampMax) {
      logStretchSkip(
          segmentScoped,
          "invalid_target_range",
          parsed.size,
          vocal,
          durationMs,
          drift = null,
          ratio = null,
          firstMs = firstMs,
          lastMs = lastMs,
          targetEnd = null,
      )
      return lrc
    }
    val targetEnd = (vocal.endMs - outroPadMs).coerceIn(clampMin, clampMax)
    val drift = targetEnd - lastMs
    if (abs(drift) < 900) {
      logStretchSkip(
          segmentScoped,
          "drift_below_threshold",
          parsed.size,
          vocal,
          durationMs,
          drift = drift,
          ratio = null,
          firstMs = firstMs,
          lastMs = lastMs,
          targetEnd = targetEnd,
      )
      return lrc
    }
    val rawRatio = (targetEnd - firstMs).toDouble() / span.toDouble()
    val ratio =
        when {
          rawRatio < 0.90 -> return lrc.also {
            logStretchSkip(
                segmentScoped,
                "ratio_out_of_range",
                parsed.size,
                vocal,
                durationMs,
                drift = drift,
                ratio = rawRatio,
                firstMs = firstMs,
                lastMs = lastMs,
                targetEnd = targetEnd,
            )
          }
          rawRatio <= 1.25 -> rawRatio
          rawRatio <= 1.40 -> {
            val soft = 1.25 + (rawRatio - 1.25) * 0.4
            NrmFileLogger.log(
                "whisperx-align",
                "ctc_fa_stretch_soft_clamp rawRatio=${"%.3f".format(Locale.US, rawRatio)} applied=${"%.3f".format(Locale.US, soft)}",
            )
            soft
          }
          else ->
              return lrc.also {
                logStretchSkip(
                    segmentScoped,
                    "ratio_out_of_range",
                    parsed.size,
                    vocal,
                    durationMs,
                    drift = drift,
                    ratio = rawRatio,
                    firstMs = firstMs,
                    lastMs = lastMs,
                    targetEnd = targetEnd,
                )
              }
        }
    val scaledMs = IntArray(parsed.size)
    scaledMs[0] = firstMs
    for (i in 1 until parsed.size) {
      val offset = parsed[i].ms - firstMs
      scaledMs[i] =
          (firstMs + offset * ratio).toInt().coerceAtLeast(scaledMs[i - 1] + 50)
    }
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_stretch_applied segment=$segmentScoped lines=${parsed.size} first=$firstMs last=$lastMs targetEnd=$targetEnd drift=$drift ratio=${"%.3f".format(Locale.US, ratio)} rawRatio=${"%.3f".format(Locale.US, rawRatio)} vocalEnd=${vocal.endMs}",
    )
    val sb = StringBuilder()
    for (i in parsed.indices) {
      sb.append(formatLrcTimestamp(scaledMs[i])).append(parsed[i].text).append('\n')
    }
    return sb.toString().trim()
  }

  private fun logStretchSkip(
      segmentScoped: Boolean,
      reason: String,
      lineCount: Int,
      vocal: VocalRange,
      durationMs: Long,
      drift: Long?,
      ratio: Double?,
      firstMs: Int?,
      lastMs: Int?,
      targetEnd: Long?,
  ) {
    val ratioText =
        ratio?.let { "%.3f".format(Locale.US, it) } ?: "n/a"
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_stretch_skip reason=$reason segment=$segmentScoped lines=$lineCount first=$firstMs last=$lastMs targetEnd=$targetEnd drift=$drift ratio=$ratioText vocalMs=${vocal.startMs}-${vocal.endMs} durMs=$durationMs",
    )
  }

  private data class LrcTimestampLine(val ms: Int, val text: String)

  private fun lastTimestampMsInLrc(lrc: String): Int {
    val parsed = parseLrcTimestampLines(lrc)
    return parsed.lastOrNull()?.ms ?: -1
  }

  /**
   * 2패스 분할 시 후반 세그먼트 첫 줄이 first_line_bump 등으로 과도하게 밀리면
   * 이전 세그먼트 마지막 줄과의 간격이 비정상적으로 벌어진다. 오디오 경계에 맞춰 당긴다.
   */
  private fun closeSegmentBoundaryGap(
      segLrc: String,
      prevLastMs: Int,
      segmentStartMs: Long,
      vocabKind: MelonSyncVocabKind,
  ): String {
    val parsed = parseLrcTimestampLines(segLrc)
    if (parsed.isEmpty()) return segLrc
    val firstNew = parsed.first().ms
    val minGap = minGapForLine(parsed.first().text, vocabKind)
    val targetFirst =
        max(
            prevLastMs + minGap,
            segmentStartMs.toInt() + MIN_INTRO_MS,
        )
    val excessGap = firstNew - targetFirst
    if (excessGap < BOUNDARY_CLOSE_MIN_GAP_MS) return segLrc
    val shift = excessGap.coerceAtMost(firstNew - segmentStartMs.toInt())
    if (shift <= 0) return segLrc
    NrmFileLogger.log(
        "whisperx-align",
        "ctc_fa_boundary_close prevLast=$prevLastMs first=$firstNew target=$targetFirst shift=$shift segStart=$segmentStartMs",
    )
    return shiftLrcTimestampsMs(segLrc, -shift)
  }

  private fun shiftLrcTimestampsMs(lrc: String, deltaMs: Int): String {
    if (deltaMs == 0) return lrc
    val parsed = parseLrcTimestampLines(lrc)
    if (parsed.isEmpty()) return lrc
    val sb = StringBuilder()
    var prev = 0
    for (line in parsed) {
      val ms = max(prev + 40, line.ms + deltaMs)
      prev = ms
      sb.append(formatLrcTimestamp(ms)).append(line.text).append('\n')
    }
    return sb.toString().trim()
  }

  private fun parseLrcTimestampLines(lrc: String): List<LrcTimestampLine> {
    val pattern = Regex("""^\[(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\](.*)$""")
    val out = mutableListOf<LrcTimestampLine>()
    for (line in lrc.lineSequence()) {
      val trimmed = line.trim()
      if (trimmed.isEmpty()) continue
      val m = pattern.matchEntire(trimmed) ?: continue
      val min = m.groupValues[1].toIntOrNull() ?: continue
      val sec = m.groupValues[2].toIntOrNull() ?: continue
      val fracRaw = m.groupValues[3]
      val fracMs =
          when {
            fracRaw.isEmpty() -> 0
            fracRaw.length == 1 -> fracRaw.toIntOrNull()?.times(100) ?: 0
            fracRaw.length == 2 -> fracRaw.toIntOrNull()?.times(10) ?: 0
            else -> fracRaw.take(3).toIntOrNull() ?: 0
          }
      val ms = min * 60_000 + sec * 1_000 + fracMs
      out += LrcTimestampLine(ms, m.groupValues[4])
    }
    return out
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
