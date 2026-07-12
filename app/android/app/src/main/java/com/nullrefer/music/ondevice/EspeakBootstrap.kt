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
 * wav2vec2-base / Whisper 모델처럼 설치 산출물은 filesDir 에 내구성 보관하고,
 * 실행용 바이너리만 code_cache 에 둔다 (앱 업데이트 시 code_cache 유실 → filesDir 에서 복구).
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
    // 앱 업데이트로 code_cache 가 비면 filesDir 내구성 복사본에서 복구 (whisper 모델과 동일)
    if (!paths.hasInstalledFiles()) {
      restoreExecFromDurable(context, paths)
    } else {
      syncDurableFromExec(context, paths)
    }
    if (!paths.hasInstalledFiles()) {
      if (hasDataPayload(paths) && !hasDurableBinaries(context)) {
        NrmFileLogger.log(
            "espeak",
            "data_ok_bin_missing — 앱 업데이트로 code_cache 유실, 바이너리만 재확보 필요",
        )
      }
      return null
    }
    val resolved =
        resolveInstalledBinary(context, paths, readMarkerBinary = true)
            ?: run {
              if (restoreExecFromDurable(context, paths)) {
                resolveInstalledBinary(context, paths, readMarkerBinary = false)?.let {
                  syncDurableFromExec(context, it)
                  if (!it.installMarker.isFile) {
                    writeInstallMarker(it, it.binary.absolutePath)
                  }
                  return it
                }
              }
              NrmFileLogger.warn("espeak", "캐시 프로브 실패 — 재설치 필요")
              return null
            }
    syncDurableFromExec(context, resolved)
    if (!resolved.installMarker.isFile) {
      writeInstallMarker(resolved, resolved.binary.absolutePath)
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

      // 업데이트로 exec만 사라진 경우: 데이터 유지 + 바이너리만 재다운로드/복구
      if (restoreExecFromDurable(context, paths)) {
        finalizeInstall(context, paths, onProgress)?.let { return it }
      }
      if (hasDataPayload(paths)) {
        NrmFileLogger.log("espeak", "기존 espeak-data 유지 — CLI/lib만 재설치")
        wipeExecArtifacts(context, paths)
        return try {
          downloadBinariesOnly(context, paths, onProgress)
        } catch (e: Exception) {
          NrmFileLogger.error("espeak", "바이너리 재설치 실패", e)
          null
        }
      }

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

  /** 앱 업데이트 후 code_cache 유실 시 — espeak-data 유지하고 CLI/lib만 다시 받는다 */
  private fun downloadBinariesOnly(
      context: Context,
      paths: EspeakPaths,
      onProgress: ((Int) -> Unit)?,
  ): EspeakPaths? {
    val staging = File(paths.installMarker.parentFile, "staging")
    staging.mkdirs()
    onProgress?.invoke(0)
    val specs = EspeakNgCatalog.ASSETS.filter { !it.extractZip }
    var totalBytes = 0L
    val knownSizes = mutableMapOf<String, Long>()
    for (spec in specs) {
      val size = probeContentLength(spec.url)
      if (size > 0) {
        knownSizes[spec.fileName] = size
        totalBytes += size
      }
    }
    var doneBytes = 0L
    for (spec in specs) {
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
      when (spec.fileName) {
        LIB_NAME -> installCopiedFile(dest, paths.libFile(), nativeLib = true)
        BIN_NAME -> installCopiedFile(dest, paths.binary, nativeLib = false)
      }
    }
    staging.deleteRecursively()
    if (!paths.hasInstalledFiles()) {
      throw IllegalStateException(
          "espeak 바이너리 검증 실패 bin=${paths.binary.length()} lib=${paths.libFile().length()}",
      )
    }
    return finalizeInstall(context, paths, onProgress)
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

  private fun finalizeInstall(
      context: Context,
      paths: EspeakPaths,
      onProgress: ((Int) -> Unit)? = null,
  ): EspeakPaths? {
    prepareRuntimeArtifacts(paths)
    var resolved = resolveInstalledBinary(context, paths, readMarkerBinary = false)
    if (resolved == null && tryRepairLibFromNativeLibraryDir(context, paths)) {
      resolved = resolveInstalledBinary(context, paths, readMarkerBinary = false)
    }
    if (resolved == null) {
      NrmFileLogger.warn("espeak", "기능 프로브 실패 — 설치 무효")
      wipeExecArtifacts(context, paths)
      return null
    }
    syncDurableFromExec(context, resolved)
    return markInstalled(resolved, onProgress)
  }

  private fun persistDir(context: Context): File {
    val dir = File(NrmExecutableFile.stagingBaseDir(context, "espeak-ng"), "persist")
    dir.mkdirs()
    return dir
  }

  private fun durableBinary(context: Context): File = File(persistDir(context), BIN_NAME)

  private fun durableLib(context: Context): File = File(persistDir(context), LIB_NAME)

  private fun hasDataPayload(paths: EspeakPaths): Boolean {
    return paths.dataDir.isDirectory && File(paths.dataDir, "phondata").isFile
  }

  private fun hasDurableBinaries(context: Context): Boolean {
    val bin = durableBinary(context)
    val lib = durableLib(context)
    return bin.isFile &&
        bin.length() >= 50_000L &&
        lib.isFile &&
        lib.length() >= 200_000L
  }

  /** 실행용 code_cache → filesDir 내구성 복사 (앱 업데이트 대비) */
  private fun syncDurableFromExec(context: Context, paths: EspeakPaths) {
    val lib = paths.libFile()
    if (!paths.binary.isFile || !lib.isFile) return
    try {
      installCopiedFile(paths.binary, durableBinary(context), nativeLib = false)
      installCopiedFile(lib, durableLib(context), nativeLib = true)
      val alias = File(lib.parentFile, LIB_SONAME)
      if (alias.isFile) {
        installCopiedFile(alias, File(persistDir(context), LIB_SONAME), nativeLib = true)
      }
      NrmFileLogger.log(
          "espeak",
          "durable_sync_ok bin=${durableBinary(context).length()} lib=${durableLib(context).length()}",
      )
    } catch (e: Exception) {
      NrmFileLogger.warn("espeak", "durable_sync_fail err=${e.message?.take(120)}")
    }
  }

  /** 앱 업데이트 후 code_cache 유실 시 filesDir 복사본을 다시 올린다 */
  private fun restoreExecFromDurable(context: Context, paths: EspeakPaths): Boolean {
    if (!hasDurableBinaries(context)) return false
    return try {
      paths.libDir.mkdirs()
      installCopiedFile(durableBinary(context), paths.binary, nativeLib = false)
      installCopiedFile(durableLib(context), paths.libFile(), nativeLib = true)
      val durableAlias = File(persistDir(context), LIB_SONAME)
      if (durableAlias.isFile) {
        installCopiedFile(durableAlias, File(paths.libDir, LIB_SONAME), nativeLib = true)
      }
      prepareRuntimeArtifacts(paths)
      EspeakNgExec.invalidateProbeCache()
      val ok = paths.hasInstalledFiles() && EspeakNgExec.probePaths(paths)
      NrmFileLogger.log(
          "espeak",
          if (ok) "durable_restore_ok path=${paths.binary.absolutePath}"
          else "durable_restore_probe_fail",
      )
      ok
    } catch (e: Exception) {
      NrmFileLogger.warn("espeak", "durable_restore_fail err=${e.message?.take(120)}")
      false
    }
  }

  /** 직접 실행 → linker → codeCache 미러 순으로 동작하는 바이너리 경로를 고른다. */
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

  /**
   * 다운로드된 lib 조합이 현재 바이너리와 맞지 않을 때, APK 내 네이티브 라이브러리로 1회 복구 시도.
   * 일부 기기에서 release asset의 ABI/심볼 불일치로 probe가 실패하는 케이스를 완화한다.
   */
  private fun tryRepairLibFromNativeLibraryDir(context: Context, paths: EspeakPaths): Boolean {
    val nativeDirPath = context.applicationInfo?.nativeLibraryDir ?: return false
    val nativeDir = File(nativeDirPath)
    if (!nativeDir.isDirectory) return false

    val candidates =
        listOf(
            File(nativeDir, LIB_NAME),
            File(nativeDir, LIB_SONAME),
        )

    for (src in candidates) {
      if (!src.isFile || src.length() < 200_000L) continue
      try {
        installCopiedFile(src, paths.libFile(), nativeLib = true)
        prepareRuntimeArtifacts(paths)
        EspeakNgExec.invalidateProbeCache()
        if (EspeakNgExec.probePaths(paths)) {
          NrmFileLogger.log(
              "espeak",
              "nativeLibraryDir 복구 성공 src=${src.name} dir=${nativeDir.absolutePath}",
          )
          return true
        }
      } catch (e: Exception) {
        NrmFileLogger.warn(
            "espeak",
            "nativeLibraryDir 복구 실패 src=${src.name} err=${e.message?.take(120)}",
        )
      }
    }
    return false
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

  private fun wipeExecArtifacts(context: Context, paths: EspeakPaths) {
    val execDir = NrmExecutableFile.execBaseDir(context, "espeak-ng")
    val mirrorDir = NrmExecutableFile.execBaseDir(context, "espeak-ng-exec")
    for (dir in listOf(execDir, mirrorDir, paths.libDir)) {
      NrmExecutableFile.clearLinkerMarkersInDir(dir)
    }
    val deleteTargets =
        linkedSetOf(
            paths.binary,
            File(execDir, LIB_NAME),
            File(execDir, LIB_SONAME),
            File(execDir, "$BIN_NAME.use-linker"),
            paths.libFile(),
            File(mirrorDir, BIN_NAME),
            File(mirrorDir, LIB_NAME),
            File(mirrorDir, LIB_SONAME),
        )
    for (target in deleteTargets) {
      NrmExecutableFile.prepareWritable(target)
      if (target.exists()) target.delete()
    }
    EspeakNgExec.invalidateProbeCache()
  }

  private fun wipeInstall(context: Context, paths: EspeakPaths) {
    wipeExecArtifacts(context, paths)

    val legacyLibDir = File(NrmExecutableFile.stagingBaseDir(context, "espeak-ng"), "native")
    val persist = persistDir(context)
    val deleteTargets =
        linkedSetOf(
            File(legacyLibDir, LIB_NAME),
            File(legacyLibDir, LIB_SONAME),
            paths.installMarker,
            File(paths.installMarker.parentFile, ".installed.tmp"),
            File(persist, BIN_NAME),
            File(persist, LIB_NAME),
            File(persist, LIB_SONAME),
        )
    for (target in deleteTargets) {
      NrmExecutableFile.prepareWritable(target)
      if (target.exists()) target.delete()
    }

    if (paths.dataDir.isDirectory) paths.dataDir.deleteRecursively()
    if (persist.isDirectory) persist.deleteRecursively()
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
