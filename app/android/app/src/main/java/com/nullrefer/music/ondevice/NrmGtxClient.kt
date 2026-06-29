package com.nullrefer.music.ondevice

import org.json.JSONArray
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors

/**
 * Google Translate gtx 비공식 엔드포인트 — Kotlin HttpURLConnection.
 *
 * 전략:
 *  1. \n 구분 청크 단일 q= 요청 (CHUNK_SIZE줄씩) × CONCURRENCY 동시 처리
 *     → HTTP 요청 수를 줄 수 / CHUNK_SIZE / CONCURRENCY 로 대폭 감소
 *  2. 청크 응답 \n 분리 후 줄 수 불일치 → 해당 청크만 줄별 순차 fallback
 *  3. 타임아웃 / 429 → 즉시 throw (전체 번역 실패, 원문 LRC 저장)
 *
 * JS setTimeout 기반 타임아웃은 백그라운드 freeze 시 발동하지 않는 문제를
 * HttpURLConnection.readTimeout(OS 소켓 레벨)으로 해결.
 */
object NrmGtxClient {

    private const val GTX_BASE = "https://translate.googleapis.com/translate_a/single"
    private const val CONNECT_MS = 8_000
    /** OS 소켓 읽기 타임아웃 — JS GTX_FETCH_TIMEOUT_MS와 동일 */
    private const val READ_MS = 15_000

    /** 단일 q= 에 \n 구분자로 묶을 최대 줄 수 */
    const val CHUNK_SIZE = 10
    /** 동시에 처리하는 청크 수 */
    const val CONCURRENCY = 3
    /** 청크 그룹 사이 delay (rate-limit 방어) */
    const val GROUP_DELAY_MS = 600L

    class GtxTimeoutException(msg: String) : Exception(msg)
    class GtxRateLimitException(msg: String) : Exception(msg)
    class GtxHttpException(msg: String, val status: Int) : Exception(msg)

    data class TranslateResult(
        val texts: List<String>,
        val sourceLangs: List<String>,
    )

    /**
     * \n 청크 + 동시 처리로 번역.
     * [lineDelayMs] 는 줄별 순차 fallback 전용.
     */
    fun translateAll(texts: List<String>, lineDelayMs: Long): TranslateResult {
        if (texts.isEmpty()) return TranslateResult(emptyList(), emptyList())

        val batchId = "gtx_kt_${System.currentTimeMillis()}"
        NrmFileLogger.log(
            "gtx",
            "batch_start batchId=$batchId count=${texts.size} chunkSize=$CHUNK_SIZE concurrency=$CONCURRENCY",
        )

        return try {
            val result = translateChunkedConcurrent(texts, batchId)
            NrmFileLogger.log("gtx", "batch_done_chunked batchId=$batchId okCount=${result.texts.size}")
            result
        } catch (e: GtxTimeoutException) {
            throw e
        } catch (e: GtxRateLimitException) {
            throw e
        } catch (e: Exception) {
            // 청크 방식 자체 실패 → 줄별 순차 전체 fallback
            NrmFileLogger.warn("gtx", "batch_chunked_failed batchId=$batchId err=${e.message}, sequential fallback")
            translateSequential(texts, lineDelayMs, batchId)
        }
    }

    // ── 청크 동시 처리 ─────────────────────────────────────────────────────────

