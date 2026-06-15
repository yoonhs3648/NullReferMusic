package com.nullrefer.music.ondevice

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.File
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

  data class AlignResult(
      val lrc: String,
      val alignedLines: Int,
      val totalLines: Int,
  )

  fun alignMelonLinesToLrc(
      alignDir: File,
      wav: File,
      melonLines: List<String>,
      audioDurationMs: Long,
  ): AlignResult {
    val vocabFile = File(alignDir, "vocab.json")
    val modelFile = File(alignDir, "model.onnx")
    val vocab = loadVocab(vocabFile)
    val blankId = vocab.charToId["<pad>"] ?: vocab.charToId["|"] ?: 0

    val audio = readAndNormalizeWav(wav)
    if (audio.isEmpty()) {
      throw IllegalStateException("empty_wav")
    }

    val logProbs = inferLogProbs(modelFile, audio)
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

    val charToToken = charToTokenIndex.charToToken
    val tokenStartFrames = forcedAlignTokenStarts(logProbs, tokens, blankId)

    var alignedCount = 0
    val rawMs = IntArray(melonLines.size)
    for (i in melonLines.indices) {
      val charStart = lineCharStarts[i]
      val tokenIdx =
          if (charStart in charToToken.indices) charToToken[charStart] else charToToken.lastOrNull() ?: 0
      val frame =
          if (tokenIdx in tokenStartFrames.indices) {
            tokenStartFrames[tokenIdx]
          } else {
            tokenStartFrames.lastOrNull() ?: 0
          }
      rawMs[i] = (frame * frameMs).toInt().coerceAtLeast(0)
      alignedCount += 1
    }

    for (i in 1 until rawMs.size) {
      if (rawMs[i] <= rawMs[i - 1]) {
        rawMs[i] = rawMs[i - 1] + 80
      }
    }
    val maxMs = (audioDurationMs - 500).toInt().coerceAtLeast(rawMs[0] + 80)
    if (rawMs.isNotEmpty() && rawMs.last() > maxMs && rawMs.size > 1) {
      val span = (maxMs - rawMs[0]).coerceAtLeast((rawMs.size - 1) * 80)
      for (i in 1 until rawMs.size) {
        rawMs[i] = rawMs[0] + (span * i / (rawMs.size - 1))
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
        alignedLines = alignedCount,
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

  private fun readAndNormalizeWav(wav: File): FloatArray {
    val bytes = wav.readBytes()
    if (bytes.size <= 44) return FloatArray(0)
    val shortCount = (bytes.size - 44) / 2
    val shorts = ShortArray(shortCount)
    val buf = java.nio.ByteBuffer.wrap(bytes, 44, shortCount * 2).order(java.nio.ByteOrder.LITTLE_ENDIAN)
    val sb = buf.asShortBuffer() as ShortBuffer
    sb.get(shorts)
    val audio = FloatArray(shortCount)
    var sum = 0.0
    for (i in shorts.indices) {
      audio[i] = shorts[i] / 32768.0f
      sum += audio[i].toDouble()
    }
    val mean = (sum / shortCount).toFloat()
    var varSum = 0.0
    for (v in audio) {
      val d = v - mean
      varSum += d * d
    }
    val std = sqrt(varSum / shortCount + 1e-7).toFloat()
    for (i in audio.indices) {
      audio[i] = (audio[i] - mean) / std
    }
    return audio
  }

  private fun inferLogProbs(modelFile: File, audio: FloatArray): Array<FloatArray> {
    val opts = OrtSession.SessionOptions()
    opts.setIntraOpNumThreads(2)
    opts.setInterOpNumThreads(1)
    env.createSession(modelFile.absolutePath, opts).use { session ->
      val inputName = session.inputNames.first()
      val shape = longArrayOf(1, audio.size.toLong())
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

  /**
   * CTC forced alignment trellis — 각 입력 문자(token)의 시작 프레임.
   */
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
