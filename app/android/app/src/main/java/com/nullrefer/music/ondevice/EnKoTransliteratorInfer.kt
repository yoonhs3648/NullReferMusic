package com.nullrefer.music.ondevice

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject

/**
 * eunsour/en-ko-transliterator ONNX 추론 (encoder + decoder greedy).
 * 실행 바이너리 없음 — OrtSession 만 사용 (이미 APK에 onnxruntime 포함).
 */
object EnKoTransliteratorInfer {
  private const val TAG = "en-ko-transliterator"
  private const val MAX_NEW_TOKENS = 24
  private const val MAX_SRC_TOKENS = 48

  private val cache = AtomicReference<Engine?>(null)

  private data class Engine(
      val paths: EnKoTransliteratorBootstrap.Paths,
      val env: OrtEnvironment,
      val encoder: OrtSession,
      val decoder: OrtSession,
      val tokenizer: EnKoUnigramTokenizer,
      val padId: Long,
      val eosId: Long,
      val decoderStartId: Long,
  )

  fun invalidate() {
    val old = cache.getAndSet(null)
    old?.let {
      runCatching { it.encoder.close() }
      runCatching { it.decoder.close() }
    }
  }

  /** 설치 판정용 — `hello` → 한글 포함 결과 */
  fun probe(paths: EnKoTransliteratorBootstrap.Paths): Boolean {
    return try {
      invalidate() // 이전 깨진 엔진 캐시 제거
      val out = transliterateWord("hello", paths)
      val ok = out.any { it.code in 0xAC00..0xD7A3 }
      NrmFileLogger.log(TAG, "probe word=hello out=${out.take(32)} ok=$ok")
      ok
    } catch (t: Throwable) {
      NrmFileLogger.warn(TAG, "probe_fail err=${t.message?.take(120)}")
      false
    }
  }

  fun transliterateWord(word: String, paths: EnKoTransliteratorBootstrap.Paths): String {
    val trimmed = word.trim()
    if (trimmed.isEmpty()) return trimmed
    val engine = ensureEngine(paths) ?: return trimmed
    synchronized(engine) {
      return generate(engine, trimmed).ifBlank { trimmed }
    }
  }

  fun transliterateLineMixed(line: String, paths: EnKoTransliteratorBootstrap.Paths): String {
    if (!EnKoLyricsPreprocessor.LATIN_WORD.containsMatchIn(line)) return line
    return try {
      EnKoLyricsPreprocessor.LATIN_WORD.replace(line) { match ->
        val w = match.value
        if (w.none { it.isLetter() }) w
        else transliterateWord(w, paths)
      }
    } catch (e: Exception) {
      NrmFileLogger.warn(TAG, "line_fail line=${line.take(40)} err=${e.message?.take(80)}")
      line
    }
  }

  private fun ensureEngine(paths: EnKoTransliteratorBootstrap.Paths): Engine? {
    cache.get()?.let { if (it.paths.root == paths.root) return it }
    synchronized(this) {
      cache.get()?.let { if (it.paths.root == paths.root) return it }
      invalidate()
      return try {
        load(paths).also { cache.set(it) }
      } catch (t: Throwable) {
        NrmFileLogger.error(TAG, "engine_load_fail", t)
        null
      }
    }
  }

  private fun load(paths: EnKoTransliteratorBootstrap.Paths): Engine {
    val meta = JSONObject(paths.tokenizerMeta.readText(Charsets.UTF_8))
    val tokenizer = EnKoUnigramTokenizer.load(paths.spiece, meta)
    val env = OrtEnvironment.getEnvironment()
    val opts = OrtSession.SessionOptions()
    try {
      opts.setIntraOpNumThreads(2)
      opts.setInterOpNumThreads(1)
      val encoder = env.createSession(paths.encoder.absolutePath, opts)
      val decoder = env.createSession(paths.decoder.absolutePath, opts)
      return Engine(
          paths = paths,
          env = env,
          encoder = encoder,
          decoder = decoder,
          tokenizer = tokenizer,
          padId = meta.optLong("pad_token_id", 0L),
          eosId = meta.optLong("eos_token_id", 1L),
          decoderStartId = meta.optLong("decoder_start_token_id", 0L),
      )
    } finally {
      runCatching { opts.close() }
    }
  }

  private fun generate(engine: Engine, text: String): String {
    val ids = engine.tokenizer.encode(text, MAX_SRC_TOKENS)
    if (ids.isEmpty()) return text
    NrmFileLogger.log(
        TAG,
        "encode word=${text.take(24)} ids=${ids.take(8).joinToString(",")}${if (ids.size > 8) "…" else ""} n=${ids.size}",
    )
    val inputIds = ids.map { it.toLong() }.toLongArray()
    val attention = LongArray(inputIds.size) { 1L }

    val encHidden = runEncoder(engine, inputIds, attention) ?: return text
    val generated = ArrayList<Long>(MAX_NEW_TOKENS)
    generated.add(engine.decoderStartId)

    for (step in 0 until MAX_NEW_TOKENS) {
      val next =
          runDecoderStep(
              engine,
              decoderInputIds = generated.toLongArray(),
              encoderHidden = encHidden,
              encoderAttention = attention,
          ) ?: break
      if (next == engine.eosId || next == engine.padId) break
      generated.add(next)
    }

    val outIds = generated.drop(1).map { it.toInt() }
    return engine.tokenizer.decode(outIds).trim()
  }

