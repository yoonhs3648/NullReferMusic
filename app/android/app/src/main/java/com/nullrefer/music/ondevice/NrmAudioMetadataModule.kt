package com.nullrefer.music.ondevice

import android.content.ContentUris
import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.MediaStore
import android.util.Base64
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

        val tagBundle = readMetadataTags(metadata)
        val coverUrl = tagBundle.coverUrl
        val hasTextTags = tagBundle.hasTextTags

        var coverFile: File? = null
        var coverEmbedTemp: File? = null
        if (coverUrl.isNotEmpty()) {
          val rawCover = downloadCover(coverUrl, reactApplicationContext.cacheDir)
          if (rawCover != null) {
            coverEmbedTemp = rawCover
            coverFile = normalizeCoverForEmbed(rawCover, reactApplicationContext.cacheDir)
          }
        }

        if (!hasTextTags && coverFile == null) {
          resolvePath(promise, inFile.absolutePath)
          return@Thread
        }

        val ffmpegBin = File(FfmpegBootstrap.binaryPath(reactApplicationContext))
        if (!ffmpegBin.isFile) {
          resolvePath(promise, inFile.absolutePath)
          return@Thread
        }

        val ext = inFile.extension.lowercase()
        val parentDir = inFile.parentFile ?: reactApplicationContext.cacheDir
        val outFile = File(parentDir, "nrm-meta-${System.currentTimeMillis()}-${inFile.name}")

        var lastError: Exception? = null
        // m4a/mp4: copy만 쓰면 커버는 붙는데 제목·가수 태그가 플레이어에 안 보이는 경우가 많음 → remux 우선
        val mp4Family = ext in setOf("m4a", "mp4", "aac", "mov")
        val strategies =
          if (mp4Family) {
            listOf(
              FfmpegStrategy(withCover = true, audioCopy = true),
              FfmpegStrategy(withCover = true, audioCopy = false),
              FfmpegStrategy(withCover = false, audioCopy = true),
            )
          } else {
            listOf(
              FfmpegStrategy(withCover = true, audioCopy = true),
              FfmpegStrategy(withCover = true, audioCopy = false),
              FfmpegStrategy(withCover = false, audioCopy = true),
            )
          }

        for (strategy in strategies) {
          if (strategy.withCover && coverFile == null) continue
          try {
            runFfmpegMetadata(
              ffmpegBin = ffmpegBin,
              inFile = inFile,
              outFile = outFile,
              coverFile = if (strategy.withCover) coverFile else null,
              ext = ext,
              audioCopy = strategy.audioCopy,
              tags = tagBundle,
            )
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
            if (coverEmbedTemp != null && coverEmbedTemp != coverFile) {
              coverEmbedTemp.delete()
            }
            val ok = com.facebook.react.bridge.Arguments.createMap()
            ok.putString("path", inFile.absolutePath)
            ok.putBoolean("coverEmbedded", strategy.withCover && coverFile != null)
            promise.resolve(ok)
            return@Thread
          } catch (e: Exception) {
            lastError = e
            if (outFile.exists()) outFile.delete()
          }
        }

        coverFile?.delete()
        if (coverEmbedTemp != null && coverEmbedTemp != coverFile) {
          coverEmbedTemp.delete()
        }
        throw lastError ?: Exception("메타데이터 적용에 실패했습니다.")
      } catch (e: Exception) {
        promise.reject("E_METADATA", e.message ?: e.toString(), e)
      }
    }.start()
  }

  /** Samsung Music 등: MediaStore 텍스트 태그 + 앨범아트 DB */
  @ReactMethod
  fun updateMediaStoreAudioTags(mediaUriString: String, metadata: ReadableMap, promise: Promise) {
    Thread {
      try {
        val uri = Uri.parse(mediaUriString.trim())
        val resolver = reactApplicationContext.contentResolver
        val values = ContentValues()
        metadata.getString("title")?.trim()?.takeIf { it.isNotEmpty() }?.let {
          values.put(MediaStore.Audio.Media.TITLE, it)
        }
        metadata.getString("artist")?.trim()?.takeIf { it.isNotEmpty() }?.let {
          values.put(MediaStore.Audio.Media.ARTIST, it)
        }
        metadata.getString("album")?.trim()?.takeIf { it.isNotEmpty() }?.let {
          values.put(MediaStore.Audio.Media.ALBUM, it)
        }
        metadata.getString("genre")?.trim()?.takeIf { it.isNotEmpty() }?.let {
          values.put(MediaStore.Audio.Media.GENRE, it)
        }
        metadata.getString("releaseDate")?.trim()?.takeIf { it.isNotEmpty() }?.let {
          values.put(MediaStore.Audio.Media.YEAR, it.take(4))
        }
        if (values.size() > 0) {
          resolver.update(uri, values, null, null)
        }

        val coverUrl = metadata.getString("coverUrl")?.trim().orEmpty()
        if (coverUrl.isNotEmpty()) {
          val cover = downloadCover(coverUrl, reactApplicationContext.cacheDir)
          if (cover != null) {
            try {
              trySetMediaStoreAlbumArt(uri, cover)
            } finally {
              cover.delete()
            }
          }
        }

        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("E_MEDIA_STORE", e.message ?: e.toString(), e)
      }
    }.start()
  }

  private data class FfmpegStrategy(val withCover: Boolean, val audioCopy: Boolean)

  private data class MetadataTagBundle(
    val artist: String,
    val title: String,
    val album: String,
    val genre: String,
    val releaseDate: String,
    val coverUrl: String,
    val albumArtist: String,
    val trackNumber: String,
    val discNumber: String,
    val composer: String,
    val lyrics: String,
    val bpm: String,
    val copyright: String,
    val website: String,
    val producer: String,
    val remixer: String,
  ) {
    val hasTextTags: Boolean
      get() =
        artist.isNotEmpty() ||
          title.isNotEmpty() ||
          album.isNotEmpty() ||
          genre.isNotEmpty() ||
          releaseDate.isNotEmpty() ||
          albumArtist.isNotEmpty() ||
          trackNumber.isNotEmpty() ||
          website.isNotEmpty()
  }

  private fun readMetadataTags(metadata: ReadableMap): MetadataTagBundle {
    fun s(key: String) = metadata.getString(key)?.trim().orEmpty()
    val artist = s("artist")
    var albumArtist = s("albumArtist")
    if (albumArtist.isEmpty() && artist.isNotEmpty()) albumArtist = artist
    return MetadataTagBundle(
      artist = artist,
      title = s("title"),
      album = s("album"),
      genre = s("genre"),
      releaseDate = s("releaseDate"),
      coverUrl = s("coverUrl"),
      albumArtist = albumArtist,
      trackNumber = s("trackNumber"),
      discNumber = s("discNumber"),
      composer = s("composer"),
      lyrics = s("lyrics"),
      bpm = s("bpm"),
      copyright = s("copyright"),
      website = s("website"),
      producer = s("producer"),
      remixer = s("remixer"),
    )
  }

  private fun resolvePath(promise: Promise, path: String) {
    val ok = com.facebook.react.bridge.Arguments.createMap()
    ok.putString("path", path)
    ok.putBoolean("coverEmbedded", false)
    promise.resolve(ok)
  }

  /**
   * ffmpeg 인자 순서 (중요):
   *   ffmpeg -y -i <audio> [-i <cover>]
   *     -map 0:a:0  [-map 1:v:0  -disposition:v:0 attached_pic  -metadata:s:v ..]
   *     -c:a <codec>
   *     [-c:v <codec>]
   *     -movflags +faststart  ← m4a (use_metadata_tags 는 Windows에서 태그 미표시)
   *     [-id3v2_version 3]                       ← 출력 파일 직전 (mp3)
   *     -metadata key=val ...
   *     -metadata key=val (m4a: iTunes ilst ©nam·©ART — 스트림 중복 태그 없음)
   *     <output>
   */
  private fun runFfmpegMetadata(
    ffmpegBin: File,
    inFile: File,
    outFile: File,
    coverFile: File?,
    ext: String,
    audioCopy: Boolean,
    tags: MetadataTagBundle,
  ) {
    val mp4Family = ext in setOf("m4a", "mp4", "aac", "mov")
    val cmd = mutableListOf(ffmpegBin.absolutePath, "-y", "-i", inFile.absolutePath)

    if (coverFile != null) {
      cmd.add("-i"); cmd.add(coverFile.absolutePath)
    }

    cmd.add("-map_metadata"); cmd.add("-1")

    cmd.add("-map"); cmd.add("0:a:0")
    if (coverFile != null) {
      cmd.add("-map"); cmd.add("1:v:0")
      cmd.add("-disposition:v:0"); cmd.add("attached_pic")
      cmd.add("-metadata:s:v"); cmd.add("title=Album cover")
      cmd.add("-metadata:s:v"); cmd.add("comment=Cover (front)")
    }

    if (audioCopy) {
      cmd.add("-c:a"); cmd.add("copy")
    } else if (ext == "mp3") {
      cmd.add("-c:a"); cmd.add("libmp3lame")
      cmd.add("-b:a"); cmd.add("192k")
    } else {
      cmd.add("-c:a"); cmd.add("copy")
    }

    if (coverFile != null) {
      cmd.add("-c:v"); cmd.add("mjpeg")
    }

    if (mp4Family) {
      cmd.add("-movflags"); cmd.add("+faststart")
    }
    if (ext == "mp3") {
      cmd.add("-id3v2_version"); cmd.add("3")
    }

    fun putTag(logicalKey: String, value: String) {
      if (value.isEmpty()) return
      val ffmpegKey =
        if (mp4Family) {
          when (logicalKey) {
            "artist" -> "author"
            "date" -> "year"
            "disc" -> "disk"
            else -> logicalKey
          }
        } else {
          logicalKey
        }
      cmd.add("-metadata"); cmd.add("$ffmpegKey=$value")
    }
    fun putArtistTag(value: String) {
      if (value.isEmpty()) return
      putTag("artist", value)
      if (mp4Family) {
        // Windows "참여 아티스트" 호환을 위해 artist 키도 병행 기록
        cmd.add("-metadata"); cmd.add("artist=$value")
      }
    }
    putTag("title", tags.title)
    putArtistTag(tags.artist)
    putTag("album_artist", tags.albumArtist)
    putTag("album", tags.album)
    putTag("genre", tags.genre)
    putTag("date", tags.releaseDate)
    putTag("track", tags.trackNumber)
    putTag("disc", tags.discNumber)
    putTag("composer", tags.composer)
    if (!mp4Family) {
      putTag("lyrics", tags.lyrics)
    }
    putTag("bpm", tags.bpm)
    putTag("copyright", tags.copyright)
    putTag("website", tags.website)
    putTag("producer", tags.producer)
    putTag("remixer", tags.remixer)

    cmd.add(outFile.absolutePath)
    execFfmpeg(cmd)
  }

  /** m4a·삼성 뮤직·Windows 호환 — 커버를 JPEG로 정규화 */
  private fun normalizeCoverForEmbed(cover: File, cacheDir: File): File {
    val ext = cover.extension.lowercase()
    if (ext == "jpg" || ext == "jpeg") return cover
    val bitmap = BitmapFactory.decodeFile(cover.absolutePath) ?: return cover
    val jpeg = File(cacheDir, "nrm-cover-embed-${System.currentTimeMillis()}.jpg")
    return try {
      FileOutputStream(jpeg).use { output ->
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 92, output)) {
          cover
        } else {
          jpeg
        }
      }
    } catch (_: Exception) {
      cover
    } finally {
      bitmap.recycle()
    }
  }

  private fun execFfmpeg(cmd: List<String>) {
    val proc =
      ProcessBuilder(cmd)
        .redirectErrorStream(true)
        .start()
    val finished = proc.waitFor(180, TimeUnit.SECONDS)
    if (!finished || proc.exitValue() != 0) {
      val err = proc.inputStream.bufferedReader().readText()
      throw Exception("ffmpeg metadata failed: $err")
    }
  }

  /** Android albumart content provider (삼성 뮤직 등 로컬 라이브러리) */
  private fun trySetMediaStoreAlbumArt(audioUri: Uri, coverFile: File) {
    val resolver = reactApplicationContext.contentResolver
    var albumId = 0L
    resolver.query(
      audioUri,
      arrayOf(MediaStore.Audio.Media.ALBUM_ID),
      null,
      null,
      null,
    )?.use { cursor ->
      if (cursor.moveToFirst()) {
        albumId = cursor.getLong(0)
      }
    }
    if (albumId <= 0L) return

    val bitmap =
      BitmapFactory.decodeFile(coverFile.absolutePath)
        ?: return

    val artBase = Uri.parse("content://media/external/audio/albumart")
    val artUri = ContentUris.withAppendedId(artBase, albumId)
    try {
      resolver.delete(artUri, null, null)
    } catch (_: Exception) {
    }
    resolver.openOutputStream(artUri)?.use { output ->
      bitmap.compress(Bitmap.CompressFormat.JPEG, 92, output)
    }
  }

  private fun downloadCover(url: String, dir: File?): File? {
    return try {
      if (url.isBlank()) return null
      val parent = dir ?: reactApplicationContext.cacheDir

      fun isMinSize(out: File): Boolean = out.length() >= 256L

      fun writeBytesToOut(bytes: ByteArray, ext: String): File {
        val out = File(parent, "nrm-cover-${System.currentTimeMillis()}$ext")
        FileOutputStream(out).use { output -> output.write(bytes) }
        if (!isMinSize(out)) {
          out.delete()
          return out // caller에서 null 처리용
        }
        return out
      }

      if (url.startsWith("data:")) {
        val comma = url.indexOf(',')
        if (comma < 0) return null
        val meta = url.substring("data:".length, comma).lowercase()
        val b64 = url.substring(comma + 1)
        val bytes = Base64.decode(b64, Base64.DEFAULT)
        val ext =
          when {
            meta.contains("png") -> ".png"
            meta.contains("webp") -> ".webp"
            meta.contains("jpeg") || meta.contains("jpg") -> ".jpg"
            else -> ".jpg"
          }
        val out = writeBytesToOut(bytes, ext)
        return if (isMinSize(out)) out else null
      }

      if (url.startsWith("file://")) {
        val path = url.removePrefix("file://")
        val src = File(path)
        if (!src.isFile) return null
        val srcExt = src.extension.lowercase()
        val ext = if (srcExt.isNotEmpty()) ".$srcExt" else ".jpg"
        val out = File(parent, "nrm-cover-${System.currentTimeMillis()}$ext")
        src.copyTo(out, overwrite = true)
        return if (isMinSize(out)) out else null
      }

      if (url.startsWith("content://")) {
        val uri = Uri.parse(url)
        val resolver = reactApplicationContext.contentResolver
        val mime = resolver.getType(uri)?.lowercase() ?: ""
        val ext =
          when {
            mime.contains("png") -> ".png"
            mime.contains("webp") -> ".webp"
            mime.contains("jpeg") || mime.contains("jpg") -> ".jpg"
            else -> ".jpg"
          }
        val out = File(parent, "nrm-cover-${System.currentTimeMillis()}$ext")
        resolver.openInputStream(uri)?.use { input ->
          FileOutputStream(out).use { output -> input.copyTo(output) }
        } ?: return null
        return if (isMinSize(out)) out else null
      }

      // http(s)
      val httpsUrl =
        if (url.startsWith("http://")) {
          "https://${url.removePrefix("http://")}"
        } else {
          url
        }
      val ext =
        when {
          httpsUrl.contains(".png", ignoreCase = true) -> ".png"
          httpsUrl.contains(".webp", ignoreCase = true) -> ".webp"
          else -> ".jpg"
        }
      val out = File(parent, "nrm-cover-${System.currentTimeMillis()}$ext")
      val conn = URL(httpsUrl).openConnection() as HttpURLConnection
      conn.connectTimeout = 20_000
      conn.readTimeout = 30_000
      conn.instanceFollowRedirects = true
      conn.setRequestProperty("User-Agent", "NullReferenceMusic/1.0")
      conn.setRequestProperty("Accept", "image/*")
      conn.connect()
      if (conn.responseCode !in 200..299) {
        conn.disconnect()
        return null
      }
      conn.inputStream.use { input ->
        FileOutputStream(out).use { output -> input.copyTo(output) }
      }
      return if (isMinSize(out)) out else null
    } catch (_: Exception) {
      null
    }
  }
}
