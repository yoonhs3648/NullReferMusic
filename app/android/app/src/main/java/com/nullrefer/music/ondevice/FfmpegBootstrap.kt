package com.nullrefer.music.ondevice



import android.content.Context

import android.os.Build

import java.io.BufferedInputStream

import java.io.File

import java.io.FileOutputStream

import java.net.HttpURLConnection

import java.net.URL

import java.util.zip.ZipInputStream



/**

 * ffmpeg 바이너리를 앱 내부 저장소에서 관리합니다.

 *

 * yt-dlp 포맷 변환(MP3 등)과 메타데이터 태깅에 사용합니다.

 * Android(Bionic)용 정적 빌드만 사용합니다. Linux glibc 바이너리는 exec 시 EACCES(13)가 납니다.

 *

 * 출처: [FFmpegBin](https://github.com/Tyrrrz/FFmpegBin) (Android arm64/arm/x86/x64)

 */

object FfmpegBootstrap {

  private val ensureLock = Any()

  private const val MIN_BYTES = 5_000_000L

  /** 이전 BtbN linuxarm64 캐시(~166MB)와 구분 */

  private const val MAX_BYTES = 120_000_000L

  private const val BOOTSTRAP_ID = "ffmpegbin-8.1-android-rx16d"

  private const val FFMPEG_RELEASE = "8.1"



  private const val FFMPEG_URL_ARM64 =

    "https://github.com/Tyrrrz/FFmpegBin/releases/download/$FFMPEG_RELEASE/ffmpeg-android-arm64.zip"

  private const val FFMPEG_URL_ARM =

    "https://github.com/Tyrrrz/FFmpegBin/releases/download/$FFMPEG_RELEASE/ffmpeg-android-arm.zip"

  private const val FFMPEG_URL_X86_64 =

    "https://github.com/Tyrrrz/FFmpegBin/releases/download/$FFMPEG_RELEASE/ffmpeg-android-x64.zip"

  private const val FFMPEG_URL_X86 =

    "https://github.com/Tyrrrz/FFmpegBin/releases/download/$FFMPEG_RELEASE/ffmpeg-android-x86.zip"



  /**

   * ffmpeg 바이너리가 들어 있는 디렉터리 경로.

   * 실패 시 빈 문자열 (yt-dlp는 원본 오디오만 저장).

   */

  fun ensure(context: Context): String {
    synchronized(ensureLock) {
      NrmFileLogger.log("ffmpeg", "ensure 시작")

      val execDir = NrmExecutableFile.execBaseDir(context, "ffmpeg")
      val bin = File(execDir, "ffmpeg")
      val marker = File(execDir, ".bootstrap-id")
      val stagingDir = NrmExecutableFile.stagingBaseDir(context, "ffmpeg-staging")

      if (isValidCachedBin(bin, marker)) {
        return finalizeBin(context, execDir, bin)
      }

      clearInstall(execDir, bin, marker)
      stagingDir.listFiles()?.forEach { it.delete() }

      return try {
        val zipUrl = ffmpegZipUrlForAbi()
        NrmFileLogger.log(
          "ffmpeg",
          "다운로드 시작 url=$zipUrl abi=${Build.SUPPORTED_ABIS.joinToString()}",
        )
        val zipFile = File(stagingDir, "ffmpeg.zip")
        val stagingBin = File(stagingDir, "ffmpeg")
        downloadFile(zipUrl, zipFile)
        NrmFileLogger.log("ffmpeg", "zip 다운로드 완료 size=${zipFile.length()}")

        extractFfmpegFromZip(zipFile, stagingBin)
        zipFile.delete()

        if (!isValidBinFile(stagingBin)) {
          throw Exception("ffmpeg 바이너리 추출 또는 검증 실패")
        }

        installFromStaging(stagingBin, bin)
        stagingBin.delete()

        if (!isValidBinFile(bin)) {
          throw Exception("ffmpeg 설치 검증 실패")
        }
        marker.writeText(BOOTSTRAP_ID)
        finalizeBin(context, execDir, bin)
      } catch (e: Exception) {
        NrmFileLogger.error("ffmpeg", "설정 실패: ${e.message}", e)
        android.util.Log.w("FfmpegBootstrap", "ffmpeg 설정 실패: ${e.message}")
        ""
      }
    }
  }

