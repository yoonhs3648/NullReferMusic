package com.nullrefer.music.ondevice

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject

/**
 * eunsour/en-ko-transliterator ONNX 추론 (encoder + decoder greedy).
 *
 * 설계상 혼합 가사(한글+영어)에서 **라틴 단어 단위**로 치환한다.
 * REDRED처럼 반복 영단어가 많으면 유니크 선처리 + LRU로 ONNX 호출을 줄인다.
 * (문장 전체 1회 inference / true batch는 혼합 줄·모델 입출력 제약으로 별도 작업)
 */
object EnKoTransliteratorInfer {
  private const val TAG = "en-ko-transliterator"
  private const val MAX_NEW_TOKENS_NORMAL = 24
  private const val MAX_NEW_TOKENS_LOW_MEM = 12
  private const val MAX_SRC_TOKENS = 48
  private const val WORD_CACHE_MAX = 2_048
  private const val ENCODE_CACHE_MAX = 2_048

  private val cache = AtomicReference<Engine?>(null)
  /** 프로세스 수명 동안 `hello` probe 1회만 — 성공/실패 결과 캐시 */
  @Volatile private var cachedProbeOk: Boolean? = null
  @Volatile private var cachedProbeRoot: String? = null

  @Volatile private var sessionCreateCount = 0
  @Volatile private var sessionDestroyCount = 0
  @Volatile private var lowMemoryMode = false
  @Volatile private var pendingInvalidate = false

  private val inFlight = AtomicInteger(0)

  /** word(lowercase) → hangul (LRU-ish via ConcurrentHashMap + size trim) */
  private val wordResultCache = ConcurrentHashMap<String, String>(512)
  private val encodeIdsCache = ConcurrentHashMap<String, IntArray>(512)

  private val songEncoderRuns = AtomicInteger(0)
  private val songDecoderRuns = AtomicInteger(0)
  private val songDecoderSteps = AtomicInteger(0)
  private val songTokenizerEncodes = AtomicInteger(0)
  private val songCacheHits = AtomicInteger(0)
  private val songCacheMisses = AtomicInteger(0)
  private val songDictHits = AtomicInteger(0)
  private val songDecodedTokens = AtomicInteger(0)
  private val songWordLenSum = AtomicLong(0)
  private val songWordCount = AtomicInteger(0)
  private val songEncodeLogsLeft = AtomicInteger(0)
  private val songEncoderNs = AtomicLong(0)
  private val songDecoderNs = AtomicLong(0)
  @Volatile private var songStartedAtMs = 0L
  @Volatile private var songExpectedUnique = 0
  /** normalize key → 출현 횟수 (Top10용) */
  private val songWordFreq = ConcurrentHashMap<String, AtomicInteger>(256)

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

  fun isBusy(): Boolean = inFlight.get() > 0

  fun sessionCreateCount(): Int = sessionCreateCount

  fun sessionDestroyCount(): Int = sessionDestroyCount

  /** 곡(또는 배치) 전처리 시작 — 통계 리셋 + inFlight */
  fun beginSongRun(uniqueWords: Int, lineCount: Int) {
    inFlight.incrementAndGet()
    songEncoderRuns.set(0)
    songDecoderRuns.set(0)
    songDecoderSteps.set(0)
    songTokenizerEncodes.set(0)
    songCacheHits.set(0)
    songCacheMisses.set(0)
    songDictHits.set(0)
    songDecodedTokens.set(0)
    songWordLenSum.set(0)
    songWordCount.set(0)
    songEncodeLogsLeft.set(3)
    songEncoderNs.set(0)
    songDecoderNs.set(0)
    songStartedAtMs = System.currentTimeMillis()
    songExpectedUnique = uniqueWords
    songWordFreq.clear()
    NrmFileLogger.log(
        TAG,
        "song_run_start uniqueWords=$uniqueWords lines=$lineCount " +
            "createCount=$sessionCreateCount destroyCount=$sessionDestroyCount " +
            "lowMem=$lowMemoryMode wordCache=${wordResultCache.size}",
    )
  }

