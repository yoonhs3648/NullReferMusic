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

object FfmpegBootstrap {
  private const val MIN_BYTES = 500_000L

  fun ensure(context: Context): String {
    val baseDir = File(context.filesDir, "ffmpeg")
    val bin = File(baseDir, "ffmpeg")
    if (bin.exists() && bin.length() > MIN_BYTES) {
      bin.setExecutable(true, false)
      return baseDir.absolutePath
    }
    baseDir.mkdirs()
    if (bin.exists()) {
      bin.delete()
    }

    val slug = ffmpegSlugForAbi()
    val urlStr =
      "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n7.1-latest-$slug-gpl.tar.xz"

    val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
      connectTimeout = 120_000
      readTimeout = 900_000
      instanceFollowRedirects = true
    }
    conn.connect()
    if (conn.responseCode !in 200..299) {
      throw Exception("ffmpeg 다운로드 실패: HTTP ${conn.responseCode}")
    }

    conn.inputStream.use { raw ->
      BufferedInputStream(raw).use { bis ->
        XZCompressorInputStream(bis).use { xz ->
          TarArchiveInputStream(xz).use { tar ->
            var entry = tar.getNextEntry() as? TarArchiveEntry
            while (entry != null) {
              val name = entry.name
              if (!entry.isDirectory && name.endsWith("/bin/ffmpeg")) {
                FileOutputStream(bin).use { out -> IOUtils.copy(tar, out) }
                break
              }
              entry = tar.getNextEntry() as? TarArchiveEntry
            }
          }
        }
      }
    }

    if (!bin.exists() || bin.length() < MIN_BYTES) {
      throw Exception("아카이브에서 ffmpeg 바이너리를 찾지 못했습니다.")
    }
    bin.setExecutable(true, false)
    return baseDir.absolutePath
  }

  private fun ffmpegSlugForAbi(): String {
    val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
    return when {
      abi.startsWith("arm64") -> "androidarm64"
      abi.startsWith("armeabi") -> "androidarm"
      abi == "x86_64" -> "androidx86_64"
      abi == "x86" -> "androidx86"
      else -> "androidarm64"
    }
  }
}
