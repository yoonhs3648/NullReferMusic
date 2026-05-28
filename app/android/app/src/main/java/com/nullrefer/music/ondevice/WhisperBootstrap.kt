package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File
import java.io.FileOutputStream

/** whisper.cpp CLI는 APK assets, 모델은 기기에 미리 받아 둔 파일만 사용합니다. */
object WhisperBootstrap {
  private const val MIN_CLI_BYTES = 500_000L

  fun ensure(context: Context, preferredModel: String?): WhisperPaths {
    val baseDir = WhisperModelDownloader.whisperDir(context)
    val cli = File(baseDir, "whisper-cli")

    if (!cli.isFile || cli.length() < MIN_CLI_BYTES) {
      copyAssetIfPresent(context, "whisper/whisper-cli", cli)
      copyAssetIfPresent(context, "whisper/main", cli)
    }

    val model = WhisperModelDownloader.resolveInstalledFile(context, preferredModel ?: "")
    makeExecutable(cli)
    return WhisperPaths(
        cliPath = if (cli.isFile && cli.length() >= MIN_CLI_BYTES) cli.absolutePath else "",
        modelPath = model?.absolutePath ?: "",
    )
  }

  data class WhisperPaths(val cliPath: String, val modelPath: String) {
    fun isReady(): Boolean = cliPath.isNotBlank() && modelPath.isNotBlank()
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

  private fun makeExecutable(file: File) {
    if (!file.isFile) return
    file.setReadable(true, false)
    file.setExecutable(true, false)
    try {
      ProcessBuilder(listOf("chmod", "755", file.absolutePath))
          .redirectErrorStream(true)
          .start()
          .waitFor()
    } catch (_: Exception) {
    }
  }
}