  fun endSongRun() {
    val elapsedMs = (System.currentTimeMillis() - songStartedAtMs).coerceAtLeast(0L)
    val enc = songEncoderRuns.get()
    val dec = songDecoderRuns.get()
    val hits = songCacheHits.get()
    val misses = songCacheMisses.get()
    val dictHits = songDictHits.get()
    val lookups = hits + misses + dictHits
    val hitRate =
        if (lookups > 0) (100.0 * (hits + dictHits).toDouble() / lookups.toDouble()) else 0.0
    val avgEnc =
        if (enc > 0) songEncoderNs.get().toDouble() / 1_000_000.0 / enc.toDouble() else 0.0
    val avgDec =
        if (dec > 0) songDecoderNs.get().toDouble() / 1_000_000.0 / dec.toDouble() else 0.0
    val words = songWordCount.get().coerceAtLeast(1)
    val avgLen = songWordLenSum.get().toDouble() / words.toDouble()
    NrmFileLogger.log(
        TAG,
        "song_run_end elapsed=${"%.1f".format(Locale.US, elapsedMs / 1000.0)}s " +
            "uniqueWords=$songExpectedUnique encoderRuns=$enc decoderRuns=$dec " +
            "avgEncoderMs=${"%.1f".format(Locale.US, avgEnc)} avgDecoderMs=${"%.1f".format(Locale.US, avgDec)} " +
            "cacheHits=$hits cacheMisses=$misses dictHits=$dictHits " +
            "cacheHitRate=${"%.0f".format(Locale.US, hitRate)}% " +
            "tokenizerEncodes=${songTokenizerEncodes.get()} decoderSteps=${songDecoderSteps.get()} " +
            "decodedTokens=${songDecodedTokens.get()} avgWordLen=${"%.2f".format(Locale.US, avgLen)} " +
            "createCount=$sessionCreateCount destroyCount=$sessionDestroyCount " +
            "wordCache=${wordResultCache.size} lowMem=$lowMemoryMode",
    )
    val top10 =
        songWordFreq.entries
            .sortedByDescending { it.value.get() }
            .take(10)
            .joinToString(" | ") { "${it.key} ${it.value.get()}" }
    if (top10.isNotEmpty()) {
      NrmFileLogger.log(TAG, "song_run_top_words $top10")
    }
    if (enc > songExpectedUnique && songExpectedUnique > 0) {
      NrmFileLogger.warn(
          TAG,
          "song_run_dup_infer uniqueWords=$songExpectedUnique encoderRuns=$enc " +
              "(encoderRuns should be ≈ uniqueWords after normalize+hyphen-split)",
      )
    }
    if (inFlight.decrementAndGet() <= 0) {
      inFlight.set(0)
      if (pendingInvalidate) {
        pendingInvalidate = false
        invalidate(clearProbe = false, force = true)
      }
    }
  }

  /**
   * TRIM_MEMORY_RUNNING_CRITICAL 등 — 추론 중이면 Session을 닫지 않고 저메모리 모드만 켠다.
   */
  fun enterLowMemoryMode(reason: String) {
    lowMemoryMode = true
    trimWordCaches(keep = WORD_CACHE_MAX / 4)
    NrmFileLogger.warn(
        TAG,
        "low_mem_mode on reason=$reason maxNewTokens=$MAX_NEW_TOKENS_LOW_MEM " +
            "wordCache=${wordResultCache.size} inFlight=${inFlight.get()}",
    )
  }

