package com.nullrefer.music.ondevice

import android.content.Context
import android.os.Build
import com.nullrefer.music.BuildConfig
import com.nullrefer.music.NrmBrand
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

/**
 * Android arm64-v8a eSpeak NG (오프라인 FA 전처리용).
 * APK에 대용량 data를 넣지 않고 GitHub Release에서 다운로드한다.
 */
object EspeakBootstrap {
  private const val VERSION = "1.52.0"
  private const val MIN_BIN_BYTES = 80_000L
  private const val MIN_LIB_BYTES = 200_000L
  private const val MIN_DATA_BYTES = 5_000_000L
  private const val BASE_URL =
      "https://github.com/yoonhs3648/NullReferMusic/releases/download/espeak-ng-v1"

  private val ensureLock = Any()

  data class EspeakPaths(
      val binary: File,
      val libDir: File,
      val dataDir: File,
      val installMarker: File,
  ) {
    fun isReady(): Boolean {
      val lib = File(libDir, "libespeak-ng.so")
      return binary.isFile &&
          binary.length() >= MIN_BIN_BYTES &&
          lib.isFile &&
          lib.length() >= MIN_LIB_BYTES &&
          dataDir.isDirectory &&
          dataDir.list()?.isNotEmpty() == true &&
          installMarker.isFile
    }
  }

  fun pathsIfReady(context: Context): EspeakPaths? {
    val paths = buildPaths(context)
    if (!paths.isReady()) return null
    NrmExecutableFile.ensureExecMode(paths.binary, NrmExecutableFile.PROBE_HELP)
    return paths
  }

  fun ensure(context: Context): EspeakPaths? {
    pathsIfReady(context)?.let { return it }

    synchronized(ensureLock) {
      pathsIfReady(context)?.let { return it }

      val paths = buildPaths(context)
      val bin = paths.binary
      val lib = File(paths.libDir, "libespeak-ng.so")
      val marker = paths.installMarker

      NrmExecutableFile.prepareWritable(bin)
      NrmExecutableFile.prepareWritable(lib)
      if (bin.exists()) bin.delete()
      if (lib.exists()) lib.delete()
      marker.delete()
      if (paths.dataDir.isDirectory) paths.dataDir.deleteRecursively()

      if (copyFromAssets(context, bin, lib, paths.dataDir) && paths.isReady()) {
        marker.writeText("ok")
        NrmExecutableFile.ensureExecMode(bin, NrmExecutableFile.PROBE_HELP)
        NrmFileLogger.log("espeak", "assets 부트스트랩 OK path=${bin.absolutePath}")
        return paths
      }

      val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
      if (!abi.startsWith("arm64")) {
        NrmFileLogger.warn("espeak", "지원 ABI 아님: $abi (arm64-v8a만 다운로드)")
        return null
      }

      return try {
        NrmFileLogger.log("espeak", "다운로드 시작 version=$VERSION abi=$abi")
        downloadFile("$BASE_URL/espeak-ng", bin, null)
        downloadFile("$BASE_URL/libespeak-ng.so", lib, null)
        val dataZip = File(paths.dataDir.parentFile, "espeak-data.zip")
        downloadFile("$BASE_URL/espeak-data.zip", dataZip, null)
        extractZip(dataZip, paths.dataDir)
        dataZip.delete()
        if (!paths.isReady()) {
          throw IllegalStateException(
              "espeak 검증 실패 bin=${bin.length()} lib=${lib.length()} data=${dirSize(paths.dataDir)}",
          )
        }
        marker.writeText("ok")
        NrmExecutableFile.ensureExecMode(bin, NrmExecutableFile.PROBE_HELP)
        NrmFileLogger.log("espeak", "부트스트랩 OK path=${bin.absolutePath}")
        paths
      } catch (e: Exception) {
        NrmFileLogger.error("espeak", "부트스트랩 실패", e)
        bin.delete()
        lib.delete()
        marker.delete()
        paths.dataDir.deleteRecursively()
        null
      }
    }
  }

  private fun buildPaths(context: Context): EspeakPaths {
    val execDir = NrmExecutableFile.execBaseDir(context, "espeak-ng")
    val root = NrmExecutableFile.stagingBaseDir(context, "espeak-ng")
    val dataDir = File(root, "espeak-data")
    val marker = File(root, ".installed")
    dataDir.mkdirs()
    return EspeakPaths(File(execDir, "espeak-ng"), execDir, dataDir, marker)
  }

  private fun copyFromAssets(
      context: Context,
      bin: File,
      lib: File,
      dataDir: File,
  ): Boolean {
    return try {
      copyAssetIfPresent(context, "espeak-ng/espeak-ng", bin) &&
          copyAssetIfPresent(context, "espeak-ng/libespeak-ng.so", lib) &&
          copyAssetTreeIfPresent(context, "espeak-ng/espeak-data", dataDir) &&
          dataDir.isDirectory &&
          dataDir.list()?.isNotEmpty() == true
    } catch (e: Exception) {
      NrmFileLogger.warn("espeak", "assets 복사 실패: ${e.message}")
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

  private fun copyAssetTreeIfPresent(context: Context, assetPrefix: String, destDir: File): Boolean {
    return try {
      val children = context.assets.list(assetPrefix) ?: return false
      if (children.isEmpty()) return false
      destDir.mkdirs()
      for (child in children) {
        val childPath = "$assetPrefix/$child"
        val sub = context.assets.list(childPath)
        val out = File(destDir, child)
        if (sub != null && sub.isNotEmpty()) {
          copyAssetTreeIfPresent(context, childPath, out)
        } else {
          copyAssetIfPresent(context, childPath, out)
        }
      }
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun extractZip(zipFile: File, destDir: File) {
    destDir.mkdirs()
    ZipInputStream(zipFile.inputStream()).use { zis ->
      var entry = zis.nextEntry
      while (entry != null) {
        val out = File(destDir, entry.name)
        if (entry.isDirectory) {
          out.mkdirs()
        } else {
          out.parentFile?.mkdirs()
          out.outputStream().use { zis.copyTo(it) }
        }
        zis.closeEntry()
        entry = zis.nextEntry
      }
    }
  }

  private fun dirSize(dir: File): Long {
    if (!dir.isDirectory) return 0L
    return dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
  }

  private fun downloadFile(
      urlStr: String,
      dest: File,
      onProgress: ((Int) -> Unit)?,
  ) {
    val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
      connectTimeout = 60_000
      readTimeout = 600_000
      instanceFollowRedirects = true
      setRequestProperty("User-Agent", NrmBrand.userAgent(BuildConfig.VERSION_NAME))
    }
    conn.connect()
    if (conn.responseCode !in 200..299) {
      throw Exception("espeak 다운로드 실패: HTTP ${conn.responseCode} ($urlStr)")
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
      }
    }
  }
}
