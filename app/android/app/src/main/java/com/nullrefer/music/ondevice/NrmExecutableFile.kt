package com.nullrefer.music.ondevice

import android.system.ErrnoException
import android.system.Os
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * API 29+ W^X: 쓰기 가능한 파일은 exec 시 EACCES(13)가 난다.
 * 실행 직전 읽기·실행만 허용하고 쓰기 비트를 제거한다.
 */
object NrmExecutableFile {
  private const val MODE_RX = 0x155 // 0555 — r-xr-xr-x

  /** 실행 가능한 바이너리를 codeCacheDir 등에 둘 때 사용 */
  fun execBaseDir(context: android.content.Context, subdir: String): File {
    val dir = File(context.codeCacheDir, subdir)
    dir.mkdirs()
    return dir
  }

  fun prepareForExecution(file: File) {
    if (!file.isFile) return
    applyExecMode(file)
    if (!isExecReady(file)) {
      NrmFileLogger.warn(
        "exec",
        "chmod 후에도 실행 불가 path=${file.absolutePath} canExec=${file.canExecute()} canWrite=${file.canWrite()}",
      )
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
