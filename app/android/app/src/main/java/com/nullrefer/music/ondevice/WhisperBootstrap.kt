package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File
import java.io.FileOutputStream

/**
 * whisper.cpp 바이너리와 모델을 앱 내부 저장소에서 사용합니다.
 * 네트워크 다운로드 없음 — `assets/whisper/` 에 미리 넣어 빌드해야 합니다.
 * 선호 프로필에 따라 모델 우선순위를 바꿉니다.
 */
object WhisperBootstrap {
  private const val MIN_CLI_BYTES = 500_000L
  private val MODEL_CANDIDATES =
      listOf(
          ModelCandidate("ggml-tiny-q5_1.bin", 10_000_000L),
          ModelCandidate("ggml-tiny.bin", 30_000_000L),
          ModelCandidate("ggml-base.en-q5_1.bin", 20_000_000L),
          ModelCandidate("ggml-base.en.bin", 100_000_000L),
          ModelCandidate("ggml-small-q5_1.bin", 100_000_000L),
          ModelCandidate("ggml-medium-q5_0.bin", 300_000_000L),
          ModelCandidate("ggml-large-v3-turbo-q5_0.bin", 300_000_000L),
          ModelCandidate("ggml-large-v3-turbo.bin", 700_000_000L),
          ModelCandidate("ggml-large-v3-q5_0.bin", 700_000_000L),
          ModelCandidate("ggml-large-v3.bin", 1_500_000_000L),
      )

  fun ensure(context: Context, preferredModel: String?): WhisperPaths {
    val baseDir = File(context.filesDir, "whisper")
    baseDir.mkdirs()
    val cli = File(baseDir, "whisper-cli")

    if (!cli.isFile || cli.length() < MIN_CLI_BYTES) {
      copyAssetIfPresent(context, "whisper/whisper-cli", cli)
      copyAssetIfPresent(context, "whisper/main", cli)
    }

    var selectedModel: File? = null
    for (candidate in candidatesForPreference(preferredModel)) {
      val model = File(baseDir, candidate.name)
      if (!model.isFile || model.length() < candidate.minBytes) {
        copyAssetIfPresent(context, "whisper/${candidate.name}", model)
      }
      if (model.isFile && model.length() >= candidate.minBytes) {
        selectedModel = model
        break
      }
    }

    makeExecutable(cli)
    return WhisperPaths(
        cliPath = if (cli.isFile && cli.length() >= MIN_CLI_BYTES) cli.absolutePath else "",
        modelPath = selectedModel?.absolutePath ?: "",
    )
  }

  private data class ModelCandidate(val name: String, val minBytes: Long)

  private fun candidatesForPreference(preferredModel: String?): List<ModelCandidate> {
    val pref = (preferredModel ?: "").trim()
    if (pref.startsWith("model:")) {
      val modelName = pref.removePrefix("model:").trim()
      val picked = MODEL_CANDIDATES.find { it.name == modelName }
      return if (picked != null) listOf(picked) + MODEL_CANDIDATES.filter { it != picked } else MODEL_CANDIDATES
    }
    if (pref == "profile:quality") {
      return listOf(
          "ggml-large-v3.bin",
          "ggml-large-v3-q5_0.bin",
          "ggml-large-v3-turbo.bin",
          "ggml-large-v3-turbo-q5_0.bin",
          "ggml-medium-q5_0.bin",
          "ggml-small-q5_1.bin",
          "ggml-base.en.bin",
          "ggml-base.en-q5_1.bin",
          "ggml-tiny.bin",
          "ggml-tiny-q5_1.bin",
      ).mapNotNull { name -> MODEL_CANDIDATES.find { it.name == name } }
    }
    if (pref == "profile:balanced") {
      return listOf(
          "ggml-medium-q5_0.bin",
          "ggml-small-q5_1.bin",
          "ggml-base.en.bin",
          "ggml-base.en-q5_1.bin",
          "ggml-large-v3-turbo-q5_0.bin",
          "ggml-large-v3-turbo.bin",
          "ggml-large-v3-q5_0.bin",
          "ggml-large-v3.bin",
          "ggml-tiny.bin",
          "ggml-tiny-q5_1.bin",
      ).mapNotNull { name -> MODEL_CANDIDATES.find { it.name == name } }
    }
    return MODEL_CANDIDATES
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