  /**
   * encoder/decoder OrtSession 해제.
   * [clearProbe]=true 는 설치 wipe 시에만 — FA 직전 메모리 해제로는 probe 캐시를 유지한다.
   * 추론 중([isBusy])이면 [force]=false 일 때 닫지 않고 저메모리 모드 + 지연 invalidate.
   */
  fun invalidate(clearProbe: Boolean = false, force: Boolean = false) {
    if (!force && inFlight.get() > 0) {
      pendingInvalidate = true
      enterLowMemoryMode("invalidate_deferred_busy")
      NrmFileLogger.log(
          TAG,
          "session_invalidate deferred (busy) createCount=$sessionCreateCount destroyCount=$sessionDestroyCount",
      )
      return
    }
    val old = cache.getAndSet(null)
    if (old != null) {
      runCatching { old.encoder.close() }
      runCatching { old.decoder.close() }
      sessionDestroyCount += 1
      NrmFileLogger.log(
          TAG,
          "session_destroy #$sessionDestroyCount (createCount=$sessionCreateCount) clearProbe=$clearProbe",
      )
    } else {
      NrmFileLogger.log(TAG, "session_released (already_null) createCount=$sessionCreateCount destroyCount=$sessionDestroyCount")
    }
    if (clearProbe) {
      cachedProbeOk = null
      cachedProbeRoot = null
      wordResultCache.clear()
      encodeIdsCache.clear()
      lowMemoryMode = false
    }
  }

  /** 설치·게이트용 — `hello` → 한글 포함 여부. 동일 root면 프로세스당 1회만 추론. */
  fun probe(paths: EnKoTransliteratorBootstrap.Paths): Boolean {
    val root = paths.root.absolutePath
    cachedProbeOk?.let { cached ->
      if (cachedProbeRoot == root) {
        NrmFileLogger.log(TAG, "probe cache hit ok=$cached")
        return cached
      }
    }
    return try {
      val out = transliterateWord("hello", paths)
      val ok = out.any { it.code in 0xAC00..0xD7A3 }
      cachedProbeOk = ok
      cachedProbeRoot = root
      NrmFileLogger.log(TAG, "probe word=hello out=${out.take(32)} ok=$ok (cached)")
      ok
    } catch (t: Throwable) {
      cachedProbeOk = false
      cachedProbeRoot = root
      NrmFileLogger.warn(TAG, "probe_fail err=${t.message?.take(120)}")
      false
    }
  }

  fun transliterateWord(word: String, paths: EnKoTransliteratorBootstrap.Paths): String {
    val trimmed = word.trim()
    if (trimmed.isEmpty()) return trimmed
    val parts = splitHyphenatedParts(trimmed)
    if (parts.size > 1) {
      return parts.joinToString("-") { part ->
        if (part.none { it.isLetter() }) part
        else transliterateAtomicWord(part, paths)
      }
    }
    return transliterateAtomicWord(trimmed, paths)
  }

  /**
   * Cache key 정규화 (음역 결과 불변):
   * lowercase → trim → 인용부호/콤마/마침표/아포스트로피/!?/()/기타 구두점 제거.
   * `Don't` / `DONT` / `Don't,` → `dont`
   */
  fun normalizeWordKey(raw: String): String {
    val lowered = raw.trim().lowercase(Locale.US)
    if (lowered.isEmpty()) return ""
    val sb = StringBuilder(lowered.length)
    for (ch in lowered) {
      when {
        ch in 'a'..'z' -> sb.append(ch)
        // 아포스트로피·인용·구두점·하이픈 등은 전부 스킵 (하이픈 분리는 사전 단계)
        ch.isLetter() -> sb.append(ch) // 라틴 확장 등
      }
    }
    return sb.toString()
  }

  /** `red-red` → [`red`,`red`]. cache 전에 분리해 hit율을 높인다. */
  fun splitHyphenatedParts(raw: String): List<String> {
    if (!HYPHEN_SPLIT.containsMatchIn(raw)) return listOf(raw)
    return raw.split(HYPHEN_SPLIT).filter { it.isNotEmpty() }
  }

  private fun noteWordSeen(key: String) {
    if (key.isEmpty()) return
    songWordFreq.computeIfAbsent(key) { AtomicInteger(0) }.incrementAndGet()
  }

