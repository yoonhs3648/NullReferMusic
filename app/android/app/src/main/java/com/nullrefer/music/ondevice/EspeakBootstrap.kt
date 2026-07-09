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
  private const val LIB_NAME = "libespeak-ng.so"
  /** Release .so SONAME — linker가 이름으로 찾을 때 대비 */
  private const val LIB_SONAME = "libttsespeak.so"
  private const val BIN_NAME = "espeak-ng"
  private val ensureLock = Any()

  data class EspeakPaths(
      val binary: File,
      val libDir: File,
      val dataDir: File,
      val installMarker: File,
  ) {
    fun libFile(): File = File(libDir, LIB_NAME)

    fun hasInstalledFiles(): Boolean {
      val lib = libFile()
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
    migrateLegacyArtifacts(context, paths)
    if (!paths.isReady()) return null
    val resolved =
        resolveInstalledBinary(context, paths, readMarkerBinary = true)
            ?: run {
              paths.installMarker.delete()
              EspeakNgExec.invalidateProbeCache()
              NrmFileLogger.warn("espeak", "캐시 프로브 실패 — 재설치 필요")
              return null
            }
    return resolved
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
      wipeInstall(context, paths)

      if (copyFromAssets(context, paths) && paths.hasInstalledFiles()) {
        finalizeInstall(context, paths, onProgress)?.let { return it }
      }

      return try {
        downloadAndInstall(context, paths, onProgress)
      } catch (e: Exception) {
        NrmFileLogger.error("espeak", "부트스트랩 실패", e)
        wipeInstall(context, paths)
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
        spec.fileName == LIB_NAME -> installCopiedFile(dest, paths.libFile(), nativeLib = true)
        spec.fileName == BIN_NAME -> installCopiedFile(dest, paths.binary, nativeLib = false)
      }
    }

    staging.deleteRecursively()
    if (!paths.hasInstalledFiles()) {
      val lib = paths.libFile()
      throw IllegalStateException(
          "espeak 검증 실패 bin=${paths.binary.length()} lib=${lib.length()} " +
              "phondata=${File(paths.dataDir, "phondata").isFile}",
      )
    }
    return finalizeInstall(context, paths, onProgress)
  }

  private fun finalizeInstall(
      context: Context,
      paths: EspeakPaths,
      onProgress: ((Int) -> Unit)? = null,
  ): EspeakPaths? {
    prepareRuntimeArtifacts(paths)
    val resolved = resolveInstalledBinary(context, paths, readMarkerBinary = false)
    if (resolved == null) {
      NrmFileLogger.warn("espeak", "기능 프로브 실패 — 설치 무효")
      wipeInstall(context, paths)
      return null
    }
    return markInstalled(resolved, onProgress)
  }

  /**
   * 직접 실행 → linker → codeCache 미러 순으로 동작하는 바이너리 경로를 고른다.
   * fresh install 시에는 .installed 를 읽지 않는다.
   */
  private fun resolveInstalledBinary(
      context: Context,
      paths: EspeakPaths,
      readMarkerBinary: Boolean,
  ): EspeakPaths? {
    val candidates = linkedSetOf<File>()
    if (readMarkerBinary) {
      readMarkerBinaryPath(paths)?.let { candidates.add(it) }
    }
    candidates.add(paths.binary)

    for (binary in candidates) {
      if (!binary.isFile) continue
      val candidate = paths.copy(binary = binary)
      prepareRuntimeArtifacts(candidate)
      EspeakNgExec.invalidateProbeCache()
      if (EspeakNgExec.probePaths(candidate)) {
        return candidate
      }
    }

    val mirrorSource = paths.binary.takeIf { it.isFile } ?: candidates.firstOrNull { it.isFile }
    if (mirrorSource != null) {
      val companions = nativeCompanionFiles(paths)
      val mirrored =
          NrmExecutableFile.mirrorToExecCache(
              context,
              mirrorSource,
              "espeak-ng-exec",
              companions,
          )
      if (mirrored != null) {
        val mirroredPaths = paths.copy(binary = mirrored)
        prepareRuntimeArtifacts(mirroredPaths)
        EspeakNgExec.invalidateProbeCache()
        if (EspeakNgExec.probePaths(mirroredPaths)) {
          NrmFileLogger.log("espeak", "codeCache 바이너리 미러 사용 path=${mirrored.absolutePath}")
          return mirroredPaths
        }
      }
    }
    return null
  }

  private fun readMarkerBinaryPath(paths: EspeakPaths): File? {
    if (!paths.installMarker.isFile) return null
    return try {
      val text = paths.installMarker.readText().trim()
      when {
        text.isEmpty() || text == "ok" -> null
        else -> File(text).takeIf { it.isFile }
      }
    } catch (e: Exception) {
      NrmFileLogger.warn("espeak", "marker_read_fail err=${e.message?.take(80)}")
      null
    }
  }

  /** lib 권한 + SONAME 별칭 + 바이너리 exec 권한 (whisper 와 동일: code_cache 한 디렉터리) */
  internal fun prepareRuntimeArtifacts(paths: EspeakPaths) {
    val lib = paths.libFile()
    if (lib.isFile) {
      NrmExecutableFile.ensureNativeLibLoadable(lib)
      ensureSonameAlias(lib)
    }
    NrmExecutableFile.prepareForExecution(paths.binary)
  }

  private fun nativeCompanionFiles(paths: EspeakPaths): List<File> {
    val lib = paths.libFile()
    if (!lib.isFile) return emptyList()
    val alias = File(lib.parentFile, LIB_SONAME)
    return if (alias.isFile) listOf(lib, alias) else listOf(lib)
  }

  private fun ensureSonameAlias(lib: File) {
    if (lib.name == LIB_SONAME) return
    val alias = File(lib.parentFile, LIB_SONAME)
    if (alias.isFile && alias.length() == lib.length()) {
      NrmExecutableFile.ensureNativeLibLoadable(alias)
      return
    }
    try {
      alias.parentFile?.mkdirs()
      NrmExecutableFile.prepareWritable(alias)
      lib.inputStream().use { input ->
        FileOutputStream(alias).use { output ->
          input.copyTo(output)
          output.fd.sync()
        }
      }
      NrmExecutableFile.ensureNativeLibLoadable(alias)
    } catch (e: Exception) {
      NrmFileLogger.warn(
          "espeak",
          "soname_alias_fail alias=${alias.absolutePath} err=${e.message?.take(80)}",
      )
    }
  }

  /** 2.5.13~14: files/espeak-ng/native 에 둔 .so → code_cache 로 이전 */
  private fun migrateLegacyArtifacts(context: Context, paths: EspeakPaths) {
    val legacyLib = File(NrmExecutableFile.stagingBaseDir(context, "espeak-ng"), "native/$LIB_NAME")
    val target = paths.libFile()
    if (!target.isFile && legacyLib.isFile) {
      NrmFileLogger.log("espeak", "legacy lib 이전 ${legacyLib.absolutePath}")
      installCopiedFile(legacyLib, target, nativeLib = true)
      prepareRuntimeArtifacts(paths)
    }
  }

  private fun markInstalled(
      paths: EspeakPaths,
      onProgress: ((Int) -> Unit)?,
  ): EspeakPaths {
    writeInstallMarker(paths, paths.binary.absolutePath)
    onProgress?.invoke(100)
    NrmFileLogger.log("espeak", "부트스트랩 OK path=${paths.binary.absolutePath}")
    return paths
  }

  private fun writeInstallMarker(paths: EspeakPaths, binaryPath: String) {
    val parent = paths.installMarker.parentFile ?: return
    parent.mkdirs()
    val tmp = File(parent, ".installed.tmp")
    try {
      tmp.writeText(binaryPath)
      if (paths.installMarker.isFile && !paths.installMarker.delete()) {
        tmp.copyTo(paths.installMarker, overwrite = true)
        tmp.delete()
        return
      }
      if (!tmp.renameTo(paths.installMarker)) {
        tmp.copyTo(paths.installMarker, overwrite = true)
        tmp.delete()
      }
    } catch (e: Exception) {
      tmp.delete()
      NrmFileLogger.error("espeak", "marker_write_fail path=${paths.installMarker.absolutePath}", e)
      throw e
    }
  }

  private fun installCopiedFile(source: File, dest: File, nativeLib: Boolean) {
    dest.parentFile?.mkdirs()
    NrmExecutableFile.prepareWritable(dest)
    source.inputStream().use { input ->
      FileOutputStream(dest).use { output ->
        input.copyTo(output)
        output.fd.sync()
      }
    }
    if (nativeLib) {
      NrmExecutableFile.ensureNativeLibLoadable(dest)
    } else {
      NrmExecutableFile.prepareForExecution(dest)
    }
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
    execDir.mkdirs()
    dataDir.mkdirs()
    // whisper-cli 와 동일: 바이너리·.so 를 code_cache 한 폴더에 둔다 (LD_LIBRARY_PATH 단순화)
    return EspeakPaths(File(execDir, BIN_NAME), execDir, dataDir, marker)
  }

  private fun wipeInstall(context: Context, paths: EspeakPaths) {
    val execDir = NrmExecutableFile.execBaseDir(context, "espeak-ng")
    val mirrorDir = NrmExecutableFile.execBaseDir(context, "espeak-ng-exec")

    for (dir in listOf(execDir, mirrorDir, paths.libDir)) {
      NrmExecutableFile.clearLinkerMarkersInDir(dir)
    }

    val legacyLibDir = File(NrmExecutableFile.stagingBaseDir(context, "espeak-ng"), "native")
    val deleteTargets =
        linkedSetOf(
            paths.binary,
            File(execDir, LIB_NAME),
            File(execDir, LIB_SONAME),
            File(execDir, "$BIN_NAME.use-linker"),
            paths.libFile(),
            File(legacyLibDir, LIB_NAME),
            File(legacyLibDir, LIB_SONAME),
            paths.installMarker,
            File(paths.installMarker.parentFile, ".installed.tmp"),
            File(mirrorDir, BIN_NAME),
            File(mirrorDir, LIB_NAME),
            File(mirrorDir, LIB_SONAME),
        )
    for (target in deleteTargets) {
      NrmExecutableFile.prepareWritable(target)
      if (target.exists()) target.delete()
    }

    if (paths.dataDir.isDirectory) paths.dataDir.deleteRecursively()
    File(paths.installMarker.parentFile, "staging").deleteRecursively()
    EspeakNgExec.invalidateProbeCache()
  }

  private fun copyFromAssets(context: Context, paths: EspeakPaths): Boolean {
    return try {
      val lib = paths.libFile()
      val copied =
          copyAssetIfPresent(context, "espeak-ng/$LIB_NAME", lib) &&
              copyAssetIfPresent(context, "espeak-ng/$BIN_NAME", paths.binary) &&
              copyAssetTreeIfPresent(context, "espeak-ng/espeak-data", paths.dataDir) &&
              File(paths.dataDir, "phondata").isFile
      if (copied) {
        prepareRuntimeArtifacts(paths)
      }
      copied
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
