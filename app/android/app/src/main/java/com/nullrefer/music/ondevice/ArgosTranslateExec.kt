package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File
import java.util.Base64

/** nrm-argos-translate CLI 실행 */
object ArgosTranslateExec {
  fun translateWithModel(
      context: Context,
      modelDir: File,
      text: String,
  ): String? {
    val paths = ArgosTranslateBootstrap.ensure(context)
    if (!paths.isReady()) {
      NrmFileLogger.warn("libretranslate", "translate CLI 없음 — scripts/Build-ArgosTranslate-Android.ps1 실행 필요")
      return null
    }
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return ""
    val b64 = Base64.getEncoder().encodeToString(trimmed.toByteArray(Charsets.UTF_8))
    val cliFile = File(paths.cliPath)
    val cmd =
        NrmExecutableFile.buildExecArgv(
            cliFile,
            listOf(
                "--model-dir",
                modelDir.absolutePath,
                "--text-b64",
                b64,
            ),
        )
    return runCli(paths, cmd)
  }

  /** SPM·모델을 한 번만 로드하고 여러 줄 번역 (NUL 구분 batch-b64) */
  fun translateBatchWithModel(
      context: Context,
      modelDir: File,
      texts: List<String>,
  ): List<String>? {
    if (texts.isEmpty()) return emptyList()
    val paths = ArgosTranslateBootstrap.ensure(context)
    if (!paths.isReady()) {
      NrmFileLogger.warn("libretranslate", "translate CLI 없음 — scripts/Build-ArgosTranslate-Android.ps1 실행 필요")
      return null
    }
    val joined = texts.joinToString("\u0000")
    val b64 = Base64.getEncoder().encodeToString(joined.toByteArray(Charsets.UTF_8))
    val cliFile = File(paths.cliPath)
    val cmd =
        NrmExecutableFile.buildExecArgv(
            cliFile,
            listOf(
                "--model-dir",
                modelDir.absolutePath,
                "--batch-b64",
                b64,
            ),
        )
    val stdout = runCli(paths, cmd) ?: return null
    return splitNullDelimited(stdout, texts.size)
  }

  private fun splitNullDelimited(stdout: String, expectedCount: Int): List<String>? {
    if (expectedCount <= 0) return emptyList()
    val parts = stdout.split('\u0000')
    if (parts.size != expectedCount) {
      NrmFileLogger.warn(
          "libretranslate",
          "batch 출력 개수 불일치 expected=$expectedCount got=${parts.size}",
      )
      return null
    }
    return parts
  }

  private fun runCli(paths: ArgosTranslateBootstrap.ArgosTranslatePaths, cmd: List<String>): String? {
    return try {
      val env = HashMap(System.getenv())
      if (paths.libDir.isNotBlank()) {
        val old = env["LD_LIBRARY_PATH"].orEmpty()
        env["LD_LIBRARY_PATH"] =
            if (old.isBlank()) paths.libDir else "${paths.libDir}:$old"
      }
      val proc =
          ProcessBuilder(cmd)
              .directory(File(paths.libDir.ifBlank { "/" }))
              .redirectErrorStream(false)
              .apply { environment().putAll(env) }
              .start()
      val stdout = proc.inputStream.bufferedReader().readText().trim()
      val stderr = proc.errorStream.bufferedReader().readText().trim()
      val code = proc.waitFor()
      if (code != 0) {
        NrmFileLogger.warn(
            "libretranslate",
            "CLI exit=$code stderr=${stderr.take(400)}",
        )
        return null
      }
      stdout
    } catch (e: Exception) {
      NrmFileLogger.error("libretranslate", "CLI 실행 실패", e)
      null
    }
  }
}
