package com.nullrefer.music.ondevice



import java.io.BufferedReader

import java.io.InputStreamReader

import java.io.OutputStreamWriter

import java.net.HttpURLConnection

import java.net.URL

import java.nio.charset.StandardCharsets

import org.json.JSONArray

import org.json.JSONObject



/**

 * DeepL /v2/translate — LRC `[타임] 가사` 한 줄당 text[] 1슬롯, HTTP 요청당 최대 50줄.

 */

object NrmDeepLClient {

  private const val FREE_BASE = "https://api-free.deepl.com/v2"

  private const val PRO_BASE = "https://api.deepl.com/v2"

  private const val CONNECT_MS = 30_000

  private const val READ_MS = 120_000

  /** DeepL: 요청당 text 최대 50 */

  private const val MAX_LINES_PER_REQUEST = 50

  private const val MAX_BODY_BYTES = 120 * 1024

  /** ~20 req/s */

  private const val INTER_REQUEST_MS = 50L



  data class TranslateResult(
      val texts: List<String>,
      val sourceLangs: List<String>,
      val apiUsed: String,
  )



  class DeepLException(message: String, val httpStatus: Int = 0) : Exception(message)



  fun translateAll(apiKey: String, lines: List<String>): TranslateResult {

    val key = apiKey.trim()

    if (key.isEmpty()) throw DeepLException("API 토큰이 비어 있습니다.")

    if (lines.isEmpty()) return TranslateResult(emptyList(), emptyList(), "free")



    val chunks = chunkLines(lines)

    val merged = ArrayList<String>(lines.size)
    val mergedSourceLangs = ArrayList<String>(lines.size)

    var apiUsed = "free"

    chunks.forEachIndexed { index, chunk ->

      if (index > 0) Thread.sleep(INTER_REQUEST_MS)

      val batch = translateOneBatch(key, chunk)

      if (batch.texts.size != chunk.size) {

        throw DeepLException("DeepL 번역 결과 개수가 요청과 일치하지 않습니다.")

      }

      merged.addAll(batch.texts)
      mergedSourceLangs.addAll(batch.sourceLangs)

      if (batch.apiUsed == "pro") apiUsed = "pro"

    }

    return TranslateResult(merged, mergedSourceLangs, apiUsed)

  }



  private fun chunkLines(lines: List<String>): List<List<String>> {

    val out = ArrayList<List<String>>()

    var current = ArrayList<String>()

    var currentBytes = estimateJsonBytes(emptyList())



    fun flush() {

      if (current.isNotEmpty()) {

        out.add(current)

        current = ArrayList()

        currentBytes = estimateJsonBytes(emptyList())

      }

    }



    for (line in lines) {

      val addBytes = JSONObject.quote(line).length + 1

      val wouldCount = current.size + 1

      val wouldBytes = currentBytes + addBytes

      if (current.isNotEmpty() &&

          (wouldCount > MAX_LINES_PER_REQUEST || wouldBytes > MAX_BODY_BYTES)) {

        flush()

      }

      current.add(line)

      currentBytes = estimateJsonBytes(current)

    }

    flush()

    return out

  }



  private fun estimateJsonBytes(lines: List<String>): Int {

    var n = 96

    for (line in lines) {

      n += JSONObject.quote(line).length + 1

    }

    return n

  }



  private fun translateOneBatch(apiKey: String, lines: List<String>): TranslateResult {

    val payload =

        JSONObject()

            .put("text", JSONArray(lines))

            .put("target_lang", "KO")

            // source_lang 생략 — DeepL 자동 감지

            .put("preserve_formatting", true)

            .put("split_sentences", "nonewlines")

            .toString()



    var res = postTranslate("$FREE_BASE/translate", apiKey, payload)

    var apiUsed = "free"

    if (res.status == 403 || res.status == 404) {

      res = postTranslate("$PRO_BASE/translate", apiKey, payload)

      apiUsed = "pro"

    }

    if (res.status !in 200..299) {

      throw DeepLException(httpMessage(res.status), res.status)

    }

    val arr = JSONObject(res.body).optJSONArray("translations")

        ?: throw DeepLException("DeepL 응답에 translations가 없습니다.")

    val out = ArrayList<String>(lines.size)
    val sourceLangs = ArrayList<String>(lines.size)

    for (i in lines.indices) {

      out.add(arr.optJSONObject(i)?.optString("text")?.trim() ?: "")
      sourceLangs.add(
          arr.optJSONObject(i)?.optString("detected_source_language")?.trim()?.uppercase() ?: "",
      )

    }

    return TranslateResult(out, sourceLangs, apiUsed)

  }



  private data class HttpResult(val status: Int, val body: String)



  private fun postTranslate(urlStr: String, apiKey: String, jsonBody: String): HttpResult {

    val url = URL(urlStr)

    val conn = url.openConnection() as HttpURLConnection

    try {

      conn.requestMethod = "POST"

      conn.connectTimeout = CONNECT_MS

      conn.readTimeout = READ_MS

      conn.instanceFollowRedirects = true

      conn.setRequestProperty("Authorization", "DeepL-Auth-Key $apiKey")

      conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")

      conn.setRequestProperty("Accept", "application/json")

      conn.setRequestProperty("User-Agent", "NullReferenceMusic/1.0")

      conn.doOutput = true

      OutputStreamWriter(conn.outputStream, StandardCharsets.UTF_8).use { w ->

        w.write(jsonBody)

        w.flush()

      }

      val status = conn.responseCode

      val stream =

          if (status in 200..299) conn.inputStream else conn.errorStream ?: conn.inputStream

      val body =

          BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { r ->

            val sb = StringBuilder()

            var line: String?

            while (r.readLine().also { line = it } != null) {

              sb.append(line)

            }

            sb.toString()

          }

      return HttpResult(status, body)

    } finally {

      conn.disconnect()

    }

  }



  private fun httpMessage(status: Int): String =

      when (status) {

        401, 403 -> "DeepL API 토큰이 올바르지 않습니다."

        429, 456 -> "DeepL 사용량이 초과되었습니다."

        413 -> "DeepL 요청 본문이 너무 큽니다."

        else -> "DeepL 번역 요청에 실패했습니다. (HTTP $status)"

      }

}

