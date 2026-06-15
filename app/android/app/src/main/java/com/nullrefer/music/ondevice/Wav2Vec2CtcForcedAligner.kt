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
 * wav2vec2 CTC forced alignment — 알려진 가사(멜론)를 오디오 프레임에 맞춘다.
 * WhisperX Python FA와 같은 계열(CTC trellis), ONNX Runtime으로 온디바이스 실행.
 */
object Wav2Vec2CtcForcedAligner {
  private val env: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }

  private const val SAMPLE_RATE = 16_000
  private const val MAX_AUDIO_SAMPLES = SAMPLE_RATE * 60 * 20
  private const val MAX_TRELLIS_CELLS = 8_000_000L

  private val sessionLock = Any()
  @Volatile private var cachedSession: OrtSession? = null
  @Volatile private var cachedSessionPath: String? = null

  data class AlignResult(
      val lrc: String,
      val alignedLines: Int,
      val totalLines: Int,
      val memoryInsufficient: Boolean = false,
  )

  fun alignMelonLinesToLrc(
      context: Context,
      alignDir: File,
      wav: File,
      melonLines: List<String>,
      audioDurationMs: Long,
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

      if (!NrmMemoryGuard.canAttemptCtcAlign(context)) {
        NrmFileLogger.warn(
            "whisperx-align",
            "ctc_fa_low_mem_pre_session availMb=${NrmMemoryGuard.availMemMb(context)} need=${NrmMemoryGuard.MIN_WORK_AVAIL_MB + 700}",
        )
        return alignMemoryFailed(melonLines)
      }

      val modelFile = File(alignDir, "model.onnx")
      if (modelFile.isFile) {
        getOrCreateSession(modelFile)
      }

      if (!NrmMemoryGuard.hasMinimumWorkMemory(context)) {
        NrmFileLogger.warn(
            "whisperx-align",
            "ctc_fa_low_mem_post_session availMb=${NrmMemoryGuard.availMemMb(context)}",
        )
        releaseOnnxSession()
        return alignMemoryFailed(melonLines)
      }

      val profile = NrmMemoryGuard.resolveCtcProfile(context)
      val chunkSamples = profile.chunkSamples
      val linesPerSegment = profile.linesPerSegment
      NrmFileLogger.log(
          "whisperx-align",
          "ctc_fa_profile tier=${profile.tier} chunkSamples=$chunkSamples linesPerSeg=$linesPerSegment availMb=${NrmMemoryGuard.availMemMb(context)}",
      )

      val useSegments =
          profile.tier != "high" ||
              melonLines.size > linesPerSegment ||
              sampleCount > chunkSamples * 10

      val result =
          if (useSegments) {
            alignMelonLinesSegmented(
                context,
                alignDir,
                wav,
                melonLines,
                durationMs,
                sampleCount,
                chunkSamples,
                linesPerSegment,
            )
          } else {
            val audio = readAndNormalizeWav(wav)
            alignAudioToLines(
                context,
                alignDir,
                audio,
                melonLines,
                durationMs,
                timeOffsetMs = 0,
                chunkSamples = chunkSamples,
            )
          }

      if (result.lrc.isBlank()) {
        return alignFailed(melonLines)
      }
      return result
    } catch (t: Throwable) {
      if (t is OutOfMemoryError || t.cause is OutOfMemoryError) {
        NrmFileLogger.error(
            "whisperx-align",
            "ctc_fa_oom lines=${melonLines.size} availMb=${NrmMemoryGuard.availMemMb(context)}",
            t,
        )
        return alignMemoryFailed(melonLines)
      }
      NrmFileLogger.error(
          "whisperx-align",
          "ctc_fa_fail lines=${melonLines.size} durMs=$audioDurationMs err=${t.message?.take(120)}",
          t,
      )
      return alignFailed(melonLines)
    } finally {
      releaseOnnxSession()
    }
  }

  fun releaseOnnxSession() {
    synchronized(sessionLock) {
      try {
        cachedSession?.close()
      } catch (_: Exception) {
        // ignore
      }
      cachedSession = null
      cachedSessionPath = null
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

  private fun alignMelonLinesSegmented(
      context: Context,
      alignDir: File,
      wav: File,
      melonLines: List<String>,
      durationMs: Long,
      totalSamples: Int,
      chunkSamples: Int,
      linesPerSegment: Int,
  ): AlignResult {
    val chunks = melonLines.chunked(linesPerSegment)
    val sb = StringBuilder()
    var aligned = 0
    var lineOffset = 0
    for (chunk in chunks) {
      if (!NrmMemoryGuard.hasMinimumWorkMemory(context)) {
        NrmFileLogger.warn(
            "whisperx-align",
            "ctc_fa_low_mem_segment availMb=${NrmMemoryGuard.availMemMb(context)}",
        )
        return alignMemoryFailed(melonLines)
      }
      val startMs = (lineOffset * durationMs) / melonLines.size
      val endMs = ((lineOffset + chunk.size) * durationMs) / melonLines.size
      val segDuration = (endMs - startMs).coerceAtLeast(500L)
      val startSample = ((startMs * SAMPLE_RATE) / 1000L).toInt().coerceIn(0, totalSamples)
      val endSample =
          ((endMs * SAMPLE_RATE) / 1000L).toInt().coerceIn(startSample + 1, totalSamples)
      val segAudio = readWavSegment(wav, startSample, endSample)
      if (segAudio.isEmpty()) {
        lineOffset += chunk.size
        continue
      }
      val part =
          alignAudioToLines(
              context,
              alignDir,
              segAudio,
              chunk,
              segDuration,
              timeOffsetMs = startMs.toInt(),
              chunkSamples = chunkSamples,
          )
      if (part.lrc.isNotBlank()) {
        sb.append(part.lrc).append('\n')
        aligned += part.alignedLines
      }
      lineOffset += chunk.size
      NrmFileLogger.log(
          "whisperx-align",
          "ctc_fa_segment lines=${chunk.size} startMs=$startMs endMs=$endMs samples=${segAudio.size}",
      )
      NrmMemoryGuard.trimBetweenInferenceSteps("whisperx-align")
    }
    val lrc = sb.toString().trim()
    return AlignResult(
        lrc = lrc,
        alignedLines = aligned,
        totalLines = melonLines.size,
    )
  }

  private fun alignAudioToLines(
      context: Context,
      alignDir: File,
      audio: FloatArray,
      melonLines: List<String>,
      audioDurationMs: Long,
      timeOffsetMs: Int,
      chunkSamples: Int,
  ): AlignResult {
    if (audio.isEmpty() || melonLines.isEmpty()) {
      return AlignResult(lrc = "", alignedLines = 0, totalLines = melonLines.size)
    }

    val vocabFile = File(alignDir, "vocab.json")
    val modelFile = File(alignDir, "model.onnx")
    val vocab = loadVocab(vocabFile)
    val blankId = vocab.charToId["<pad>"] ?: vocab.charToId["|"] ?: 0

    val logProbs = inferLogProbs(modelFile, audio, chunkSamples)
    if (logProbs.isEmpty()) {
      throw IllegalStateException("empty_logits")
    }

    val frameMs = audioDurationMs.toDouble() / logProbs.size.toDouble()

    val lineCharStarts = IntArray(melonLines.size)
    val full = StringBuilder()
    for (i in melonLines.indices) {
      lineCharStarts[i] = full.length
      val lineNorm = normalizeLine(melonLines[i])
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

    val trellisCells = logProbs.size.toLong() * (tokens.size * 2L + 1L)
    if (trellisCells > MAX_TRELLIS_CELLS) {
      throw IllegalStateException("trellis_too_large cells=$trellisCells")
    }

    val charToToken = charToTokenIndex.charToToken
    val tokenStartFrames = forcedAlignTokenStarts(logProbs, tokens, blankId)

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

    for (i in 1 until rawMs.size) {
      if (rawMs[i] <= rawMs[i - 1]) {
        rawMs[i] = rawMs[i - 1] + 80
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

  private fun normalizeLine(text: String): String {
    return text
        .trim()
        .lowercase(Locale.ROOT)
        .replace(Regex("""\s+"""), " ")
        .replace(" ", "|")
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
      val sb = buf.asShortBuffer() as ShortBuffer
      sb.get(shorts)
      normalizeSamples(shorts)
    }
  }

  private fun readAndNormalizeWav(wav: File): FloatArray {
    if (!wav.isFile || wav.length() <= 44) return FloatArray(0)
    return RandomAccessFile(wav, "r").use { raf ->
      val shortCount = ((raf.length() - 44) / 2).toInt()
      if (shortCount <= 0) return FloatArray(0)
      raf.seek(44L)
      val bytes = ByteArray(shortCount * 2)
      raf.readFully(bytes)
      val shorts = ShortArray(shortCount)
      val buf = ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
      val sb = buf.asShortBuffer() as ShortBuffer
      sb.get(shorts)
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

  private fun buildSessionOptions(): OrtSession.SessionOptions {
    val opts = OrtSession.SessionOptions()
    opts.setIntraOpNumThreads(1)
    opts.setInterOpNumThreads(1)
    opts.setMemoryPatternOptimization(false)
    return opts
  }

  private fun getOrCreateSession(modelFile: File): OrtSession {
    val path = modelFile.absolutePath
    synchronized(sessionLock) {
      val cached = cachedSession
      if (cached != null && cachedSessionPath == path) {
        return cached
      }
      try {
        cached?.close()
      } catch (_: Exception) {
        // ignore
      }
      val session = env.createSession(path, buildSessionOptions())
      cachedSession = session
      cachedSessionPath = path
      NrmFileLogger.log("whisperx-align", "onnx_session_open path=${modelFile.name}")
      return session
    }
  }

  private fun inferLogProbs(
      modelFile: File,
      audio: FloatArray,
      chunkSamples: Int,
  ): Array<FloatArray> {
    val session = getOrCreateSession(modelFile)
    if (audio.size <= chunkSamples) {
      return inferLogProbsWithSession(session, audio, chunkSamples, offsetSamples = 0)
    }
    val allFrames = ArrayList<FloatArray>(audio.size / 320)
    var offset = 0
    var chunkIndex = 0
    while (offset < audio.size) {
      val end = min(offset + chunkSamples, audio.size)
      val chunk = audio.copyOfRange(offset, end)
      val chunkProbs =
          inferLogProbsWithSession(session, chunk, chunkSamples, offsetSamples = offset)
      allFrames.addAll(chunkProbs.toList())
      NrmFileLogger.log(
          "whisperx-align",
          "onnx_chunk idx=$chunkIndex offset=$offset end=$end frames=${chunkProbs.size} chunkSamples=$chunkSamples",
      )
      offset = end
      chunkIndex += 1
    }
    return allFrames.toTypedArray()
  }

  private fun inferLogProbsWithSession(
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
    if (cells > MAX_TRELLIS_CELLS) {
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
