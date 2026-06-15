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
    val cmd =
        mutableListOf(
            paths.cliPath,
            "--model-dir",
            modelDir.absolutePath,
            "--text-b64",
            b64,
        )
    return runCli(paths, cmd)
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
