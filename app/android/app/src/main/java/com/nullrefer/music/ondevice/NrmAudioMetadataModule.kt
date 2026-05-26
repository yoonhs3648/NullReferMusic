package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class NrmAudioMetadataModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmAudioMetadata"

  @ReactMethod
  fun applyMetadata(inputPath: String, metadata: ReadableMap, promise: Promise) {
    Thread {
      try {
        val inFile = File(inputPath)
        if (!inFile.isFile) {
          promise.reject("E_ARG", "입력 파일이 없습니다.")
          return@Thread
        }
        val ffmpegDir = FfmpegBootstrap.ensure(reactApplicationContext)
        val ffmpegBin = File(ffmpegDir, "ffmpeg")
        if (ffmpegDir.isBlank() || !ffmpegBin.isFile) {
          val skip = com.facebook.react.bridge.Arguments.createMap()
          skip.putString("path", inFile.absolutePath)
          promise.resolve(skip)
          return@Thread
        }

        val artist = metadata.getString("artist")?.trim().orEmpty()
        val title = metadata.getString("title")?.trim().orEmpty()
        val album = metadata.getString("album")?.trim().orEmpty()
        val genre = metadata.getString("genre")?.trim().orEmpty()
        val releaseDate = metadata.getString("releaseDate")?.trim().orEmpty()
        val coverUrl = metadata.getString("coverUrl")?.trim().orEmpty()

        val hasTags =
          artist.isNotEmpty() ||
            title.isNotEmpty() ||
            album.isNotEmpty() ||
            genre.isNotEmpty() ||
            releaseDate.isNotEmpty()

        var coverFile: File? = null
        if (coverUrl.isNotEmpty()) {
          coverFile = downloadCover(coverUrl, reactApplicationContext.cacheDir)
        }

        if (!hasTags && coverFile == null) {
          val skip = com.facebook.react.bridge.Arguments.createMap()
          skip.putString("path", inFile.absolutePath)
          promise.resolve(skip)
          return@Thread
        }

        val parentDir = inFile.parentFile ?: reactApplicationContext.cacheDir
        val outFile = File(parentDir, "nrm-meta-${System.currentTimeMillis()}-${inFile.name}")
        val cmd = mutableListOf(ffmpegBin.absolutePath, "-y", "-i", inFile.absolutePath)
        if (coverFile != null) {
          cmd.add("-i")
          cmd.add(coverFile.absolutePath)
        }
        cmd.add("-map")
        cmd.add("0:a")
        if (coverFile != null) {
          cmd.add("-map")
          cmd.add("1:v")
          cmd.add("-c:v")
          cmd.add("copy")
          cmd.add("-disposition:v:0")
          cmd.add("attached_pic")
          cmd.add("-metadata:s:v")
          cmd.add("title=Album cover")
          cmd.add("-metadata:s:v")
          cmd.add("comment=Cover (front)")
        }
        cmd.add("-c:a")
        cmd.add("copy")
        if (artist.isNotEmpty()) {
          cmd.add("-metadata")
          cmd.add("artist=$artist")
        }
        if (title.isNotEmpty()) {
          cmd.add("-metadata")
          cmd.add("title=$title")
        }
        if (album.isNotEmpty()) {
          cmd.add("-metadata")
          cmd.add("album=$album")
        }
        if (genre.isNotEmpty()) {
          cmd.add("-metadata")
          cmd.add("genre=$genre")
        }
        if (releaseDate.isNotEmpty()) {
          cmd.add("-metadata")
          cmd.add("date=$releaseDate")
        }
        cmd.add(outFile.absolutePath)

        val proc =
          ProcessBuilder(cmd)
            .redirectErrorStream(true)
            .start()
        val finished = proc.waitFor(120, TimeUnit.SECONDS)
        if (!finished || proc.exitValue() != 0) {
          val err = proc.inputStream.bufferedReader().readText()
          throw Exception("ffmpeg metadata failed: $err")
        }

        if (!outFile.isFile || outFile.length() <= 0L) {
          throw Exception("메타데이터 적용 결과 파일이 비어 있습니다.")
        }

        if (!inFile.delete()) {
          outFile.copyTo(inFile, overwrite = true)
          outFile.delete()
        } else {
          outFile.renameTo(inFile)
        }

        coverFile?.delete()
        val ok = com.facebook.react.bridge.Arguments.createMap()
        ok.putString("path", inFile.absolutePath)
        promise.resolve(ok)
      } catch (e: Exception) {
        promise.reject("E_METADATA", e.message ?: e.toString(), e)
      }
    }.start()
  }

  private fun downloadCover(url: String, dir: File?): File? {
    return try {
      val parent = dir ?: reactApplicationContext.cacheDir
      val ext =
        when {
          url.contains(".png", ignoreCase = true) -> ".png"
          url.contains(".webp", ignoreCase = true) -> ".webp"
          else -> ".jpg"
        }
      val out = File(parent, "nrm-cover-${System.currentTimeMillis()}$ext")
      val conn = URL(url).openConnection() as HttpURLConnection
      conn.connectTimeout = 15_000
      conn.readTimeout = 20_000
      conn.instanceFollowRedirects = true
      conn.inputStream.use { input ->
        FileOutputStream(out).use { output -> input.copyTo(output) }
      }
      if (out.length() <= 0L) {
        out.delete()
        null
      } else {
        out
      }
    } catch (_: Exception) {
      null
    }
  }

}
