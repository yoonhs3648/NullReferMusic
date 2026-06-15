package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File
import java.io.FileOutputStream

/** nrm-argos-translate CLI — APK assets 또는 library/_bin 에서 부트스트랩 */
object ArgosTranslateBootstrap {
  private const val MIN_CLI_BYTES = 200_000L
  private const val ASSET_NAME = "libretranslate/nrm-argos-translate"

  fun ensure(context: Context): ArgosTranslatePaths {
    val cliDir = NrmExecutableFile.execBaseDir(context, "libretranslate")
    val cli = File(cliDir, "nrm-argos-translate")

    if (!cli.isFile || cli.length() < MIN_CLI_BYTES) {
      NrmFileLogger.log("libretranslate", "CLI asset 복사 시도")
      NrmExecutableFile.prepareWritable(cli)
      copyAssetIfPresent(context, ASSET_NAME, cli)
    }
    ensureNativeLibs(context, cliDir)

    NrmExecutableFile.prepareForExecution(cli)
    if (!NrmExecutableFile.isExecReady(cli)) {
      NrmExecutableFile.mirrorToExecCache(context, cli, "argos-translate-exec")?.let { mirrored ->
        NrmExecutableFile.ensureExecMode(mirrored, NrmExecutableFile.PROBE_HELP)
        return ArgosTranslatePaths(
            cliPath = mirrored.absolutePath,
            libDir = mirrored.parentFile?.absolutePath ?: cliDir.absolutePath,
        )
      }
    }
    NrmExecutableFile.ensureExecMode(cli, NrmExecutableFile.PROBE_HELP)
    return ArgosTranslatePaths(
        cliPath = if (cli.isFile && cli.length() >= MIN_CLI_BYTES) cli.absolutePath else "",
        libDir = cliDir.absolutePath,
    )
  }

  data class ArgosTranslatePaths(val cliPath: String, val libDir: String = "") {
    fun isReady(): Boolean = cliPath.isNotBlank()
  }

  private fun ensureNativeLibs(context: Context, cliDir: File) {
    try {
      val names = context.assets.list("libretranslate") ?: emptyArray()
      for (name in names) {
        if (!name.endsWith(".so")) continue
        val dest = File(cliDir, name)
        copyAssetIfPresent(context, "libretranslate/$name", dest)
      }
    } catch (e: Exception) {
      NrmFileLogger.warn("libretranslate", "native lib 복사 실패: ${e.message}")
    }
  }

  private fun copyAssetIfPresent(context: Context, assetName: String, dest: File) {
    try {
      context.assets.open(assetName).use { input ->
        dest.parentFile?.mkdirs()
        FileOutputStream(dest).use { output -> input.copyTo(output) }
      }
    } catch (_: Exception) {
      // asset missing
    }
  }
}