  private fun runEncoder(
      engine: Engine,
      inputIds: LongArray,
      attention: LongArray,
  ): Array<FloatArray>? {
    val env = engine.env
    val shape = longArrayOf(1L, inputIds.size.toLong())
    val idTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(inputIds), shape)
    val maskTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(attention), shape)
    return try {
      val inputs =
          mapOf(
              findInputName(engine.encoder, listOf("input_ids", "inputs")) to idTensor,
              findInputName(engine.encoder, listOf("attention_mask")) to maskTensor,
          )
      engine.encoder.run(inputs).use { result ->
        val value = result[0].value
        when (value) {
          is Array<*> -> {
            @Suppress("UNCHECKED_CAST")
            val batch = value as Array<Array<FloatArray>>
            // Result.close 전에 deep-copy (native view use-after-free 방지)
            Array(batch[0].size) { t -> batch[0][t].copyOf() }
          }
          else -> {
            NrmFileLogger.warn(TAG, "encoder_unexpected_type ${value?.javaClass?.name}")
            null
          }
        }
      }
    } finally {
      idTensor.close()
      maskTensor.close()
    }
  }

  private fun runDecoderStep(
      engine: Engine,
      decoderInputIds: LongArray,
      encoderHidden: Array<FloatArray>,
      encoderAttention: LongArray,
  ): Long? {
    val env = engine.env
    val decShape = longArrayOf(1L, decoderInputIds.size.toLong())
    val encLen = encoderHidden.size.toLong()
    val hiddenSize = encoderHidden[0].size.toLong()
    val flat = FloatArray(encoderHidden.size * encoderHidden[0].size)
    var i = 0
    for (row in encoderHidden) {
      for (v in row) flat[i++] = v
    }
    val encShape = longArrayOf(1L, encLen, hiddenSize)
    val decIds = OnnxTensor.createTensor(env, LongBuffer.wrap(decoderInputIds), decShape)
    val encStates = OnnxTensor.createTensor(env, FloatBuffer.wrap(flat), encShape)
    val encMask =
        OnnxTensor.createTensor(env, LongBuffer.wrap(encoderAttention), longArrayOf(1L, encLen))
    return try {
      val inputs = LinkedHashMap<String, OnnxTensor>()
      inputs[findInputName(engine.decoder, listOf("input_ids", "decoder_input_ids"))] = decIds
      inputs[
          findInputName(
              engine.decoder,
              listOf("encoder_hidden_states", "encoder_outputs", "hidden_states"),
          )] =
          encStates
      val maskName =
          findInputNameOrNull(engine.decoder, listOf("encoder_attention_mask", "attention_mask"))
      if (maskName != null) inputs[maskName] = encMask

      engine.decoder.run(inputs).use { result ->
        val logitsVal = result[0].value
        val last = extractLastLogits(logitsVal) ?: return null
        // close 전 값만 사용
        argmax(last).toLong()
      }
    } finally {
      decIds.close()
      encStates.close()
      encMask.close()
    }
  }

  private fun extractLastLogits(value: Any?): FloatArray? {
    return when (value) {
      is Array<*> -> {
        if (value.isEmpty()) return null
        val first = value[0]
        when (first) {
          is Array<*> -> {
            @Suppress("UNCHECKED_CAST")
            val seq = first as Array<FloatArray>
            seq.lastOrNull()?.copyOf()
          }
          is FloatArray -> first.copyOf()
          else -> null
        }
      }
      else -> null
    }
  }

  private fun argmax(arr: FloatArray): Int {
    var bestI = 0
    var bestV = Float.NEGATIVE_INFINITY
    for (i in arr.indices) {
      val v = arr[i]
      if (v > bestV) {
        bestV = v
        bestI = i
      }
    }
    return bestI
  }

  private fun findInputName(session: OrtSession, candidates: List<String>): String {
    return findInputNameOrNull(session, candidates)
        ?: session.inputNames.firstOrNull()
        ?: candidates.first()
  }

  private fun findInputNameOrNull(session: OrtSession, candidates: List<String>): String? {
    val names = session.inputNames
    for (c in candidates) {
      if (names.contains(c)) return c
    }
    for (c in candidates) {
      val hit = names.firstOrNull { it.equals(c, ignoreCase = true) }
      if (hit != null) return hit
    }
    return null
  }
}
