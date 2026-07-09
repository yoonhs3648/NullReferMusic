package com.nullrefer.music.ondevice

import android.content.Context
import android.os.Build
import com.nullrefer.music.BuildConfig
import com.nullrefer.music.NrmBrand
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipInputStream

/**
 * Android arm64-v8a eSpeak NG (오프라인 FA 전처리용).
 * wav2vec2-base / aeneas 와 동일하게 GitHub Release + [NrmResilientHttpDownload].
 */
object EspeakBootstrap {
  private val ensureLock = Any()

  data class EspeakPaths(
      val binary: File,
      val libDir: File,
      val dataDir: File,
      val installMarker: File,
  ) {
    fun hasInstalledFiles(): Boolean {
      val lib = File(libDir, "libespeak-ng.so")
      return binary.isFile &&
          binary.length() >= 50_000L &&
          lib.isFile &&
          lib.length() >= 200_000L &&
          dataDir.isDirectory &&
          File(dataDir, "phondata").isFile
    }

    fun isReady(): Boolean = hasInstalledFiles() && installMarker.isFile
  }

  fun pathsIfReady(context: Context): EspeakPaths? {
    val paths = buildPaths(context)
    if (!paths.isReady()) return null
    NrmExecutableFile.ensureExecMode(paths.binary, NrmExecutableFile.PROBE_HELP)
    return paths
  }

  fun ensure(context: Context, onProgress: ((Int) -> Unit)? = null): EspeakPaths? {
    pathsIfReady(context)?.let { return it }

    synchronized(ensureLock) {
      pathsIfReady(context)?.let { return it }

      val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
      if (!abi.startsWith("arm64")) {
        NrmFileLogger.warn("espeak", "지원 ABI 아님: $abi (arm64-v8a만 다운로드)")
        return null
      }

      val paths = buildPaths(context)
      wipeInstall(paths)

      if (copyFromAssets(context, paths) && paths.hasInstalledFiles()) {
        paths.installMarker.writeText("ok")
        NrmExecutableFile.ensureExecMode(paths.binary, NrmExecutableFile.PROBE_HELP)
        onProgress?.invoke(100)
        NrmFileLogger.log("espeak", "assets 부트스트랩 OK")
        return paths
      }

      return try {
        downloadAndInstall(context, paths, onProgress)
      } catch (e: Exception) {
        NrmFileLogger.error("espeak", "부트스트랩 실패", e)
        wipeInstall(paths)
        null
      }
    }
  }

  private fun downloadAndInstall(
      context: Context,
      paths: EspeakPaths,
      onProgress: ((Int) -> Unit)?,
  ): EspeakPaths? {
    val staging = File(paths.installMarker.parentFile, "staging")
    staging.mkdirs()
    onProgress?.invoke(0)

    var totalBytes = 0L
    val knownSizes = mutableMapOf<String, Long>()
    for (spec in EspeakNgCatalog.ASSETS) {
      val size = probeContentLength(spec.url)
      if (size > 0) {
        knownSizes[spec.fileName] = size
        totalBytes += size
      }
    }

    var doneBytes = 0L
    for (spec in EspeakNgCatalog.ASSETS) {
      val dest = File(staging, spec.fileName)
      val fileTotal = knownSizes[spec.fileName] ?: 0L
      val ok =
          downloadAsset(
              context = context,
              spec = spec,
              dest = dest,
              doneBytes = doneBytes,
              totalBytes = totalBytes,
              fileTotalBytes = fileTotal,
              onProgress = onProgress,
          )
      if (!ok) throw IllegalStateException("espeak 다운로드 실패: ${spec.fileName}")
      doneBytes += knownSizes[spec.fileName] ?: dest.length()

      when {
        spec.extractZip -> extractZip(dest, paths.dataDir)
        spec.fileName == "libespeak-ng.so" -> {
          val lib = File(paths.libDir, spec.fileName)
          NrmExecutableFile.prepareWritable(lib)
          dest.copyTo(lib, overwrite = true)
        }
        spec.fileName == "espeak-ng" -> {
          NrmExecutableFile.prepareWritable(paths.binary)
          dest.copyTo(paths.binary, overwrite = true)
        }
      }
    }

    staging.deleteRecursively()
    if (!paths.hasInstalledFiles()) {
      val lib = File(paths.libDir, "libespeak-ng.so")
      throw IllegalStateException(
          "espeak 검증 실패 bin=${paths.binary.length()} lib=${lib.length()} " +
              "phondata=${File(paths.dataDir, "phondata").isFile}",
      )
    }
    paths.installMarker.writeText("ok")
    NrmExecutableFile.ensureExecMode(paths.binary, NrmExecutableFile.PROBE_HELP)
    onProgress?.invoke(100)
    NrmFileLogger.log("espeak", "부트스트랩 OK path=${paths.binary.absolutePath}")
    return paths
  }

