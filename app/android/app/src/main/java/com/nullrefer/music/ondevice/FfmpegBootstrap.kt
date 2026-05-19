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
 * Termux 패키지 저장소의 static ffmpeg 바이너리를 사용합니다.
 * ffmpeg는 yt-dlp의 포맷 변환에 선택적으로 사용되며,
 * 없어도 yt-dlp는 YouTube 원본 오디오 스트림을 직접 저장합니다.
 */
object FfmpegBootstrap {
  private const val MIN_BYTES = 1_000_000L

  // Termux 저장소의 Android static ffmpeg 바이너리
  private const val FFMPEG_URL_ARM64 =
    "https://packages.termux.dev/apt/termux-main/pool/main/f/ffmpeg/ffmpeg_8.1.1_aarch64.deb"
  private const val FFMPEG_URL_ARM =
    "https://packages.termux.dev/apt/termux-main/pool/main/f/ffmpeg/ffmpeg_8.1.1_arm.deb"
  private const val FFMPEG_URL_X86_64 =
    "https://packages.termux.dev/apt/termux-main/pool/main/f/ffmpeg/ffmpeg_8.1.1_x86_64.deb"

  /**
   * ffmpeg 바이너리 경로를 반환합니다.
   * 이미 다운로드된 경우 재사용하고, 없으면 다운로드합니다.
   * 다운로드 실패 시 빈 문자열을 반환 (ffmpeg 없이도 yt-dlp 동작 가능).
   */
  fun ensure(context: Context): String {
    val baseDir = File(context.filesDir, "ffmpeg")
    val bin = File(baseDir, "ffmpeg")
    if (bin.exists() && bin.length() > MIN_BYTES) {
      bin.setExecutable(true, false)
      return baseDir.absolutePath
    }
    baseDir.mkdirs()
    if (bin.exists()) bin.delete()

    return try {
      val debUrl = ffmpegDebUrlForAbi()
      val debFile = File(baseDir, "ffmpeg.deb")
      downloadFile(debUrl, debFile)
      extractFfmpegFromDeb(debFile, bin)
      debFile.delete()

      if (!bin.exists() || bin.length() < MIN_BYTES) {
        throw Exception("ffmpeg 바이너리 추출 실패")
      }
      bin.setExecutable(true, false)
      baseDir.absolutePath
    } catch (e: Exception) {
      // ffmpeg 없이도 yt-dlp는 원본 스트림으로 동작 가능
      android.util.Log.w("FfmpegBootstrap", "ffmpeg 설정 실패 (원본 포맷으로 계속): ${e.message}")
      ""
    }
  }

  private fun downloadFile(urlStr: String, dest: File) {
    val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
      connectTimeout = 60_000
      readTimeout = 300_000
      instanceFollowRedirects = true
    }
    conn.connect()
    if (conn.responseCode !in 200..299) {
      throw Exception("다운로드 실패: HTTP ${conn.responseCode} ($urlStr)")
    }
    conn.inputStream.use { input -> dest.outputStream().use { input.copyTo(it) } }
  }

  /**
   * .deb 아카이브에서 ffmpeg 바이너리를 추출합니다.
   * .deb = ar 아카이브 → data.tar.* → usr/bin/ffmpeg
   */
  private fun extractFfmpegFromDeb(debFile: File, outputBin: File) {
    // .deb는 ar 포맷이지만 data.tar.xz 를 직접 읽는 대신,
    // 파일에서 data.tar.xz 시그니처를 찾아 추출합니다.
    debFile.inputStream().use { fis ->
      val bytes = fis.readBytes()
      // data.tar.xz 시작 시그니처 (xz magic: FD 37 7A 58 5A 00)
      val xzMagic = byteArrayOf(0xFD.toByte(), 0x37, 0x7A, 0x58, 0x5A, 0x00)
      val idx = findBytes(bytes, xzMagic)
      if (idx < 0) throw Exception(".deb에서 xz 데이터를 찾지 못했습니다.")

      val tarInput = TarArchiveInputStream(
        XZCompressorInputStream(bytes.inputStream().also { it.skip(idx.toLong()) })
      )
      tarInput.use { tar ->
        var entry = tar.nextEntry as? TarArchiveEntry
        while (entry != null) {
          if (!entry.isDirectory && (entry.name.endsWith("/ffmpeg") || entry.name == "ffmpeg")) {
            outputBin.outputStream().use { out -> IOUtils.copy(tar, out) }
            return
          }
          entry = tar.nextEntry as? TarArchiveEntry
        }
      }
      throw Exception(".deb 아카이브에서 ffmpeg 바이너리를 찾지 못했습니다.")
    }
  }

  private fun findBytes(haystack: ByteArray, needle: ByteArray): Int {
    outer@ for (i in 0..haystack.size - needle.size) {
      for (j in needle.indices) {
        if (haystack[i + j] != needle[j]) continue@outer
      }
      return i
    }
    return -1
  }

  private fun ffmpegDebUrlForAbi(): String {
    val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
    return when {
      abi.startsWith("arm64") -> FFMPEG_URL_ARM64
      abi.startsWith("armeabi") -> FFMPEG_URL_ARM
      abi == "x86_64" -> FFMPEG_URL_X86_64
      else -> FFMPEG_URL_ARM64
    }
  }
}
