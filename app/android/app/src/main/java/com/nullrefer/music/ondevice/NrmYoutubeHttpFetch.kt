package com.nullrefer.music.ondevice

import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.util.zip.GZIPInputStream

/** innertube API — OS 소켓 readTimeout (JS 타이머·AbortSignal 과 무관) */
object NrmYoutubeHttpFetch {
  data class Result(
      val status: Int,
      val body: String,
      val headers: Map<String, String>,
  )

  class HttpTimeoutException(message: String) : IOException(message)

  fun fetch(
      urlStr: String,
      method: String,
      headers: Map<String, String>,
      body: String?,
      connectTimeoutMs: Int,
      readTimeoutMs: Int,
  ): Result {
    val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
      requestMethod = method.uppercase()
      connectTimeout = connectTimeoutMs.coerceIn(1_000, 120_000)
      readTimeout = readTimeoutMs.coerceIn(1_000, 120_000)
      instanceFollowRedirects = true
      doInput = true
      for ((k, v) in headers) {
        if (k.isNotBlank()) setRequestProperty(k, v)
      }
    }

    try {
      if (!body.isNullOrEmpty() && method.uppercase() != "GET" && method.uppercase() != "HEAD") {
        conn.doOutput = true
        conn.outputStream.use { out ->
          out.write(body.toByteArray(Charsets.UTF_8))
          out.flush()
        }
      }

      val code = conn.responseCode
      val stream =
          try {
            if (code in 200..299) conn.inputStream else conn.errorStream
          } catch (_: Exception) {
            null
          }
      val bytes =
          stream?.use { input ->
            val raw =
                if ("gzip".equals(conn.contentEncoding, ignoreCase = true)) {
                  GZIPInputStream(input).use { gz -> gz.readBytes() }
                } else {
                  input.readBytes()
                }
            raw
          } ?: ByteArray(0)
      val text = String(bytes, Charsets.UTF_8)

      val respHeaders = linkedMapOf<String, String>()
      for ((key, values) in conn.headerFields) {
        if (key.isNullOrBlank() || values.isNullOrEmpty()) continue
        respHeaders[key] = values.joinToString(", ")
      }

      return Result(status = code, body = text, headers = respHeaders)
    } catch (e: SocketTimeoutException) {
      throw HttpTimeoutException(e.message ?: "socket_timeout")
    } finally {
      conn.disconnect()
    }
  }
}
