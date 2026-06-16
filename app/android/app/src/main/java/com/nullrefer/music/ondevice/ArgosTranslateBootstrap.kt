package com.nullrefer.music.ondevice

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileOutputStream

/** nrm-argos-translate CLI — APK assets (ABI별) 또는 library/_bin 에서 부트스트랩 */
object ArgosTranslateBootstrap {
  private const val MIN_CLI_BYTES = 200_000L
  private const val LEGACY_ASSET_DIR = "libretranslate"
  private const val CLI_NAME = "nrm-argos-translate"

  fun ensure(context: Context): ArgosTranslatePaths {
    val abi = resolvePrimaryAbi()
    val assetDir = "$LEGACY_ASSET_DIR/$abi"
    val cliDir = NrmExecutableFile.execBaseDir(context, LEGACY_ASSET_DIR)
    val cli = File(cliDir, CLI_NAME)

    if (!cli.isFile || cli.length() < MIN_CLI_BYTES) {
      NrmFileLogger.log("libretranslate", "CLI asset 복사 시도 abi=$abi")
      NrmExecutableFile.prepareWritable(cli)
      if (!copyAssetIfPresent(context, "$assetDir/$CLI_NAME", cli)) {
        copyAssetIfPresent(context, "$LEGACY_ASSET_DIR/$CLI_NAME", cli)
      }
    }
    ensureNativeLibs(context, cliDir, assetDir)

    NrmExecutableFile.prepareForExecution(cli)
    if (!NrmExecutableFile.isExecReady(cli)) {
      NrmExecutableFile.mirrorToExecCache(context, cli, "argos-translate-exec")?.let { mirrored ->
        NrmExecutableFile.ensureExecMode(mirrored, NrmExecutableFile.PROBE_HELP)
        return ArgosTranslatePaths(
            cliPath = mirrored.absolutePath,
            libDir = mirrored.parentFile?.absolutePath ?: cliDir.absolutePath,
            abi = abi,
        )
      }
    }
    NrmExecutableFile.ensureExecMode(cli, NrmExecutableFile.PROBE_HELP)
    return ArgosTranslatePaths(
        cliPath = if (cli.isFile && cli.length() >= MIN_CLI_BYTES) cli.absolutePath else "",
        libDir = cliDir.absolutePath,
        abi = abi,
    )
  }

  data class ArgosTranslatePaths(
      val cliPath: String,
      val libDir: String = "",
      val abi: String = "",
  ) {
    fun isReady(): Boolean = cliPath.isNotBlank()
  }

  private fun resolvePrimaryAbi(): String {
    val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
    return when {
      abi.startsWith("arm64") -> "arm64-v8a"
      abi == "x86_64" -> "x86_64"
      else -> "arm64-v8a"
    }
  }

  private fun ensureNativeLibs(context: Context, cliDir: File, preferredAssetDir: String) {
    val names = mutableSetOf<String>()
    try {
      context.assets.list(preferredAssetDir)?.filter { it.endsWith(".so") }?.let { names.addAll(it) }
    } catch (_: Exception) {
      // ignore
    }
    if (names.isEmpty()) {
      try {
        context.assets.list(LEGACY_ASSET_DIR)?.filter { it.endsWith(".so") }?.let { names.addAll(it) }
      } catch (_: Exception) {
        // ignore
      }
    }
    for (name in names) {
      val dest = File(cliDir, name)
      if (!copyAssetIfPresent(context, "$preferredAssetDir/$name", dest)) {
        copyAssetIfPresent(context, "$LEGACY_ASSET_DIR/$name", dest)
      }
    }
  }

  private fun copyAssetIfPresent(context: Context, assetName: String, dest: File): Boolean {
    return try {
      context.assets.open(assetName).use { input ->
        dest.parentFile?.mkdirs()
        FileOutputStream(dest).use { output -> input.copyTo(output) }
      }
      true
    } catch (_: Exception) {
      false
    }
  }
}
