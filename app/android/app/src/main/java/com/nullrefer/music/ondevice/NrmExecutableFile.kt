package com.nullrefer.music.ondevice

import android.system.ErrnoException
import android.system.Os
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException

/**
 * API 29+ W^X: 쓰기 가능한 파일은 exec 시 EACCES(13)가 난다.
 * 실행 직전 읽기·실행만 허용하고 쓰기 비트를 제거한다.
 */
object NrmExecutableFile {
  /** octal 0555 — r-xr-xr-x (쓰기 비트 없음, API 29+ W^X 필수). 0x155(525)는 그룹 쓰기가 켜져 exec EACCES 원인 */
  private const val MODE_RX = 0x16D

  /** 실행 가능한 바이너리를 codeCacheDir 등에 둘 때 사용 */
  fun execBaseDir(context: android.content.Context, subdir: String): File {
    val dir = File(context.codeCacheDir, subdir)
    dir.mkdirs()
    return dir
  }

  /** 다운로드·압축 해제 등 쓰기가 필요한 단계용 (실행 전 staging) */
  fun stagingBaseDir(context: android.content.Context, subdir: String): File {
    val dir = File(context.filesDir, subdir)
    dir.mkdirs()
    return dir
  }

  fun prepareForExecution(file: File) {
    if (!file.isFile) return
    applyExecMode(file)
    logExecState(file, "prepareForExecution")
    if (!isExecReady(file)) {
      NrmFileLogger.warn(
        "exec",
        "chmod 후에도 실행 불가 path=${file.absolutePath} canExec=${file.canExecute()} canWrite=${file.canWrite()}",
      )
    }
  }

  /** whisper-cli 등 -version 미지원 바이너리용 probe 후보 */
  val PROBE_HELP: List<List<String>> =
    listOf(listOf("--help"), listOf("-h"), listOf("-version"))

  /**
   * bootstrap 직후 1회 — 직접 exec vs linker 경유를 결정하고 .use-linker 마커를 기록.
   * @param probeVariants 각 후보마다 [binary, *args] 또는 [linker, binary, *args] 로 probe
   */
  fun ensureExecMode(
    binary: File,
    probeVariants: List<List<String>> = listOf(listOf("-version")),
  ) {
    prepareForExecution(binary)
    val marker = linkerMarkerFile(binary)
    if (marker.isFile && marker.readText().trim().isNotEmpty()) return

    for (probeArgs in probeVariants) {
      if (probeDirectExec(binary, probeArgs)) {
        clearLinkerMarker(binary)
        NrmFileLogger.log("exec", "직접 실행 OK path=${binary.absolutePath} probe=$probeArgs")
        return
      }
    }

    val linker = defaultLinkerPath()
    if (linker.isNotEmpty()) {
      for (probeArgs in probeVariants) {
        if (probeExec(linker, binary.absolutePath, *probeArgs.toTypedArray())) {
          marker.writeText(linker)
          NrmFileLogger.log(
            "exec",
            "linker 경유 실행 path=${binary.absolutePath} linker=$linker probe=$probeArgs",
          )
          return
        }
      }
      if (isWxorDirectExecBlocked(binary)) {
        marker.writeText(linker)
        NrmFileLogger.log(
          "exec",
          "linker 경유 (W^X fallback) path=${binary.absolutePath} linker=$linker",
        )
        return
      }
    }
    NrmFileLogger.warn("exec", "exec 프로브 실패 path=${binary.absolutePath}")
  }

  /**
   * ProcessBuilder/subprocess 인자 목록.
   * ensureExecMode() 이후 .use-linker 마커가 있으면 linker 경유.
   */
  fun buildExecArgv(binary: File, args: List<String>): List<String> {
    prepareForExecution(binary)
    val marker = linkerMarkerFile(binary)
    if (marker.isFile) {
      val linker = marker.readText().trim()
      if (linker.isNotEmpty()) {
        return listOf(linker, binary.absolutePath) + args
      }
    }
    return listOf(binary.absolutePath) + args
  }

  private fun copyLinkerMarker(source: File, dest: File) {
    val srcMarker = linkerMarkerFile(source)
    if (!srcMarker.isFile) return
    try {
      linkerMarkerFile(dest).writeText(srcMarker.readText())
    } catch (_: Exception) {
    }
  }