    private fun translateChunkedConcurrent(texts: List<String>, batchId: String): TranslateResult {
        val chunks = texts.chunked(CHUNK_SIZE)
        val outTexts = arrayOfNulls<String>(texts.size)
        val outLangs = arrayOfNulls<String>(texts.size)
        val executor = Executors.newFixedThreadPool(CONCURRENCY)

        try {
            var groupStart = 0
            while (groupStart < chunks.size) {
                val groupEnd = minOf(groupStart + CONCURRENCY, chunks.size)
                val group = chunks.subList(groupStart, groupEnd)

                val futures = group.mapIndexed { offset, chunk ->
                    val chunkIdx = groupStart + offset
                    val startIdx = chunkIdx * CHUNK_SIZE
                    executor.submit<Unit> {
                        NrmFileLogger.log(
                            "gtx",
                            "chunk_start chunkIdx=$chunkIdx startIdx=$startIdx size=${chunk.size} batchId=$batchId",
                        )
                        val t0 = System.currentTimeMillis()
                        val (txts, langs) = translateChunkWithFallback(chunk, chunkIdx, startIdx, batchId)
                        NrmFileLogger.log(
                            "gtx",
                            "chunk_done chunkIdx=$chunkIdx elapsedMs=${System.currentTimeMillis() - t0} batchId=$batchId",
                        )
                        txts.forEachIndexed { i, t -> outTexts[startIdx + i] = t }
                        langs.forEachIndexed { i, l -> outLangs[startIdx + i] = l }
                    }
                }

                for (f in futures) {
                    try {
                        f.get()
                    } catch (e: ExecutionException) {
                        // unwrap — timeout / rate-limit 은 상위로 전파
                        when (val cause = e.cause) {
                            is GtxTimeoutException -> throw cause
                            is GtxRateLimitException -> throw cause
                            else -> throw cause ?: e
                        }
                    }
                }

                if (groupEnd < chunks.size) Thread.sleep(GROUP_DELAY_MS)
                groupStart = groupEnd
            }
        } finally {
            executor.shutdownNow()
        }

        return TranslateResult(
            outTexts.map { it ?: "" },
            outLangs.map { it ?: "EN" },
        )
    }

    /**
     * 단일 청크 번역. \n 방식 성공 시 반환, 줄 수 불일치 시 줄별 순차 fallback.
     */
    private fun translateChunkWithFallback(
        chunk: List<String>,
        chunkIdx: Int,
        startIdx: Int,
        batchId: String,
    ): Pair<List<String>, List<String>> {
        if (chunk.size == 1) {
            val trimmed = chunk[0].trim()
            if (trimmed.isEmpty()) return Pair(listOf(""), listOf("EN"))
            val (text, lang) = translateOne(trimmed)
            return Pair(listOf(text), listOf(lang))
        }

        // 빈 줄 자리를 보존하기 위해 인덱스 추적
        val nonEmptyIndices = chunk.indices.filter { chunk[it].trim().isNotEmpty() }
        if (nonEmptyIndices.isEmpty()) {
            return Pair(List(chunk.size) { "" }, List(chunk.size) { "EN" })
        }

        // \n 구분 단일 q= 요청
        val joined = nonEmptyIndices.joinToString("\n") { chunk[it].trim() }
        return try {
            val (translated, sourceLang) = translateOne(joined)
            val lines = translated
                .split("\n")
                .map { it.trim() }
                .filter { it.isNotBlank() }

            if (lines.size == nonEmptyIndices.size) {
                // 성공: 빈 줄 자리 복원
                NrmFileLogger.log(
                    "gtx",
                    "chunk_multiline_ok chunkIdx=$chunkIdx nonEmpty=${nonEmptyIndices.size} batchId=$batchId",
                )
                val outTexts = Array(chunk.size) { "" }
                val outLangs = Array(chunk.size) { "EN" }
                nonEmptyIndices.forEachIndexed { i, origIdx ->
                    outTexts[origIdx] = lines[i]
                    outLangs[origIdx] = sourceLang
                }
                Pair(outTexts.toList(), outLangs.toList())
            } else {
                // 줄 수 불일치 → 해당 청크 줄별 순차
                NrmFileLogger.warn(
                    "gtx",
                    "chunk_mismatch chunkIdx=$chunkIdx expected=${nonEmptyIndices.size} got=${lines.size} batchId=$batchId, line-by-line fallback",
                )
                translateChunkSequential(chunk)
            }
        } catch (e: GtxTimeoutException) {
            throw e
        } catch (e: GtxRateLimitException) {
            throw e
        } catch (e: Exception) {
            NrmFileLogger.warn("gtx", "chunk_err chunkIdx=$chunkIdx err=${e.message} batchId=$batchId, line-by-line fallback")
            translateChunkSequential(chunk)
        }
    }