  fun binaryPath(context: Context): String {
    val dir = ensure(context)
    if (dir.isBlank()) return ""
    val bin = File(dir, "ffmpeg")
    if (!bin.isFile) return ""
    NrmExecutableFile.prepareForExecution(bin)
    return bin.absolutePath
  }

  private fun finalizeBin(context: Context, baseDir: File, bin: File): String {
    NrmExecutableFile.prepareForExecution(bin)
    if (!NrmExecutableFile.isExecReady(bin)) {
      NrmExecutableFile.mirrorToExecCache(context, bin, "ffmpeg-exec")?.let { mirrored ->
        NrmFileLogger.log("ffmpeg", "codeCache 실행본 사용: ${mirrored.absolutePath}")
        NrmExecutableFile.ensureExecMode(mirrored)
        return mirrored.parentFile?.absolutePath ?: baseDir.absolutePath
      }
      NrmFileLogger.warn("ffmpeg", "실행 권한 확보 실패 path=${bin.absolutePath}")
    }
    NrmExecutableFile.ensureExecMode(bin)
    NrmFileLogger.log(
      "ffmpeg",
      "준비 완료 path=${bin.absolutePath} size=${bin.length()} exec=${bin.canExecute()} write=${bin.canWrite()}",
    )
    return baseDir.absolutePath
  }

  private fun installFromStaging(stagingBin: File, destBin: File) {
    destBin.parentFile?.mkdirs()
    NrmExecutableFile.prepareWritable(destBin)
    stagingBin.inputStream().use { input ->
      FileOutputStream(destBin).use { output ->
        input.copyTo(output)
        output.fd.sync()
      }
    }
    NrmExecutableFile.prepareForExecution(destBin)
  }



  private fun clearInstall(baseDir: File, bin: File, marker: File) {

    baseDir.mkdirs()

    NrmExecutableFile.prepareWritable(bin)

    bin.delete()

    marker.delete()

    File(baseDir, "ffmpeg.tar.xz").delete()

    File(baseDir, "ffmpeg.zip").delete()

  }



  private fun isValidCachedBin(bin: File, marker: File): Boolean {

    if (!isValidBinFile(bin)) return false

    return marker.isFile && marker.readText().trim() == BOOTSTRAP_ID

  }



  private fun isValidBinFile(bin: File): Boolean {

    if (!bin.isFile) return false

    val len = bin.length()

    if (len < MIN_BYTES || len > MAX_BYTES) return false

    return isAndroidElfExecutable(bin)

  }



  /** Linux glibc 빌드와 구분: PT_INTERP가 /system/bin/linker(64) 여야 함 */

  private fun isAndroidElfExecutable(file: File): Boolean {

    return try {

      file.inputStream().use { ins ->

        val hdr = ByteArray(64)

        if (ins.read(hdr) < 20) return false

        if (hdr[0] != 0x7f.toByte() || hdr[1] != 'E'.code.toByte() ||

            hdr[2] != 'L'.code.toByte() || hdr[3] != 'F'.code.toByte()) {

          return false

        }

        val expectedMachine = expectedElfMachine()

        if (expectedMachine >= 0) {

          val machine =

              (hdr[18].toInt() and 0xff) or ((hdr[19].toInt() and 0xff) shl 8)

          if (machine != expectedMachine) return false

        }

        readElfInterpreter(file)?.let { interp ->

          interp == "/system/bin/linker64" || interp == "/system/bin/linker"

        } ?: false

      }

    } catch (_: Exception) {

      false

    }

  }



