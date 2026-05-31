package com.nullrefer.music.ondevice

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Android arm64-v8a용 FFmpeg (ffmpeg + libffmpeg.so).
 *
 * Termux .deb 방식은 (1) URL 404, (2) control/data tar 혼동, (3) 동적 링크로 단독 실행 불가.
 * [Android-FFmpeg-Prebuilt](https://github.com/hzw1199/Android-FFmpeg-Prebuilt) 정적 빌드를 사용합니다.
 */
object FfmpegBootstrap {
  private const val MIN_BIN_BYTES = 5_000_000L
  private const val MIN_LIB_BYTES = 50_000_000L
  private const val VERSION = "8.0.1"
  private const val BASE_URL =
    "https://raw.githubusercontent.com/hzw1199/Android-FFmpeg-Prebuilt/main/ffmpeg-$VERSION"

  private val ensureLock = Any()

  data class FfmpegPaths(val binary: File, val libDir: File) {
    fun binaryPath(): String = binary.absolutePath
    fun libDirPath(): String = libDir.absolutePath

    fun isReady(): Boolean {
      val lib = File(libDir, "libffmpeg.so")
      return binary.isFile &&
        binary.length() >= MIN_BIN_BYTES &&
        lib.isFile &&
        lib.length() >= MIN_LIB_BYTES
    }
  }

  /** 백그라운드 예열용 — 실패해도 예외를 던지지 않음 */
  fun prefetch(context: Context) {
    Thread {
      try {
        ensure(context)
      } catch (e: Exception) {
        NrmFileLogger.warn("ffmpeg", "prefetch 실패: ${e.message}")
      }
    }.start()
  }

  fun pathsIfReady(context: Context): FfmpegPaths? {
    val dir = NrmExecutableFile.execBaseDir(context, "ffmpeg")
    val bin = File(dir, "ffmpeg")
    val lib = File(dir, "libffmpeg.so")
    if (!isReady(bin, lib)) return null
    NrmExecutableFile.ensureExecMode(bin)
    return FfmpegPaths(bin, dir)
  }

  fun ensure(context: Context): FfmpegPaths? {
    pathsIfReady(context)?.let { cached ->
      if (FfmpegExec.probePaths(cached.binary, cached.libDir)) {
        return cached
      }
      NrmFileLogger.warn("ffmpeg", "캐시 ffmpeg 프로브 실패 — 재다운로드")
      cached.binary.delete()
      File(cached.libDir, "libffmpeg.so").delete()
    }

    synchronized(ensureLock) {
      val dir = NrmExecutableFile.execBaseDir(context, "ffmpeg")
      val bin = File(dir, "ffmpeg")
      val lib = File(dir, "libffmpeg.so")

      pathsIfReady(context)?.let { cached ->
        if (FfmpegExec.probePaths(cached.binary, cached.libDir)) {
          return cached
        }
        bin.delete()
        lib.delete()
      }

      NrmExecutableFile.prepareWritable(bin)
      NrmExecutableFile.prepareWritable(lib)
      if (bin.exists()) bin.delete()
      if (lib.exists()) lib.delete()

      if (copyFromAssets(context, bin, lib) && isReady(bin, lib)) {
        NrmExecutableFile.ensureExecMode(bin)
        if (FfmpegExec.probePaths(bin, dir)) {
          NrmFileLogger.log("ffmpeg", "assets 부트스트랩 OK path=${bin.absolutePath}")
          return FfmpegPaths(bin, dir)
        }
        bin.delete()
        lib.delete()
      }

      val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
      if (!abi.startsWith("arm64")) {
        NrmFileLogger.warn("ffmpeg", "지원 ABI 아님: $abi (arm64-v8a만 런타임 다운로드 지원)")
        return null
      }

      return try {
        NrmFileLogger.log("ffmpeg", "다운로드 시작 version=$VERSION abi=$abi")
        downloadFile("$BASE_URL/bin/ffmpeg", bin) { pct ->
          if (pct % 20 == 0) {
            NrmFileLogger.log("ffmpeg", "ffmpeg 바이너리 다운로드 $pct%")
          }
        }
        downloadFile("$BASE_URL/libffmpeg.so", lib) { pct ->
          if (pct % 20 == 0) {
            NrmFileLogger.log("ffmpeg", "libffmpeg.so 다운로드 $pct%")
          }
        }
        if (!isReady(bin, lib)) {
          throw Exception("다운로드 크기 검증 실패 bin=${bin.length()} lib=${lib.length()}")
        }
        FfmpegEncoderSupport.invalidateCache()
        NrmExecutableFile.ensureExecMode(bin)
        if (!FfmpegExec.probePaths(bin, dir)) {
          throw Exception("ffmpeg 실행 프로브 실패")
        }
        NrmFileLogger.log(
          "ffmpeg",
          "부트스트랩 OK path=${bin.absolutePath} lib=${lib.length()} bytes",
        )
        FfmpegPaths(bin, dir)
      } catch (e: Exception) {
        NrmFileLogger.error("ffmpeg", "부트스트랩 실패", e)
        bin.delete()
        lib.delete()
        null
      }
    }
  }

  fun binaryPath(context: Context): String = ensure(context)?.binaryPath().orEmpty()

  fun libDirPath(context: Context): String = ensure(context)?.libDirPath().orEmpty()

  private fun isReady(bin: File, lib: File): Boolean {
    return bin.isFile &&
      bin.length() >= MIN_BIN_BYTES &&
      lib.isFile &&
      lib.length() >= MIN_LIB_BYTES
  }

  private fun copyFromAssets(context: Context, bin: File, lib: File): Boolean {
    return try {
      copyAssetIfPresent(context, "ffmpeg/ffmpeg", bin) &&
        copyAssetIfPresent(context, "ffmpeg/libffmpeg.so", lib)
    } catch (e: Exception) {
      NrmFileLogger.warn("ffmpeg", "assets 복사 실패: ${e.message}")
      false
    }
  }

  private fun copyAssetIfPresent(context: Context, assetName: String, dest: File): Boolean {
    return try {
      context.assets.open(assetName).use { input ->
        dest.parentFile?.mkdirs()
        FileOutputStream(dest).use { output -> input.copyTo(output) }
      }
      dest.isFile && dest.length() > 0
    } catch (_: Exception) {
      false
    }
  }

  private fun downloadFile(urlStr: String, dest: File, onProgress: ((Int) -> Unit)? = null) {
    val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
      connectTimeout = 60_000
      readTimeout = 600_000
      instanceFollowRedirects = true
      setRequestProperty("User-Agent", "NullReferenceMusic/1.0")
    }
    conn.connect()
    if (conn.responseCode !in 200..299) {
      throw Exception("다운로드 실패: HTTP ${conn.responseCode} ($urlStr)")
    }
    val total = conn.contentLengthLong.coerceAtLeast(0L)
    conn.inputStream.use { input ->
      dest.outputStream().use { output ->
        val buf = ByteArray(256 * 1024)
        var readTotal = 0L
        var lastPct = -1
        while (true) {
          val n = input.read(buf)
          if (n <= 0) break
          output.write(buf, 0, n)
          readTotal += n
          if (total > 0 && onProgress != null) {
            val pct = ((readTotal * 100) / total).toInt().coerceIn(0, 100)
            if (pct != lastPct) {
              lastPct = pct
              onProgress(pct)
            }
          }
        }
        output.flush()
      }
    }
  }
}