  private fun linkerMarkerFile(binary: File): File = File(binary.parentFile, "${binary.name}.use-linker")

  private fun clearLinkerMarker(binary: File) {
    try {
      linkerMarkerFile(binary).delete()
    } catch (_: Exception) {
    }
  }

  private fun logExecState(file: File, tag: String) {
    NrmFileLogger.log(
      "exec",
      "$tag path=${file.absolutePath} exists=${file.exists()} exec=${file.canExecute()} " +
        "read=${file.canRead()} write=${file.canWrite()}",
    )
  }

  private fun probeDirectExec(binary: File, probeArgs: List<String>): Boolean =
    probeExec(binary.absolutePath, *probeArgs.toTypedArray())

  /** API 29+ W^X: chmod 후에도 직접 exec 시 error=13만 나는 경우 */
  private fun isWxorDirectExecBlocked(binary: File): Boolean {
    if (!isExecReady(binary)) return false
    if (defaultLinkerPath().isEmpty()) return false
    return try {
      ProcessBuilder(listOf(binary.absolutePath, "-version"))
        .redirectErrorStream(true)
        .start()
      false
    } catch (e: IOException) {
      val msg = e.message.orEmpty()
      msg.contains("error=13", ignoreCase = true) ||
        msg.contains("Permission denied", ignoreCase = true) ||
        msg.contains("EACCES", ignoreCase = true)
    }
  }

  private fun probeExec(vararg cmd: String): Boolean {
    return try {
      val p =
        ProcessBuilder(cmd.toList())
          .redirectErrorStream(true)
          .start()
      val done = p.waitFor(8, java.util.concurrent.TimeUnit.SECONDS)
      if (!done) {
        p.destroyForcibly()
        false
      } else {
        p.exitValue() == 0
      }
    } catch (_: Exception) {
      false
    }
  }

  private fun defaultLinkerPath(): String {
    val abi = android.os.Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
    return if (abi.startsWith("arm64") || abi == "x86_64") {
      "/system/bin/linker64"
    } else {
      "/system/bin/linker"
    }
  }

  /** 업데이트·삭제 전에만 호출 */
  fun prepareWritable(file: File) {
    if (!file.exists()) return
    try {
      Os.chmod(file.absolutePath, 0x1A4) // 0644
    } catch (_: ErrnoException) {
      file.setWritable(true, false)
    }
  }

  /**
   * filesDir 등에서 exec가 막히면 codeCacheDir로 복사 후 chmod.
   * 성공 시 실행 가능한 파일 경로, 실패 시 null.
   */
  fun mirrorToExecCache(context: android.content.Context, source: File, cacheSubdir: String): File? {
    if (!source.isFile) return null
    val destDir = execBaseDir(context, cacheSubdir)
    val dest = File(destDir, source.name)
    if (dest.isFile && dest.length() == source.length() && isExecReady(dest)) {
      return dest
    }
    prepareWritable(dest)
    try {
      FileInputStream(source).use { input ->
        FileOutputStream(dest).use { output ->
          input.copyTo(output)
          output.fd.sync()
        }
      }
      applyExecMode(dest)
      copyLinkerMarker(source, dest)
      if (isExecReady(dest)) {
        NrmFileLogger.log("exec", "codeCache 미러 OK path=${dest.absolutePath}")
        return dest
      }
    } catch (e: Exception) {
      NrmFileLogger.error("exec", "codeCache 미러 실패 src=${source.absolutePath}", e)
    }
    return null
  }

  fun isExecReady(file: File): Boolean = file.isFile && file.canExecute() && !file.canWrite()

  private fun applyExecMode(file: File) {
    try {
      Os.chmod(file.absolutePath, MODE_RX)
    } catch (e: ErrnoException) {
      NrmFileLogger.warn("exec", "Os.chmod 실패 path=${file.absolutePath} errno=${e.errno}")
      file.setReadable(true, false)
      file.setWritable(false, false)
      file.setExecutable(true, false)
      try {
        ProcessBuilder(listOf("/system/bin/chmod", "555", file.absolutePath))
          .redirectErrorStream(true)
          .start()
          .waitFor()
      } catch (_: Exception) {
      }
    }
  }
}
