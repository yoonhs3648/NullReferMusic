package com.nullrefer.music.ondevice

import android.content.Context
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL

/**
 * 대용량 HTTP 다운로드 — Wi‑Fi 끊김·데이터 전환 시 자동 재시도.
 * APK 등 대용량은 **Range 이어받기**로 재시도 시 tmp를 버리지 않는다 (progress 리셋·전체 재다운로드 방지).
 */
object NrmResilientHttpDownload {
  private const val MAX_ATTEMPTS = 16
  private const val RETRY_DELAY_MS = 1500L
  private const val WAIT_NETWORK_MS = 120_000L
  private const val BUFFER_BYTES = 1024 * 1024

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
    // 이전 세션에서 거의 다 받은 tmp가 이미 유효하면 rename만 (재다운로드 방지)
    if (tmp.isFile && isValid(tmp)) {
      if (dest.isFile) dest.delete()
      if (!tmp.renameTo(dest)) {
        tmp.copyTo(dest, overwrite = true)
        tmp.delete()
      }
      if (isValid(dest)) {
        NrmFileLogger.log(tag, "download_reuse_tmp bytes=${dest.length()}")
        onProgress(100, 1, MAX_ATTEMPTS)
        return true
      }
    }
    var peakPct = 0
    val progressGate: (Int, Int, Int) -> Unit = { pct, attempt, maxAttempts ->
      val clamped = pct.coerceIn(0, 100)
      if (clamped >= peakPct) {
        peakPct = clamped
        onProgress(peakPct, attempt, maxAttempts)
      }
    }
    for (attempt in 1..MAX_ATTEMPTS) {
      if (attempt > 1) {
        NrmFileLogger.log(
            tag,
            "download_retry attempt=$attempt/$MAX_ATTEMPTS resumeBytes=${tmp.length().coerceAtLeast(0)} url=${urlStr.take(96)}",
        )
        if (!NrmNetworkConnectivity.waitUntilConnected(context, WAIT_NETWORK_MS)) {
          NrmFileLogger.warn(tag, "download_retry_aborted no_network")
          break
        }
        Thread.sleep(RETRY_DELAY_MS)
      }
      when (
          attemptOnce(
              tag,
              urlStr,
              tmp,
              dest,
              minBytes,
              attempt,
              progressGate,
              isValid,
              requestHeaders,
              connectTimeoutMs,
              readTimeoutMs,
              expectedBytes,
          )) {
        AttemptOutcome.SUCCESS ->
            if (isValid(dest)) {
              progressGate(100, attempt, MAX_ATTEMPTS)
              return true
            }
        AttemptOutcome.FATAL -> break
        AttemptOutcome.RETRY -> {
          // tmp 유지 → Range resume (이어받기). 손상으로 rename 실패한 dest만 정리.
          if (dest.isFile && !isValid(dest)) dest.delete()
        }
      }
    }
    // 최종 실패 시에만 tmp 정리 — 다음 앱 실행 시 이어받을 수 있게 남기고 싶으면 보존해도 됨.
    // 여기서는 실패 표시 후 재시도(다시 시도)에서 resume 하도록 tmp 유지.
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
      val existing = if (tmp.isFile) tmp.length().coerceAtLeast(0L) else 0L
      val conn =
          (URL(urlStr).openConnection() as HttpURLConnection).apply {
            this.connectTimeout = connectTimeoutMs
            this.readTimeout = readTimeoutMs
            instanceFollowRedirects = true
            requestMethod = "GET"
            for ((k, v) in requestHeaders) {
              setRequestProperty(k, v)
            }
            if (existing > 0L) {
              setRequestProperty("Range", "bytes=$existing-")
            }
          }
      conn.connect()
      val code = conn.responseCode
      if (code !in 200..299) {
        conn.disconnect()
        NrmFileLogger.warn(tag, "download_http_$code resume=$existing url=${urlStr.take(96)}")
        // 416: Range 불가 → tmp 지우고 다음 시도에 전체 다운로드
        if (code == 416) {
          tmp.delete()
          return AttemptOutcome.RETRY
        }
        return if (code >= 500 || code == 408) AttemptOutcome.RETRY else AttemptOutcome.FATAL
      }

      val resumed = code == 206 && existing > 0L
      if (existing > 0L && !resumed && code == 200) {
        // 서버가 Range 미지원 — 처음부터 덮어쓰기
        NrmFileLogger.log(tag, "download_no_range server_ignored_range existing=$existing")
        tmp.delete()
      }

      val headerTotal =
          when {
            code == 206 -> {
              // Content-Range: bytes start-end/total
              parseContentRangeTotal(conn.getHeaderField("Content-Range"))
                  ?: (existing + conn.contentLengthLong.coerceAtLeast(0L))
            }
            else -> conn.contentLengthLong.coerceAtLeast(0L)
          }
      val total =
          when {
            headerTotal >= minBytes -> headerTotal
            expectedBytes >= minBytes -> expectedBytes
            minBytes > 0 -> minBytes
            else -> 0L
          }

      var copied =
          if (resumed) {
            existing
          } else {
            0L
          }
      var lastPct = -1
      if (resumed && total > 0) {
        lastPct = ((copied * 100) / total).toInt().coerceIn(0, 99)
        onProgress(lastPct, attempt, MAX_ATTEMPTS)
      }

      val append = resumed
      BufferedInputStream(conn.inputStream, BUFFER_BYTES).use { input ->
        if (append) {
          RandomAccessFile(tmp, "rw").use { raf ->
            raf.seek(existing)
            val buffer = ByteArray(BUFFER_BYTES)
            while (true) {
              val read = input.read(buffer)
              if (read <= 0) break
              raf.write(buffer, 0, read)
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
        } else {
          FileOutputStream(tmp).use { output ->
            val buffer = ByteArray(BUFFER_BYTES)
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
      }
      conn.disconnect()

      if (!tmp.isFile || !isValid(tmp)) {
        NrmFileLogger.warn(tag, "download_invalid_tmp bytes=${tmp.length()} min=$minBytes")
        // incomplete이면 tmp 유지하고 retry (resume)
        return AttemptOutcome.RETRY
      }
      if (dest.isFile) dest.delete()
      if (!tmp.renameTo(dest)) {
        tmp.copyTo(dest, overwrite = true)
        tmp.delete()
      }
      if (isValid(dest)) AttemptOutcome.SUCCESS else AttemptOutcome.RETRY
    } catch (e: IOException) {
      NrmFileLogger.warn(tag, "download_io_retry resume=${tmp.length()} ${e.message?.take(120)}")
      AttemptOutcome.RETRY
    } catch (e: Exception) {
      NrmFileLogger.error(tag, "download_fatal ${e.message?.take(120)}", e)
      AttemptOutcome.FATAL
    }
  }

  private fun parseContentRangeTotal(header: String?): Long? {
    if (header.isNullOrBlank()) return null
    // bytes 0-99/12345  or bytes 100-199/*
    val slash = header.lastIndexOf('/')
    if (slash < 0 || slash >= header.lastIndex) return null
    val totalStr = header.substring(slash + 1).trim()
    if (totalStr == "*") return null
    return totalStr.toLongOrNull()?.takeIf { it > 0L }
  }
}
