package com.nullrefer.music.ondevice

import android.content.Context
import android.os.Build
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.xz.XZCompressorInputStream
import org.apache.commons.compress.utils.IOUtils
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * ffmpeg 바이너리를 앱 내부 저장소에서 관리합니다.
 *
 * yt-dlp 포맷 변환(MP3 등)과 메타데이터 태깅에 사용합니다.
 * GitHub BtbN 정적 빌드(linuxarm64 / linux x86_64)를 사용합니다.
 * (Termux APT URL은 기기·시점에 따라 404/500이 발생해 제거)
 */
object FfmpegBootstrap {
  private const val MIN_BYTES = 1_000_000L

  /** BtbN "latest" 리다이렉트 — 릴리스 태그가 바뀌어도 동작 */
  private const val FFMPEG_URL_ARM64 =
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz"
  private const val FFMPEG_URL_X86_64 =
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"

  /**
   * ffmpeg 바이너리가 들어 있는 디렉터리 경로.
   * 실패 시 빈 문자열 (yt-dlp는 원본 오디오만 저장).
   */
  fun ensure(context: Context): String {
    val baseDir = File(context.filesDir, "ffmpeg")
    val bin = File(baseDir, "ffmpeg")
    if (bin.exists() && bin.length() > MIN_BYTES) {
      makeExecutable(bin)
      return baseDir.absolutePath
    }
    baseDir.mkdirs()
    if (bin.exists()) bin.delete()

    return try {
      val tarUrl = ffmpegTarUrlForAbi()
      val tarFile = File(baseDir, "ffmpeg.tar.xz")
      downloadFile(tarUrl, tarFile)
      extractFfmpegFromTarXz(tarFile, bin)
      tarFile.delete()

      if (!bin.exists() || bin.length() < MIN_BYTES) {
        throw Exception("ffmpeg 바이너리 추출 실패")
      }
      makeExecutable(bin)
      baseDir.absolutePath
    } catch (e: Exception) {
      android.util.Log.w("FfmpegBootstrap", "ffmpeg 설정 실패: ${e.message}")
      ""
    }
  }

  fun binaryPath(context: Context): String {
    val dir = ensure(context)
    if (dir.isBlank()) return ""
    val bin = File(dir, "ffmpeg")
    return if (bin.isFile) bin.absolutePath else ""
  }

  private fun makeExecutable(file: File) {
    file.setReadable(true, false)
    file.setExecutable(true, false)
    try {
      ProcessBuilder(listOf("chmod", "755", file.absolutePath))
        .redirectErrorStream(true)
        .start()
        .waitFor()
    } catch (_: Exception) {
    }
  }

  private fun downloadFile(urlStr: String, dest: File) {
    val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
      connectTimeout = 60_000
      readTimeout = 600_000
      instanceFollowRedirects = true
    }
    conn.connect()
    if (conn.responseCode !in 200..299) {
      throw Exception("ffmpeg 다운로드 실패: HTTP ${conn.responseCode}")
    }
    conn.inputStream.use { input -> dest.outputStream().use { input.copyTo(it) } }
  }

  private fun extractFfmpegFromTarXz(tarXzFile: File, outputBin: File) {
    BufferedInputStream(tarXzFile.inputStream()).use { buffered ->
      XZCompressorInputStream(buffered).use { xz ->
        TarArchiveInputStream(xz).use { tar ->
          var entry = tar.nextEntry as? TarArchiveEntry
          while (entry != null) {
            val name = entry.name.replace('\\', '/')
            if (
              !entry.isDirectory &&
              (name.endsWith("/bin/ffmpeg") || name == "bin/ffmpeg" || name.endsWith("/ffmpeg"))
            ) {
              outputBin.parentFile?.mkdirs()
              outputBin.outputStream().use { out -> IOUtils.copy(tar, out) }
              return
            }
            entry = tar.nextEntry as? TarArchiveEntry
          }
        }
      }
    }
    throw Exception("tar.xz에서 ffmpeg 바이너리를 찾지 못했습니다.")
  }

  private fun ffmpegTarUrlForAbi(): String {
    val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
    return when {
      abi.startsWith("arm64") || abi.startsWith("armeabi") -> FFMPEG_URL_ARM64
      abi == "x86_64" -> FFMPEG_URL_X86_64
      else -> FFMPEG_URL_ARM64
    }
  }
}