  private fun expectedElfMachine(): Int {

    val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()

    return when {

      abi.startsWith("arm64") -> 0xB7

      abi.startsWith("armeabi") -> 0x28

      abi == "x86_64" -> 0x3E

      abi == "x86" -> 0x03

      else -> -1

    }

  }



  private fun readElfInterpreter(file: File): String? {

    val data = file.readBytes()

    if (data.size < 64 || data[0] != 0x7f.toByte()) return null

    val elfClass = data[4].toInt()

    if (elfClass != 2) return null // ELF64 only (현재 FFmpegBin Android 빌드)



    val ePhoff = readU64(data, 32)

    val ePhentsize = readU16(data, 54)

    val ePhnum = readU16(data, 56)

    for (i in 0 until ePhnum) {

      val off = (ePhoff + i * ePhentsize).toInt()

      if (off + 56 > data.size) break

      val pType = readU32(data, off)

      if (pType != 3) continue // PT_INTERP

      val pOffset = readU64(data, off + 8)

      val pFilesz = readU64(data, off + 32)

      val start = pOffset.toInt()

      val end = (pOffset + pFilesz).toInt().coerceAtMost(data.size)

      if (start < 0 || start >= end) return null

      val raw = data.copyOfRange(start, end)

      val nul = raw.indexOf(0)

      return String(raw, 0, if (nul >= 0) nul else raw.size, Charsets.US_ASCII)

    }

    return null

  }



  private fun readU16(data: ByteArray, offset: Int): Int =

      (data[offset].toInt() and 0xff) or ((data[offset + 1].toInt() and 0xff) shl 8)



  private fun readU32(data: ByteArray, offset: Int): Int =

      (data[offset].toInt() and 0xff) or

          ((data[offset + 1].toInt() and 0xff) shl 8) or

          ((data[offset + 2].toInt() and 0xff) shl 16) or

          ((data[offset + 3].toInt() and 0xff) shl 24)



  private fun readU64(data: ByteArray, offset: Int): Long {

    var v = 0L

    for (i in 0 until 8) {

      v = v or ((data[offset + i].toLong() and 0xff) shl (8 * i))

    }

    return v

  }



  private fun downloadFile(urlStr: String, dest: File) {

    val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {

      connectTimeout = 60_000

      readTimeout = 600_000

      instanceFollowRedirects = true

    }

    conn.connect()

    if (conn.responseCode !in 200..299) {

      throw Exception("ffmpeg 다운로드 실패: HTTP ${conn.responseCode}")

    }

    NrmFileLogger.log("ffmpeg", "HTTP ${conn.responseCode} → ${dest.name}")

    conn.inputStream.use { input -> dest.outputStream().use { input.copyTo(it) } }

  }



  private fun extractFfmpegFromZip(zipFile: File, outputBin: File) {

    BufferedInputStream(zipFile.inputStream()).use { buffered ->

      ZipInputStream(buffered).use { zip ->

        var entry = zip.nextEntry

        while (entry != null) {

          val name = entry.name.replace('\\', '/')

          if (!entry.isDirectory && (name == "ffmpeg" || name.endsWith("/ffmpeg"))) {

            outputBin.parentFile?.mkdirs()

            FileOutputStream(outputBin).use { out ->
              zip.copyTo(out)
              out.fd.sync()
            }
            NrmExecutableFile.prepareForExecution(outputBin)
            return

          }

          zip.closeEntry()

          entry = zip.nextEntry

        }

      }

    }

    throw Exception("zip에서 ffmpeg 바이너리를 찾지 못했습니다.")

  }



  private fun ffmpegZipUrlForAbi(): String {

    val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()

    return when {

      abi.startsWith("arm64") -> FFMPEG_URL_ARM64

      abi.startsWith("armeabi") -> FFMPEG_URL_ARM

      abi == "x86_64" -> FFMPEG_URL_X86_64

      abi == "x86" -> FFMPEG_URL_X86

      else -> FFMPEG_URL_ARM64

    }

  }

}