  private fun transliterateAtomicWord(
      raw: String,
      paths: EnKoTransliteratorBootstrap.Paths,
      countFreq: Boolean = true,
  ): String {
    val key = normalizeWordKey(raw)
    if (key.isEmpty()) return raw
    if (countFreq) noteWordSeen(key)
    wordResultCache[key]?.let { hit ->
      songCacheHits.incrementAndGet()
      return hit
    }
    // dictionary 우선 → 없으면 ONNX
    dictionaryPronunciation(raw, key)?.let { hangul ->
      songDictHits.incrementAndGet()
      putWordCache(key, hangul)
      return hangul
    }
    songCacheMisses.incrementAndGet()
    val engine = ensureEngine(paths) ?: return raw
    synchronized(engine) {
      // 이중 체크 — warm + line replace 경쟁
      wordResultCache[key]?.let { hit ->
        songCacheHits.incrementAndGet()
        songCacheMisses.decrementAndGet()
        return hit
      }
      dictionaryPronunciation(raw, key)?.let { hangul ->
        songDictHits.incrementAndGet()
        songCacheMisses.decrementAndGet()
        putWordCache(key, hangul)
        return hangul
      }
      val out = generate(engine, key).ifBlank { key }
      putWordCache(key, out)
      return out
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

  /** 유니크 정규화 키를 먼저 추론해 캐시를 채운다. */
  fun warmUniqueWords(words: Collection<String>, paths: EnKoTransliteratorBootstrap.Paths) {
    for (w in words) {
      val key = normalizeWordKey(w)
      if (key.isEmpty()) continue
      transliterateAtomicWord(key, paths, countFreq = false)
    }
  }

  private val HYPHEN_SPLIT = Regex("[-‐‑‒–—]+")

  /**
   * 자주 쓰는 영어 축약형 → 한글 발음 (ONNX 전에 적용).
   * key = [normalizeWordKey] 결과 (`it's`→`its`).
   * 중의성 있는 키는 원문에 아포스트로피가 있을 때만 사용.
   */
  private val PRONUNCIATION_DICT: Map<String, String> =
      mapOf(
          "its" to "잇츠",
          "im" to "아임",
          "dont" to "돈트",
          "youre" to "유어",
          "thats" to "댓츠",
          "cant" to "캔트",
          "wont" to "원트",
          "ill" to "아일",
          "well" to "윌",
          "theyre" to "데어",
          "weve" to "위브",
          "youve" to "유브",
          "ive" to "아이브",
          "theyve" to "데이브",
          "theres" to "데얼즈",
          "whats" to "왓츠",
          "whos" to "후즈",
          "hows" to "하우즈",
          "shes" to "쉬즈",
          "hes" to "히즈",
          "were" to "위어",
          "isnt" to "이즌트",
          "arent" to "아런트",
          "wasnt" to "와즌트",
          "werent" to "워런트",
          "doesnt" to "더즌트",
          "didnt" to "디든트",
          "havent" to "해븐트",
          "hasnt" to "해즌트",
          "lets" to "렛츠",
          "aint" to "에인트",
          "id" to "아이드",
          "youd" to "유드",
          "hed" to "히드",
          "shed" to "쉬드",
          "wed" to "위드",
          "theyd" to "데이드",
          "shouldnt" to "슈든트",
          "wouldnt" to "우든트",
          "couldnt" to "쿠든트",
          "mustnt" to "머슨트",
      )

  /** 아포스트로피 없이 오면 일반 단어일 수 있어 dictionary 스킵 */
  private val DICT_REQUIRES_APOSTROPHE =
      setOf(
          "ill",
          "id",
          "well",
          "were",
          "wed",
          "hed",
          "shed",
          "hell",
          "shell",
          "cant",
          "wont",
          "its",
          "lets",
      )

  private fun hasApostrophe(raw: String): Boolean =
      raw.any { ch -> ch == '\'' || ch == '\u2019' || ch == '\u2018' }

  /** dictionary 우선 — 없으면 null (ONNX fallback) */
  private fun dictionaryPronunciation(raw: String, key: String): String? {
    val hangul = PRONUNCIATION_DICT[key] ?: return null
    if (key in DICT_REQUIRES_APOSTROPHE && !hasApostrophe(raw)) return null
    return hangul
  }

  private fun putWordCache(key: String, value: String) {
    wordResultCache[key] = value
    if (wordResultCache.size > WORD_CACHE_MAX) {
      trimWordCaches(keep = WORD_CACHE_MAX * 3 / 4)
    }
  }

  private fun trimWordCaches(keep: Int) {
    if (wordResultCache.size <= keep) return
    val keys = wordResultCache.keys().toList()
    val drop = (wordResultCache.size - keep).coerceAtLeast(0)
    for (i in 0 until drop) {
      wordResultCache.remove(keys[i])
    }
    if (encodeIdsCache.size > keep) {
      val eKeys = encodeIdsCache.keys().toList()
      val eDrop = (encodeIdsCache.size - keep).coerceAtLeast(0)
      for (i in 0 until eDrop) {
        encodeIdsCache.remove(eKeys[i])
      }
    }
  }

  private fun maxNewTokens(): Int =
      if (lowMemoryMode) MAX_NEW_TOKENS_LOW_MEM else MAX_NEW_TOKENS_NORMAL

  private fun ensureEngine(paths: EnKoTransliteratorBootstrap.Paths): Engine? {
    cache.get()?.let { if (it.paths.root == paths.root) return it }
    synchronized(this) {
      cache.get()?.let { if (it.paths.root == paths.root) return it }
      invalidate(force = true)
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
      opts.setIntraOpNumThreads(1)
      opts.setInterOpNumThreads(1)
      opts.setMemoryPatternOptimization(false)
      opts.setCPUArenaAllocator(false)
      val encoder = env.createSession(paths.encoder.absolutePath, opts)
      val decoder = env.createSession(paths.decoder.absolutePath, opts)
      sessionCreateCount += 1
      NrmFileLogger.log(
          TAG,
          "session_create #$sessionCreateCount (destroyCount=$sessionDestroyCount) " +
              "path=${paths.root.name} threads=1 memPattern=false cpuArena=false",
      )
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
    songWordCount.incrementAndGet()
    songWordLenSum.addAndGet(text.length.toLong())
    val key = normalizeWordKey(text).ifEmpty { text.lowercase(Locale.US) }
    val ids =
        encodeIdsCache[key]
            ?: run {
              songTokenizerEncodes.incrementAndGet()
              val encoded = engine.tokenizer.encode(key, MAX_SRC_TOKENS)
              if (encoded.isNotEmpty()) {
                encodeIdsCache[key] = encoded
                if (encodeIdsCache.size > ENCODE_CACHE_MAX) {
                  trimWordCaches(keep = ENCODE_CACHE_MAX * 3 / 4)
                }
              }
              encoded
            }
    if (ids.isEmpty()) return text
    val logsLeft = songEncodeLogsLeft.get()
    if (logsLeft > 0 && songEncodeLogsLeft.compareAndSet(logsLeft, logsLeft - 1)) {
      NrmFileLogger.log(
          TAG,
          "encode word=${key.take(24)} ids=${ids.take(8).joinToString(",")}${if (ids.size > 8) "…" else ""} n=${ids.size}",
      )
    }
    val inputIds = ids.map { it.toLong() }.toLongArray()
    val attention = LongArray(inputIds.size) { 1L }

    val encStart = System.nanoTime()
    songEncoderRuns.incrementAndGet()
    val encHidden = runEncoder(engine, inputIds, attention)
    songEncoderNs.addAndGet(System.nanoTime() - encStart)
    if (encHidden == null) return text

    songDecoderRuns.incrementAndGet()
    val decStart = System.nanoTime()
    val generated = ArrayList<Long>(maxNewTokens())
    generated.add(engine.decoderStartId)

    for (step in 0 until maxNewTokens()) {
      songDecoderSteps.incrementAndGet()
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
    songDecoderNs.addAndGet(System.nanoTime() - decStart)

    val outIds = generated.drop(1).map { it.toInt() }
    songDecodedTokens.addAndGet(outIds.size)
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