  private fun downloadAsset(
      context: Context,
      spec: EspeakNgCatalog.AssetSpec,
      dest: File,
      doneBytes: Long,
      totalBytes: Long,
      fileTotalBytes: Long,
      onProgress: ((Int) -> Unit)?,
  ): Boolean {
    val tmp = File(dest.parentFile, "${spec.fileName}.download")
    if (dest.isFile && dest.length() >= spec.minBytes) return true
    if (dest.isFile) dest.delete()
    NrmFileLogger.log("espeak", "asset_download_start file=${spec.fileName}")
    return NrmResilientHttpDownload.download(
        context = context,
        tag = "espeak",
        urlStr = spec.url,
        tmp = tmp,
        dest = dest,
        minBytes = spec.minBytes,
        onProgress = { pct, _, _ ->
          val overall =
              if (totalBytes > 0 && fileTotalBytes > 0) {
                val fileAbsolute = (fileTotalBytes * pct) / 100L
                ((doneBytes + fileAbsolute) * 100 / totalBytes).toInt().coerceIn(0, 99)
              } else {
                pct
              }
          onProgress?.invoke(overall)
        },
        isValid = { f -> f.isFile && f.length() >= spec.minBytes },
        readTimeoutMs = 600_000,
    )
  }

  private fun probeContentLength(urlStr: String): Long {
    return try {
      val conn = java.net.URL(urlStr).openConnection() as java.net.HttpURLConnection
      conn.connectTimeout = 15_000
      conn.readTimeout = 15_000
      conn.requestMethod = "HEAD"
      conn.instanceFollowRedirects = true
      conn.setRequestProperty("User-Agent", NrmBrand.userAgent(BuildConfig.VERSION_NAME))
      conn.connect()
      val len = conn.contentLengthLong
      conn.disconnect()
      len.coerceAtLeast(0L)
    } catch (_: Exception) {
      0L
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

  private fun wipeInstall(paths: EspeakPaths) {
    NrmExecutableFile.prepareWritable(paths.binary)
    val lib = File(paths.libDir, "libespeak-ng.so")
    NrmExecutableFile.prepareWritable(lib)
    if (paths.binary.exists()) paths.binary.delete()
    if (lib.exists()) lib.delete()
    paths.installMarker.delete()
    if (paths.dataDir.isDirectory) paths.dataDir.deleteRecursively()
    File(paths.installMarker.parentFile, "staging").deleteRecursively()
  }

  private fun copyFromAssets(context: Context, paths: EspeakPaths): Boolean {
    return try {
      val lib = File(paths.libDir, "libespeak-ng.so")
      copyAssetIfPresent(context, "espeak-ng/libespeak-ng.so", lib) &&
          copyAssetIfPresent(context, "espeak-ng/espeak-ng", paths.binary) &&
          copyAssetTreeIfPresent(context, "espeak-ng/espeak-data", paths.dataDir) &&
          File(paths.dataDir, "phondata").isFile
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
        var name = entry.name.replace('\\', '/')
        if (name.startsWith("espeak-ng-data/")) {
          name = name.removePrefix("espeak-ng-data/")
        }
        if (name.isNotEmpty() && name != "espeak-ng-data") {
          val out = File(destDir, name)
          if (entry.isDirectory) {
            out.mkdirs()
          } else {
            out.parentFile?.mkdirs()
            out.outputStream().use { zis.copyTo(it) }
          }
        }
        zis.closeEntry()
        entry = zis.nextEntry
      }
    }
  }
}
