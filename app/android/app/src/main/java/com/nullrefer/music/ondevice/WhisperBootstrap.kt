package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File
import java.io.FileOutputStream

/** whisper.cpp CLI는 APK assets, 모델은 기기에 미리 받아 둔 파일만 사용합니다. */
object WhisperBootstrap {
  private const val MIN_CLI_BYTES = 500_000L

  fun ensure(context: Context, preferredModel: String?): WhisperPaths {
    NrmFileLogger.log("whisper", "ensure modelPref=${preferredModel ?: "(default)"}")
    val cliDir = NrmExecutableFile.execBaseDir(context, "whisper")
    val cli = File(cliDir, "whisper-cli")

    if (!cli.isFile || cli.length() < MIN_CLI_BYTES) {
      NrmFileLogger.log("whisper", "CLI asset 복사 시도")
      NrmExecutableFile.prepareWritable(cli)
      copyAssetIfPresent(context, "whisper/whisper-cli", cli)
      if (!cli.isFile || cli.length() < MIN_CLI_BYTES) {
        NrmExecutableFile.prepareWritable(cli)
        copyAssetIfPresent(context, "whisper/main", cli)
      }
    }
    ensureWhisperNativeLibs(context, cliDir)

    val model = WhisperModelDownloader.resolveInstalledFile(context, preferredModel ?: "")
    NrmExecutableFile.prepareForExecution(cli)
    if (!NrmExecutableFile.isExecReady(cli)) {
      NrmExecutableFile.mirrorToExecCache(context, cli, "whisper-exec")?.let { mirrored ->
        NrmFileLogger.log("whisper", "codeCache CLI 사용: ${mirrored.absolutePath}")
        NrmExecutableFile.ensureExecMode(mirrored, NrmExecutableFile.PROBE_HELP)
        val paths =
            WhisperPaths(
                cliPath = mirrored.absolutePath,
                modelPath = model?.absolutePath ?: "",
                libDir = mirrored.parentFile?.absolutePath ?: cliDir.absolutePath,
            )
        NrmFileLogger.log(
            "whisper",
            "ensure 결과 cli=${paths.cliPath.ifBlank { "(없음)" }} model=${paths.modelPath.ifBlank { "(없음)" }}",
        )
        return paths
      }
    }
    NrmExecutableFile.ensureExecMode(cli, NrmExecutableFile.PROBE_HELP)
    val paths =
        WhisperPaths(
            cliPath = if (cli.isFile && cli.length() >= MIN_CLI_BYTES) cli.absolutePath else "",
            modelPath = model?.absolutePath ?: "",
            libDir = cliDir.absolutePath,
        )
    NrmFileLogger.log(
        "whisper",
        "ensure 결과 cli=${paths.cliPath.ifBlank { "(없음)" }} size=${cli.length()} model=${paths.modelPath.ifBlank { "(없음)" }}",
    )
    return paths
  }

  data class WhisperPaths(
      val cliPath: String,
      val modelPath: String,
      val libDir: String = "",
  ) {
    fun isReady(): Boolean = cliPath.isNotBlank() && modelPath.isNotBlank()
  }

  /** whisper.cpp OpenMP 등 동적 링크 .so 전부 복사 */
  private fun ensureWhisperNativeLibs(context: Context, cliDir: File) {
    try {
      val names = context.assets.list("whisper") ?: emptyArray()
      for (name in names) {
        if (!name.endsWith(".so")) continue
        val dest = File(cliDir, name)
        copyAssetIfPresent(context, "whisper/$name", dest)
        if (dest.isFile) {
          NrmFileLogger.log("whisper", "native lib OK name=$name bytes=${dest.length()}")
        }
      }
    } catch (e: Exception) {
      NrmFileLogger.warn("whisper", "native lib 복사 실패: ${e.message}")
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