    /** 청크 내 줄별 순차 (fallback) */
    private fun translateChunkSequential(chunk: List<String>): Pair<List<String>, List<String>> {
        val txts = ArrayList<String>(chunk.size)
        val langs = ArrayList<String>(chunk.size)
        chunk.forEach { line ->
            val trimmed = line.trim()
            if (trimmed.isEmpty()) {
                txts.add(""); langs.add("EN")
            } else {
                val (t, l) = translateOne(trimmed)
                txts.add(t); langs.add(l)
            }
        }
        return Pair(txts, langs)
    }

    /** 전체 줄별 순차 (청크 방식 자체 실패 시 최후 fallback) */
    private fun translateSequential(texts: List<String>, lineDelayMs: Long, batchId: String): TranslateResult {
        val txts = ArrayList<String>(texts.size)
        val langs = ArrayList<String>(texts.size)
        texts.forEachIndexed { idx, line ->
            if (idx > 0 && lineDelayMs > 0) Thread.sleep(lineDelayMs)
            val trimmed = line.trim()
            if (trimmed.isEmpty()) {
                txts.add(""); langs.add("EN")
            } else {
                NrmFileLogger.log("gtx", "seq_req seq=$idx textLen=${trimmed.length} batchId=$batchId")
                val t0 = System.currentTimeMillis()
                val (t, l) = translateOne(trimmed)
                NrmFileLogger.log("gtx", "seq_resp seq=$idx elapsedMs=${System.currentTimeMillis() - t0} batchId=$batchId")
                txts.add(t); langs.add(l)
            }
        }
        NrmFileLogger.log("gtx", "batch_done_sequential batchId=$batchId okCount=${txts.size}")
        return TranslateResult(txts, langs)
    }

    // ── HTTP ───────────────────────────────────────────────────────────────────

    private fun translateOne(text: String): Pair<String, String> {
        val encoded = java.net.URLEncoder.encode(text, "UTF-8")
        val urlStr = "$GTX_BASE?client=gtx&sl=auto&tl=ko&dt=t&q=$encoded"
        val conn = URL(urlStr).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "GET"
            conn.connectTimeout = CONNECT_MS
            conn.readTimeout = READ_MS
            conn.setRequestProperty("User-Agent", "Mozilla/5.0")
            conn.instanceFollowRedirects = true

            val status = try {
                conn.responseCode
            } catch (e: SocketTimeoutException) {
                throw GtxTimeoutException("fetch timeout ${READ_MS}ms (connect)")
            }

            // 429 → 재시도 없이 즉시 실패
            if (status == 429) throw GtxRateLimitException("HTTP 429 rate limited")
            if (status !in 200..299) throw GtxHttpException("HTTP $status", status)

            val body = try {
                BufferedReader(InputStreamReader(conn.inputStream, "UTF-8")).use { it.readText() }
            } catch (e: SocketTimeoutException) {
                throw GtxTimeoutException("fetch timeout ${READ_MS}ms (read)")
            }

            return parseGtxResponse(body)
        } catch (e: SocketTimeoutException) {
            throw GtxTimeoutException("fetch timeout ${READ_MS}ms")
        } finally {
            conn.disconnect()
        }
    }

    /**
     * GTX 응답: `[[[seg, orig, ...], ...], null, "EN", ...]`
     * 모든 segment의 [0]을 이어붙임. \n 구분 입력이면 \n이 그대로 포함되어 있음.
     */
    private fun parseGtxResponse(body: String): Pair<String, String> {
        return try {
            val root = JSONArray(body)
            val segments = root.optJSONArray(0) ?: return Pair("", "EN")
            val sb = StringBuilder()
            for (i in 0 until segments.length()) {
                val seg = segments.optJSONArray(i) ?: continue
                val part = seg.optString(0, "")
                if (part.isNotEmpty()) sb.append(part)
            }
            val sourceLang = root.optString(2, "EN").uppercase()
            Pair(sb.toString().trim(), sourceLang)
        } catch (_: Exception) {
            Pair("", "EN")
        }
    }
}
