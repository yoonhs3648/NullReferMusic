package com.nullrefer.music.ondevice

import android.content.Context
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * 대용량 HTTP 다운로드 — Wi‑Fi 끊김·데이터 전환 시 자동 재시도.
 * 시작 시 Wi‑Fi였어도 연결이 끊기면 셀룰러가 붙을 때까지 기다린 뒤 이어 받는다(처음부터 재연결).
 */
object NrmResilientHttpDownload {
  private const val MAX_ATTEMPTS = 16
  private const val RETRY_DELAY_MS = 2500L
  private const val WAIT_NETWORK_MS = 120_000L

  private enum class AttemptOutcome {
    SUCCESS,
    RETRY,
    FATAL,
  }

  fun download(
      context: Context,
      tag: String,
      urlStr: String,
      tmp: File,
      dest: File,
      minBytes: Long,
      onProgress: (pct: Int, attempt: Int, maxAttempts: Int) -> Unit,
      isValid: (File) -> Boolean = { f -> f.isFile && f.length() >= minBytes },
      requestHeaders: Map<String, String> = emptyMap(),
      connectTimeoutMs: Int = 30_000,
      readTimeoutMs: Int = 900_000,
      expectedBytes: Long = 0L,
  ): Boolean {
    if (isValid(dest)) {
      onProgress(100, 1, MAX_ATTEMPTS)
      return true
    }
    for (attempt in 1..MAX_ATTEMPTS) {
      if (attempt > 1) {
        NrmFileLogger.log(
            tag,
            "download_retry attempt=$attempt/$MAX_ATTEMPTS url=${urlStr.take(96)}",
        )
        if (!NrmNetworkConnectivity.waitUntilConnected(context, WAIT_NETWORK_MS)) {
          NrmFileLogger.warn(tag, "download_retry_aborted no_network")
          break
        }
        Thread.sleep(RETRY_DELAY_MS)
      }
      when (attemptOnce(
          tag,
          urlStr,
          tmp,
          dest,
          minBytes,
          attempt,
          onProgress,
          isValid,
          requestHeaders,
          connectTimeoutMs,
          readTimeoutMs,
          expectedBytes,
      )) {
        AttemptOutcome.SUCCESS ->
            if (isValid(dest)) {
              onProgress(100, attempt, MAX_ATTEMPTS)
              return true
            }
        AttemptOutcome.FATAL -> break
        AttemptOutcome.RETRY -> {
          tmp.delete()
          if (dest.isFile && !isValid(dest)) dest.delete()
        }
      }
    }
    tmp.delete()
    if (dest.isFile && !isValid(dest)) dest.delete()
    return false
  }

  private fun attemptOnce(
      tag: String,
      urlStr: String,
      tmp: File,
      dest: File,
      minBytes: Long,
      attempt: Int,
      onProgress: (pct: Int, attempt: Int, maxAttempts: Int) -> Unit,
      isValid: (File) -> Boolean,
      requestHeaders: Map<String, String>,
      connectTimeoutMs: Int,
      readTimeoutMs: Int,
      expectedBytes: Long,
  ): AttemptOutcome {
    return try {
      tmp.parentFile?.mkdirs()
      if (tmp.isFile) tmp.delete()
      val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
        this.connectTimeout = connectTimeoutMs
        this.readTimeout = readTimeoutMs
        instanceFollowRedirects = true
        requestMethod = "GET"
        for ((k, v) in requestHeaders) {
          setRequestProperty(k, v)
        }
      }
      conn.connect()
      val code = conn.responseCode
      if (code !in 200..299) {
        conn.disconnect()
        NrmFileLogger.warn(tag, "download_http_$code url=${urlStr.take(96)}")
        return if (code >= 500 || code == 408) AttemptOutcome.RETRY else AttemptOutcome.FATAL
      }
      val headerTotal = conn.contentLengthLong.coerceAtLeast(0L)
      val total =
          when {
            headerTotal >= minBytes -> headerTotal
            expectedBytes >= minBytes -> expectedBytes
            minBytes > 0 -> minBytes
            else -> 0L
          }
      var copied = 0L
      var lastPct = -1
      BufferedInputStream(conn.inputStream).use { input ->
        FileOutputStream(tmp).use { output ->
          val buffer = ByteArray(256 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            output.write(buffer, 0, read)
            copied += read
            if (total > 0) {
              val pct = ((copied * 100) / total).toInt().coerceIn(0, 99)
              if (pct != lastPct) {
                lastPct = pct
                onProgress(pct, attempt, MAX_ATTEMPTS)
              }
            }
          }
        }
      }
      conn.disconnect()
      if (!tmp.isFile || !isValid(tmp)) {
        NrmFileLogger.warn(tag, "download_invalid_tmp bytes=${tmp.length()} min=$minBytes")
        tmp.delete()
        return AttemptOutcome.RETRY
      }
      if (dest.isFile) dest.delete()
      if (!tmp.renameTo(dest)) {
        tmp.copyTo(dest, overwrite = true)
        tmp.delete()
      }
      if (isValid(dest)) AttemptOutcome.SUCCESS else AttemptOutcome.RETRY
    } catch (e: IOException) {
      NrmFileLogger.warn(tag, "download_io_retry ${e.message?.take(120)}")
      AttemptOutcome.RETRY
    } catch (e: Exception) {
      NrmFileLogger.error(tag, "download_fatal ${e.message?.take(120)}", e)
      AttemptOutcome.FATAL
    }
  }
}
