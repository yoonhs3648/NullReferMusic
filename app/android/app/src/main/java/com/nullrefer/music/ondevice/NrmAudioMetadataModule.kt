package com.nullrefer.music.ondevice

import android.content.ContentUris
import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.nullrefer.music.BuildConfig
import com.nullrefer.music.NrmBrand
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.TimeUnit

class NrmAudioMetadataModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private fun uniqueCacheFile(dir: File, prefix: String, ext: String): File {
    return File(dir, "$prefix-${System.currentTimeMillis()}-${UUID.randomUUID()}$ext")
  }

  override fun getName(): String = "NrmAudioMetadata"

  @ReactMethod
  fun applyMetadata(inputPath: String, metadata: ReadableMap, promise: Promise) {
    Thread {
      val stageT0 = SystemClock.elapsedRealtime()
      NrmStageLog.log("ffmpeg", "meta_embed_start", mapOf("input" to inputPath.take(120)))
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

        if (FfmpegExec.resolve(reactApplicationContext) == null) {
          resolvePath(promise, inFile.absolutePath)
          return@Thread
        }

        val ext = inFile.extension.lowercase()
        val parentDir = inFile.parentFile ?: reactApplicationContext.cacheDir
        val outFile = File(parentDir, "nrm-meta-${System.currentTimeMillis()}-${inFile.name}")

        var lastError: Exception? = null
        // m4a/mp4: copy만 쓰면 커버는 붙는데 제목·가수 태그가 플레이어에 안 보이는 경우가 많음 → remux 우선
        val mp4Family = ext in setOf("m4a", "mp4", "aac", "mov")
        // 비 MP3 포맷에서 audioCopy=false는 결국 "-c:a copy"와 동일 → strategy 1·2 중복.
        // WAV/FLAC는 attached_pic 지원이 불안정 → 커버 없이 바로 태그만.
        // MP3만 strategy 2에서 실제 재인코딩이 이루어지므로 3가지 전략 유지.
        val strategies =
          when {
            ext == "mp3" -> listOf(
              FfmpegStrategy(withCover = true, audioCopy = true),
              FfmpegStrategy(withCover = true, audioCopy = false),  // 재인코딩 폴백
              FfmpegStrategy(withCover = false, audioCopy = true),
            )
            ext in setOf("wav", "flac") -> listOf(
              // WAV·FLAC: attached_pic 임베드 시도 시 ffmpeg 오류 또는 미지원 → 태그만
              FfmpegStrategy(withCover = false, audioCopy = true),
            )
            mp4Family -> listOf(
              FfmpegStrategy(withCover = true, audioCopy = true),
              FfmpegStrategy(withCover = false, audioCopy = true),  // 커버 실패 폴백
            )
            else -> listOf(
              FfmpegStrategy(withCover = true, audioCopy = true),
              FfmpegStrategy(withCover = false, audioCopy = true),
            )
          }

        for (strategy in strategies) {
          if (strategy.withCover && coverFile == null) continue
          try {
            runFfmpegMetadata(
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
            NrmStageLog.log(
                "ffmpeg",
                "meta_embed_ok",
                mapOf(
                    "elapsedMs" to (SystemClock.elapsedRealtime() - stageT0),
                    "coverEmbedded" to (strategy.withCover && coverFile != null),
                    "bytes" to inFile.length(),
                ),
            )
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
      } catch (t: Throwable) {
        NrmStageLog.log(
            "ffmpeg",
            "meta_embed_fail",
            mapOf(
                "elapsedMs" to (SystemClock.elapsedRealtime() - stageT0),
                "err" to (t.message ?: t.toString()).take(200),
            ),
        )
        promise.reject("E_METADATA", t.message ?: t.toString(), t as? Exception)
      }
    }.start()
  }

  /**
   * 여러 파트 파일을 메모리에 올리지 않고 스트리밍으로 순서대로 이어붙인다.
   * JS base64 병합 대신 사용해 UI 프리즈를 방지한다.
   */
  @ReactMethod
  fun concatFiles(parts: com.facebook.react.bridge.ReadableArray, dest: String, promise: Promise) {
    Thread {
      try {
        val destFile = File(dest)
        destFile.parentFile?.mkdirs()
        java.io.FileOutputStream(destFile).use { out ->
          for (i in 0 until parts.size()) {
            val partPath = parts.getString(i) ?: continue
            val partFile = File(partPath)
            if (!partFile.isFile) throw Exception("파트 파일이 없습니다: $partPath")
            partFile.inputStream().use { it.copyTo(out) }
          }
        }
        for (i in 0 until parts.size()) {
          try { File(parts.getString(i) ?: continue).delete() } catch (_: Exception) {}
        }
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("E_CONCAT", t.message ?: t.toString(), t as? Exception)
      }
    }.start()
  }

  /** 저장된 오디오 ID3/컨테이너 메타 + 임베디드 커버 읽기 (ffmpeg -i 파싱) */
  @ReactMethod
  fun readMetadata(inputPath: String, promise: Promise) {
    Thread {
      try {
        val inFile = File(inputPath)
        if (!inFile.isFile) {
          promise.reject("E_ARG", "입력 파일이 없습니다.")
          return@Thread
        }
        val paths =
            FfmpegExec.resolve(reactApplicationContext)
                ?: throw Exception("ffmpeg를 사용할 수 없습니다.")
        val (_, probeOut) =
            FfmpegExec.runCapture(
                paths.binary,
                paths.libDir,
                listOf("-hide_banner", "-i", inFile.absolutePath),
                tag = "ffmpeg-read-meta",
                timeoutSec = 90,
            )
        val out = Arguments.createMap()
        parseFfmpegProbeMetadata(probeOut, out)
        val embeddedMode = out.getString("nrmLyricsMode")?.trim().orEmpty()
        val extLower = inFile.extension.lowercase()
        // MP3: FFmpeg probe가 SYLT/USLT 바이너리 프레임을 텍스트로 출력하지 않으므로 직접 디코드
        if (extLower == "mp3") {
          if (embeddedMode.isEmpty()) {
            readNrmLyricsModeFromMp3(inFile)?.let { out.putString("nrmLyricsMode", it) }
          }
          if (!out.hasKey("lyrics")) {
            val embeddedLrc = readEmbeddedLyricsFromMp3(inFile)
            if (embeddedLrc != null) out.putString("lyrics", embeddedLrc)
          }
        } else if (extLower in setOf("m4a", "mp4", "aac", "mov")) {
          val ffmeta = readM4aCustomFieldsFromFfmetadata(inFile, paths)
          if (embeddedMode.isEmpty()) {
            ffmeta.lyricsMode?.let { out.putString("nrmLyricsMode", it) }
          }
          val commentUrl = ffmeta.comment?.trim().orEmpty()
          if (commentUrl.isNotEmpty()) {
            out.putString("website", commentUrl)
          }
        }
        val coverFile = extractEmbeddedCoverFile(paths, inFile)
        if (coverFile != null) {
          out.putString("coverUrl", "file://${coverFile.absolutePath}")
        }
        promise.resolve(out)
      } catch (t: Throwable) {
        promise.reject("E_READ_META", t.message ?: t.toString(), t as? Exception)
      }
    }.start()
  }

  /** 파일 시스템 경로 재스캔 후 MediaStore 태그 동기화 */
  @ReactMethod
  fun rescanMediaFile(inputPath: String, metadata: ReadableMap, promise: Promise) {
    Thread {
      try {
        val inFile = File(inputPath)
        if (!inFile.isFile) {
          promise.reject("E_ARG", "입력 파일이 없습니다.")
          return@Thread
        }
        val mime =
            when (inFile.extension.lowercase()) {
              "mp3" -> "audio/mpeg"
              "m4a", "mp4" -> "audio/mp4"
              "flac" -> "audio/flac"
              "ogg" -> "audio/ogg"
              "wav" -> "audio/wav"
              else -> "audio/*"
            }
        val latch = java.util.concurrent.CountDownLatch(1)
        var mediaUri: Uri? = null
        MediaScannerConnection.scanFile(
            reactApplicationContext,
            arrayOf(inFile.absolutePath),
            arrayOf(mime),
        ) { _, uri ->
          mediaUri = uri
          latch.countDown()
        }
        if (!latch.await(20, TimeUnit.SECONDS)) {
          promise.reject("E_MEDIA_SCAN", "미디어 스캔 시간이 초과되었습니다.")
          return@Thread
        }
        val uri = mediaUri
        if (uri != null) {
          applyMediaStoreTagUpdate(uri, metadata)
        }
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("E_MEDIA_SCAN", t.message ?: t.toString(), t as? Exception)
      }
    }.start()
  }

  /** Samsung Music 등: MediaStore 텍스트 태그 + 앨범아트 DB */
  @ReactMethod
  fun updateMediaStoreAudioTags(mediaUriString: String, metadata: ReadableMap, promise: Promise) {
    Thread {
      try {
        val uri = Uri.parse(mediaUriString.trim())
        applyMediaStoreTagUpdate(uri, metadata)
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("E_MEDIA_STORE", t.message ?: t.toString(), t as? Exception)
      }
    }.start()
  }

  private fun applyMediaStoreTagUpdate(uri: Uri, metadata: ReadableMap) {
    val resolver = reactApplicationContext.contentResolver
    val values = ContentValues()
    metadata.getString("title")?.trim()?.takeIf { it.isNotEmpty() }?.let {
      values.put(MediaStore.Audio.Media.TITLE, it)
    }
    metadata.getString("artist")?.trim()?.takeIf { it.isNotEmpty() }?.let {
      values.put(MediaStore.Audio.Media.ARTIST, it)
    }
    metadata.getString("albumArtist")?.trim()?.takeIf { it.isNotEmpty() }?.let {
      values.put(MediaStore.Audio.Media.ALBUM_ARTIST, it)
    }
    val albumValue = metadata.getString("album")?.trim().orEmpty()
    if (albumValue.isNotEmpty()) {
      values.put(MediaStore.Audio.Media.ALBUM, albumValue)
    } else {
      values.putNull(MediaStore.Audio.Media.ALBUM)
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
    inFile: File,
    outFile: File,
    coverFile: File?,
    ext: String,
    audioCopy: Boolean,
    tags: MetadataTagBundle,
  ) {
    val mp4Family = ext in setOf("m4a", "mp4", "aac", "mov")
    val cmd = mutableListOf("-y", "-i", inFile.absolutePath)

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
      if (FfmpegEncoderSupport.canReencodeMp3(reactApplicationContext)) {
        if (FfmpegEncoderSupport.encoders(reactApplicationContext).contains("libshine")) {
          cmd.add("-c:a"); cmd.add("libshine")
          cmd.add("-b:a"); cmd.add("128k")
        } else {
          cmd.add("-c:a"); cmd.add("libmp3lame")
          cmd.add("-b:a"); cmd.add("192k")
        }
      } else {
        cmd.add("-c:a"); cmd.add("copy")
      }
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
      cmd.add("-write_id3v1"); cmd.add("0")
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
    fun putTagAllowEmpty(logicalKey: String, value: String) {
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
    // 앨범 값이 비어 있으면 빈 태그를 명시해 플레이어 기본값 주입을 막는다.
    putTagAllowEmpty("album", tags.album)
    putTag("genre", tags.genre)
    putTag("date", tags.releaseDate)
    putTag("track", tags.trackNumber)
    putTag("disc", tags.discNumber)
    putTag("composer", tags.composer)
    putTag("bpm", tags.bpm)
    putTag("copyright", tags.copyright)
    if (tags.website.isNotEmpty()) {
      if (mp4Family) {
        putTag("comment", tags.website)
      } else {
        putTag("website", tags.website)
      }
    }
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
    val jpeg = uniqueCacheFile(cacheDir, "nrm-cover-embed", ".jpg")
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
    FfmpegExec.run(reactApplicationContext, cmd, tag = "ffmpeg-meta")
  }

  // ── 결합 transcode + metadata (비 MP3 포맷 변환 최적화) ─────────────────────

  /**
   * 비 MP3 포맷 변환 시 transcode 와 메타데이터 삽입을 단일 ffmpeg 패스로 처리.
   * 기존에는 transcode → 대형 파일 쓰기 → metadata remux → 다시 대형 파일 쓰기 의 2회 I/O.
   * 특히 WAV (~30 MB/분) 는 단일 패스로 I/O 를 절반 이하로 줄인다.
   *
   * MP3 는 shineenc 파이프를 사용하므로 이 메서드 호출 대상 아님.
   */
  @ReactMethod
  fun transcodeAndApplyMetadata(
    inputPath: String,
    audioFormat: String,
    audioQuality: Int,
    vbrMode: String,
    losslessMode: String,
    metadata: ReadableMap,
    promise: Promise,
  ) {
    Thread {
      val stageT0 = SystemClock.elapsedRealtime()
      val encodeOptions =
        AudioEncodeOptions(
          quality = audioQuality.coerceIn(0, 9),
          vbrMode = vbrMode.trim().ifBlank { "vbr_best" },
          losslessMode = losslessMode.trim().ifBlank { "smart" },
        )
      NrmStageLog.log(
        "ffmpeg",
        "transcode_meta_start",
        mapOf(
          "input" to inputPath.take(120),
          "format" to audioFormat,
          "vbrMode" to encodeOptions.vbrMode,
        ),
      )
      try {
        val srcPath = inputPath.removePrefix("file://")
        val src = File(srcPath)
        if (!src.isFile) {
          promise.reject("E_ARG", "입력 파일이 없습니다.")
          return@Thread
        }

        val ctx = reactApplicationContext.applicationContext
        val fmt = audioFormat.trim().lowercase().ifBlank { "m4a" }

        val audioSrc = AudioDemux.ensureAudioOnly(ctx, src, encodeOptions)

        val paths =
          FfmpegBootstrap.ensure(ctx)
            ?: throw IllegalStateException("ffmpeg를 사용할 수 없습니다.")

        val plan = FfmpegEncoderSupport.plan(ctx, fmt, encodeOptions)
        if (plan.fallbackReason != null) {
          throw Exception("TRANSCODE_FORMAT_UNAVAILABLE:$fmt")
        }

        val tagBundle = readMetadataTags(metadata)

        // WAV·FLAC: attached_pic 지원 불안정 → 커버 스킵
        val skipCover = fmt in setOf("wav", "flac")
        var coverFile: File? = null
        var coverEmbedTemp: File? = null
        if (!skipCover && tagBundle.coverUrl.isNotEmpty()) {
          val rawCover = downloadCover(tagBundle.coverUrl, reactApplicationContext.cacheDir)
          if (rawCover != null) {
            coverEmbedTemp = rawCover
            coverFile = normalizeCoverForEmbed(rawCover, reactApplicationContext.cacheDir)
          }
        }

        val basePath =
          audioSrc.absolutePath.let { p ->
            val d = p.lastIndexOf('.')
            if (d > 0) p.substring(0, d) else p
          }
        val outFile = File("$basePath.${plan.outputExt}")

        var coverEmbedded = false
        NrmMediaCpuPriority.runFfmpegPriority {
          try {
            runCombinedTranscodeAndMetadata(
              paths, audioSrc, outFile, plan.outputExt, plan.codecArgs, coverFile, tagBundle,
            )
            coverEmbedded = coverFile != null
          } catch (e1: Exception) {
            if (outFile.exists()) outFile.delete()
            if (coverFile != null) {
              // 커버 실패 → 커버 없이 재시도
              NrmFileLogger.warn("ffmpeg-transcode-meta", "커버 포함 변환 실패, 커버 없이 재시도: ${e1.message}")
              runCombinedTranscodeAndMetadata(
                paths, audioSrc, outFile, plan.outputExt, plan.codecArgs, null, tagBundle,
              )
              coverEmbedded = false
            } else {
              throw e1
            }
          }
        }

        if (!outFile.isFile || outFile.length() <= 0L) {
          throw Exception("TRANSCODE_META_OUTPUT_EMPTY")
        }

        coverFile?.delete()
        if (coverEmbedTemp != null && coverEmbedTemp != coverFile) coverEmbedTemp.delete()
        try {
          audioSrc.delete()
        } catch (_: Exception) {
        }

        NrmStageLog.log(
          "ffmpeg",
          "transcode_meta_ok",
          mapOf(
            "elapsedMs" to (SystemClock.elapsedRealtime() - stageT0),
            "format" to fmt,
            "bytes" to outFile.length(),
            "coverEmbedded" to coverEmbedded,
          ),
        )
        val ok = Arguments.createMap()
        ok.putString("path", outFile.absolutePath)
        ok.putBoolean("coverEmbedded", coverEmbedded)
        promise.resolve(ok)
      } catch (t: Throwable) {
        NrmStageLog.log(
          "ffmpeg",
          "transcode_meta_fail",
          mapOf(
            "elapsedMs" to (SystemClock.elapsedRealtime() - stageT0),
            "err" to (t.message ?: t.toString()).take(200),
          ),
        )
        promise.reject("E_TRANSCODE_META", t.message ?: t.toString(), t as? Exception)
      }
    }.start()
  }

  /**
   * transcode 와 메타데이터를 단일 ffmpeg 호출로 처리하는 내부 헬퍼.
   * codecArgs: FfmpegEncoderSupport.plan() 이 반환한 코덱 인수
   *   (예: ["-ar","44100","-ac","2","-codec:a","pcm_s16le"] for wav,
   *        ["-codec:a","aac","-b:a","192k"] for m4a)
   */
  private fun runCombinedTranscodeAndMetadata(
    paths: FfmpegBootstrap.FfmpegPaths,
    input: File,
    outFile: File,
    outputExt: String,
    codecArgs: List<String>,
    coverFile: File?,
    tags: MetadataTagBundle,
  ) {
    val mp4Family = outputExt in setOf("m4a", "mp4", "aac", "mov")

    val cmd = mutableListOf("-y", "-i", input.absolutePath)
    if (coverFile != null) {
      cmd += listOf("-i", coverFile.absolutePath)
    }

    // 명시적 스트림 매핑 (-vn 미사용 → 커버 스트림과 충돌 방지)
    cmd += listOf("-map_metadata", "-1")
    cmd += listOf("-map", "0:a:0")
    if (coverFile != null) {
      cmd += listOf(
        "-map", "1:v:0",
        "-disposition:v:0", "attached_pic",
        "-metadata:s:v", "title=Album cover",
        "-metadata:s:v", "comment=Cover (front)",
      )
    }

    // 오디오 코덱 인수 (transcode plan 에서 가져옴)
    cmd.addAll(codecArgs)

    if (coverFile != null) {
      cmd += listOf("-c:v", "mjpeg")
    }
    if (mp4Family) {
      cmd += listOf("-movflags", "+faststart")
    }

    // 태그 삽입 헬퍼
    fun ffKey(key: String): String =
      if (mp4Family) when (key) {
        "artist" -> "author"; "date" -> "year"; "disc" -> "disk"; else -> key
      } else key

    fun putTag(key: String, value: String) {
      if (value.isEmpty()) return
      cmd += listOf("-metadata", "${ffKey(key)}=$value")
    }

    fun putTagAllowEmpty(key: String, value: String) {
      cmd += listOf("-metadata", "${ffKey(key)}=$value")
    }

    putTag("title", tags.title)
    if (tags.artist.isNotEmpty()) {
      cmd += listOf("-metadata", "${ffKey("artist")}=${tags.artist}")
      if (mp4Family) cmd += listOf("-metadata", "artist=${tags.artist}")
    }
    putTag("album_artist", tags.albumArtist)
    putTagAllowEmpty("album", tags.album)
    putTag("genre", tags.genre)
    putTag("date", tags.releaseDate)
    putTag("track", tags.trackNumber)
    putTag("disc", tags.discNumber)
    putTag("composer", tags.composer)
    putTag("bpm", tags.bpm)
    putTag("copyright", tags.copyright)
    if (tags.website.isNotEmpty()) {
      if (mp4Family) {
        putTag("comment", tags.website)
      } else {
        putTag("website", tags.website)
      }
    }
    putTag("producer", tags.producer)
    putTag("remixer", tags.remixer)

    cmd.add(outFile.absolutePath)

    NrmFileLogger.log(
      "ffmpeg-transcode-meta",
      "단일패스 시작 in=${input.absolutePath} out=${outFile.absolutePath} ext=$outputExt coverFile=${coverFile?.name}",
    )
    FfmpegExec.runWithPaths(paths.binary, paths.libDir, cmd, tag = "ffmpeg-transcode-meta")
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

  private enum class ProbeMetaContext {
    FORMAT,
    AUDIO_STREAM,
    VIDEO_STREAM,
    OTHER,
  }

  private fun isBogusEmbeddedTitle(value: String): Boolean {
    return when (value.trim().lowercase()) {
      "album cover",
      "cover (front)",
      "cover",
      "front cover",
      "album art" -> true
      else -> false
    }
  }

  private fun parseFfmpegProbeMetadata(output: String, out: WritableMap) {
    val keyToField =
        mapOf(
            "title" to "title",
            "artist" to "artist",
            "album" to "album",
            "album_artist" to "albumArtist",
            "albumartist" to "albumArtist",
            "genre" to "genre",
            "date" to "releaseDate",
            "composer" to "composer",
            "track" to "trackNumber",
            "disc" to "discNumber",
            "copyright" to "copyright",
            "website" to "website",
            "tbpm" to "bpm",
            "bpm" to "bpm",
            "producer" to "producer",
            "remixer" to "remixer",
            "lyrics" to "lyrics",
            "nrm_lyrics_mode" to "nrmLyricsMode",
        )
    var context = ProbeMetaContext.FORMAT
    // lyrics 멀티라인은 별도 누적 처리
    var collectingLyrics = false
    val lyricsLines = mutableListOf<String>()

    fun flushLyrics() {
      if (collectingLyrics && lyricsLines.isNotEmpty() && !out.hasKey("lyrics")) {
        out.putString("lyrics", lyricsLines.joinToString("\n"))
      }
      collectingLyrics = false
      lyricsLines.clear()
    }

    for (line in output.lineSequence()) {
      when {
        Regex("""^\s*Stream #\d+:\d+:\s*Audio:""").containsMatchIn(line) -> {
          flushLyrics()
          context = ProbeMetaContext.AUDIO_STREAM
        }
        Regex("""^\s*Stream #\d+:\d+:\s*Video:""").containsMatchIn(line) -> {
          flushLyrics()
          context = ProbeMetaContext.VIDEO_STREAM
        }
        line.trimStart().startsWith("Stream #") && !line.contains("Audio:") && !line.contains("Video:") -> {
          flushLyrics()
          context = ProbeMetaContext.OTHER
        }
      }
      if (context == ProbeMetaContext.VIDEO_STREAM || context == ProbeMetaContext.OTHER) {
        continue
      }
      val m = Regex("""^\s+([A-Za-z0-9_]+)\s*:\s+(.*)$""").find(line)
      if (m != null) {
        flushLyrics()
        val rawKey = m.groupValues[1].lowercase()
        val field = keyToField[rawKey] ?: continue
        val value = m.groupValues[2].trim()
        if (value.isEmpty() || out.hasKey(field)) continue
        if (field == "title" && isBogusEmbeddedTitle(value)) continue
        when (field) {
          "lyrics" -> {
            collectingLyrics = true
            if (value.isNotEmpty()) lyricsLines.add(value)
          }
          else -> out.putString(field, value)
        }
      } else if (collectingLyrics) {
        if (lyricsLines.size < 50) {
          val trimmed = line.trimEnd()
          if (trimmed.isNotEmpty()) lyricsLines.add(trimmed)
        }
      }
    }
    flushLyrics()
  }

  private fun extractEmbeddedCoverFile(
      paths: FfmpegBootstrap.FfmpegPaths,
      inFile: File,
  ): File? {
    if (!probeOutHasAttachedPic(inFile, paths)) return null
    val cache = reactApplicationContext.cacheDir
    val cover = uniqueCacheFile(cache, "nrm-read-cover", ".jpg")
    val (code, _) =
        FfmpegExec.runCapture(
            paths.binary,
            paths.libDir,
            listOf(
                "-hide_banner",
                "-y",
                "-i",
                inFile.absolutePath,
                "-map",
                "0:v:0",
                "-c",
                "copy",
                cover.absolutePath,
            ),
            tag = "ffmpeg-read-cover",
            timeoutSec = 60,
        )
    if (cover.isFile && cover.length() >= 256L) return cover
    cover.delete()
    return null
  }

  private fun probeOutHasAttachedPic(inFile: File, paths: FfmpegBootstrap.FfmpegPaths): Boolean {
    val (_, out) =
        FfmpegExec.runCapture(
            paths.binary,
            paths.libDir,
            listOf("-hide_banner", "-i", inFile.absolutePath),
            tag = "ffmpeg-read-cover-probe",
            timeoutSec = 30,
        )
    return out.contains("Video:") || out.contains("attached pic") || out.contains("mjpeg")
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 싱크 가사 임베드: m4a → ©lyr (FFmpeg), mp3 → ID3 SYLT 프레임
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * 오디오 파일에 LRC 동기화 가사를 직접 임베드.
   * - m4a/mp4/aac: FFmpeg -metadata lyrics=<lrc> → ©lyr atom
   * - mp3: USLT(LRC 텍스트) + SYLT(ID3 싱크) — Musicolet 등은 USLT의 LRC 구문으로 싱크 재생
   * audioUri: file:// 또는 content:// (SAF) URI
   */
  @ReactMethod
  fun embedSyncedLyrics(
      audioUri: String,
      lrcContent: String,
      extension: String,
      lyricsMode: String?,
      plainLyrics: String?,
      promise: Promise,
  ) {
    Thread {
      val t0 = SystemClock.elapsedRealtime()
      val modeToken = lyricsMode?.trim().orEmpty()
      NrmStageLog.log(
          "ffmpeg",
          "embed_synced_lyrics_start",
          mapOf(
              "uri" to audioUri.take(80),
              "ext" to extension,
              "mode" to modeToken.take(24),
          ),
      )
      try {
        val ext = extension.lowercase().trimStart('.')
        val (workFile, isTemp) = resolveAudioToWorkFile(audioUri, ext)
        try {
          when (ext) {
            "m4a", "mp4", "aac" -> embedLyricsM4a(workFile, lrcContent, modeToken)
            "mp3" -> embedLyricsMp3(workFile, lrcContent, modeToken)
            else -> throw Exception("지원하지 않는 확장자: $ext")
          }
          if (isTemp) writeWorkFileBackToUri(workFile, audioUri)
          NrmStageLog.log("ffmpeg", "embed_synced_lyrics_ok", mapOf(
            "ext" to ext, "elapsedMs" to (SystemClock.elapsedRealtime() - t0)
          ))
          promise.resolve(null)
        } finally {
          if (isTemp) workFile.delete()
        }
      } catch (t: Throwable) {
        NrmStageLog.log("ffmpeg", "embed_synced_lyrics_fail", mapOf(
          "ext" to extension, "err" to (t.message ?: t.toString()).take(200)
        ))
        promise.reject("E_EMBED_LYRICS", "가사 임베드 실패: ${t.message}", t as? Exception)
      }
    }.start()
  }

  /**
   * 싱크 가사만 제거.
   * - mp3: USLT·SYLT·TXXX(NRM_LYRICS_MODE) 제거
   * - m4a/mp4/aac: ©lyr(lyrics)·nrm_lyrics_mode 제거
   */
  @ReactMethod
  fun stripSyncedEmbeddedLyrics(audioUri: String, extension: String, promise: Promise) {
    Thread {
      val t0 = SystemClock.elapsedRealtime()
      NrmStageLog.log(
          "ffmpeg",
          "strip_synced_lyrics_start",
          mapOf("uri" to audioUri.take(80), "ext" to extension),
      )
      try {
        val ext = extension.lowercase().trimStart('.')
        val (workFile, isTemp) = resolveAudioToWorkFile(audioUri, ext)
        try {
          when (ext) {
            "m4a", "mp4", "aac" -> stripSyncedEmbeddedLyricsM4a(workFile)
            "mp3" -> stripSyncedEmbeddedLyricsMp3(workFile)
            else -> throw Exception("지원하지 않는 확장자: $ext")
          }
          if (isTemp) writeWorkFileBackToUri(workFile, audioUri)
          NrmStageLog.log(
              "ffmpeg",
              "strip_synced_lyrics_ok",
              mapOf("ext" to ext, "elapsedMs" to (SystemClock.elapsedRealtime() - t0)),
          )
          promise.resolve(null)
        } finally {
          if (isTemp) workFile.delete()
        }
      } catch (t: Throwable) {
        NrmStageLog.log(
            "ffmpeg",
            "strip_synced_lyrics_fail",
            mapOf("ext" to extension, "err" to (t.message ?: t.toString()).take(200)),
        )
        promise.reject("E_STRIP_LYRICS", "싱크 가사 제거 실패: ${t.message}", t as? Exception)
      }
    }.start()
  }

  /** content:// (SAF) 또는 file:// URI → 작업용 임시 파일 반환. isTemp=true면 작업 후 원본에 다시 써야 함 */
  private fun resolveAudioToWorkFile(audioUri: String, ext: String): Pair<File, Boolean> {
    val cleanPath = audioUri.removePrefix("file://")
    if (cleanPath.startsWith("/")) {
      return Pair(File(cleanPath), false)
    }
    // content:// SAF URI → 임시 파일로 복사
    val tempFile = uniqueCacheFile(reactApplicationContext.cacheDir, "nrm-embed-src", ".$ext")
    val uri = Uri.parse(audioUri)
    reactApplicationContext.contentResolver.openInputStream(uri)?.use { input ->
      tempFile.outputStream().use { output -> input.copyTo(output) }
    } ?: throw Exception("SAF 파일을 읽을 수 없습니다: $audioUri")
    return Pair(tempFile, true)
  }

  /** 작업 완료된 파일을 SAF URI에 다시 씀 */
  private fun writeWorkFileBackToUri(file: File, targetUri: String) {
    val uri = Uri.parse(targetUri)
    reactApplicationContext.contentResolver.openOutputStream(uri, "wt")?.use { output ->
      file.inputStream().use { input -> input.copyTo(output) }
    } ?: throw Exception("SAF 파일에 쓸 수 없습니다: $targetUri")
  }

  /**
   * m4a: FFmpeg -metadata lyrics=<lrc> → ©lyr atom.
   *
   * `-map 0 -c copy` 로 오디오·attached_pic(커버) 스트림을 모두 재인코딩 없이 복사.
   * `-c:a copy` 만 지정하면 attached_pic 비디오 스트림에 기본 인코더가 적용되어
   * 느려지거나 멈출 수 있다.
   */
  private companion object {
    const val NRM_LYRICS_MODE_META_KEY = "nrm_lyrics_mode"
    const val NRM_LYRICS_MODE_TXXX_DESC = "NRM_LYRICS_MODE"
  }

  private fun embedLyricsM4a(file: File, lrc: String, lyricsMode: String) {
    val playerLrc = stripNrmModeHeaderForPlayer(lrc.trim())
    if (playerLrc.isEmpty() && lyricsMode.isEmpty()) return
    val paths = FfmpegBootstrap.ensure(reactApplicationContext)
      ?: throw Exception("FFmpeg를 사용할 수 없습니다.")
    val preserve = readM4aCustomFieldsFromFfmetadata(file, paths)
    val effectiveMode = lyricsMode.ifEmpty { preserve.lyricsMode.orEmpty() }
    val preserveComment = preserve.comment.orEmpty()
    val tempOut = uniqueCacheFile(file.parentFile ?: reactApplicationContext.cacheDir, "nrm-lyr-m4a", ".m4a")
    try {
      val ffmpegArgs = mutableListOf(
          "-y", "-i", file.absolutePath,
          "-map", "0",
          "-c", "copy",
          "-map_metadata", "0",
      )
      if (playerLrc.isNotEmpty()) {
        ffmpegArgs.add("-metadata")
        ffmpegArgs.add("lyrics=$playerLrc")
      }
      if (effectiveMode.isNotEmpty()) {
        ffmpegArgs.add("-metadata")
        ffmpegArgs.add("$NRM_LYRICS_MODE_META_KEY=$effectiveMode")
      }
      if (preserveComment.isNotEmpty()) {
        ffmpegArgs.add("-metadata")
        ffmpegArgs.add("comment=$preserveComment")
      }
      ffmpegArgs.add("-movflags")
      ffmpegArgs.add("+faststart")
      ffmpegArgs.add(tempOut.absolutePath)
      FfmpegExec.runWithPaths(
        paths.binary, paths.libDir,
        ffmpegArgs,
        tag = "ffmpeg-embed-lyrics-m4a",
      )
      if (!tempOut.isFile || tempOut.length() < 512L) throw Exception("FFmpeg 출력 파일이 없거나 너무 작음")
      file.delete()
      if (!tempOut.renameTo(file)) {
        tempOut.inputStream().use { i -> file.outputStream().use { o -> i.copyTo(o) } }
        tempOut.delete()
      }
    } catch (e: Exception) {
      tempOut.delete()
      throw e
    }
  }

  /** mp3: LRC → USLT(LRC 텍스트) + SYLT(바이너리 싱크) — Musicolet 등은 USLT의 LRC 구문을 읽음 */
  private fun stripNrmModeHeaderForPlayer(lrc: String): String {
    val legacy = Regex("""^\[nrm:(configured|translation|melon|melon_translation)\]$""", RegexOption.IGNORE_CASE)
    val modern = Regex("""^\[re:NRM/(configured|translation|melon|melon_translation)\]$""", RegexOption.IGNORE_CASE)
    return lrc.lines()
      .filter { line ->
        val t = line.trim()
        t.isNotEmpty() && !legacy.matches(t) && !modern.matches(t)
      }
      .joinToString("\n")
      .trim()
  }

  /** m4a: ©lyr·nrm_lyrics_mode만 비우고 comment(URL) 등 나머지 메타는 유지 */
  private fun stripSyncedEmbeddedLyricsM4a(file: File) {
    val paths = FfmpegBootstrap.ensure(reactApplicationContext)
      ?: throw Exception("FFmpeg를 사용할 수 없습니다.")
    val tempOut = uniqueCacheFile(file.parentFile ?: reactApplicationContext.cacheDir, "nrm-strip-lyr-m4a", ".m4a")
    try {
      FfmpegExec.runWithPaths(
        paths.binary, paths.libDir,
        listOf(
          "-y", "-i", file.absolutePath,
          "-map", "0",
          "-c", "copy",
          "-map_metadata", "0",
          "-metadata", "lyrics=",
          "-metadata", "$NRM_LYRICS_MODE_META_KEY=",
          "-movflags", "+faststart",
          tempOut.absolutePath,
        ),
        tag = "ffmpeg-strip-lyrics-m4a",
      )
      if (!tempOut.isFile || tempOut.length() < 512L) throw Exception("FFmpeg 출력 파일이 없거나 너무 작음")
      file.delete()
      if (!tempOut.renameTo(file)) {
        tempOut.inputStream().use { i -> file.outputStream().use { o -> i.copyTo(o) } }
        tempOut.delete()
      }
    } catch (e: Exception) {
      tempOut.delete()
      throw e
    }
  }

  /** mp3: USLT·SYLT·TXXX(NRM_LYRICS_MODE) 제거 */
  private fun stripSyncedEmbeddedLyricsMp3(file: File) {
    val bytes = file.readBytes()
    if (bytes.size < 10 ||
      bytes[0] != 'I'.code.toByte() ||
      bytes[1] != 'D'.code.toByte() ||
      bytes[2] != '3'.code.toByte()
    ) {
      return
    }
    val id3Major = bytes[3].toInt() and 0xFF
    if (id3Major < 3) return
    val range = id3TagBodyRange(bytes) ?: return
    val (bodyStart, tagEnd) = range
    if (tagEnd > bytes.size) return
    val tagBody = bytes.sliceArray(bodyStart until tagEnd)
    val filtered =
      removeId3FramesFromBody(
        tagBody,
        frameIdsToRemove = setOf("USLT", "SYLT"),
        txxxDescriptionsToRemove = setOf(NRM_LYRICS_MODE_TXXX_DESC),
        usesSyncsafeFrameSize = id3Major >= 4,
      )
    if (filtered.contentEquals(tagBody)) return
    val newHeader = buildId3v2Header(id3Major, bytes[4], bytes[5], filtered.size)
    val audioData = bytes.sliceArray(tagEnd until bytes.size)
    file.writeBytes(newHeader + filtered + audioData)
  }

  private fun embedLyricsMp3(file: File, lrc: String, lyricsMode: String) {
    val trimmed = stripNrmModeHeaderForPlayer(lrc.trim())
    if (trimmed.isEmpty() && lyricsMode.isEmpty()) return
    val id3Major = peekId3MajorVersion(file) ?: 3
    val frames = mutableListOf<ByteArray>()
    if (trimmed.isNotEmpty()) {
      buildUsltFrame(trimmed, id3Major)?.let { frames += it }
      buildSyltFrame(trimmed, id3Major)?.let { frames += it }
    }
    if (lyricsMode.isNotEmpty()) {
      buildTxxxFrame(NRM_LYRICS_MODE_TXXX_DESC, lyricsMode, id3Major)?.let { frames += it }
    }
    if (frames.isEmpty()) return
    insertOrReplaceEmbeddedLyricsInMp3(file, frames, id3Major)
  }

  private fun peekId3MajorVersion(file: File): Int? {
    val header = ByteArray(4)
    file.inputStream().use { input ->
      if (input.read(header) < 4) return null
    }
    if (header[0] != 'I'.code.toByte() ||
      header[1] != 'D'.code.toByte() ||
      header[2] != '3'.code.toByte()
    ) {
      return null
    }
    return header[3].toInt() and 0xFF
  }

  /** LRC 텍스트 → USLT ID3 프레임 (플레이어 호환: LRC 타임스탬프 문자열 그대로) */
  private fun buildTxxxFrame(description: String, value: String, id3Major: Int): ByteArray? {
    val desc = description.trim()
    val valTrim = value.trim()
    if (desc.isEmpty() || valTrim.isEmpty()) return null
    val body = ByteArrayOutputStream().also { os ->
      os.write(3) // UTF-8
      os.write(desc.toByteArray(Charsets.UTF_8))
      os.write(0)
      os.write(valTrim.toByteArray(Charsets.UTF_8))
    }.toByteArray()
    return wrapId3v2Frame("TXXX", body, id3Major)
  }

  /** LRC 텍스트 → USLT ID3 프레임 (플레이어 호환: LRC 타임스탬프 문자열 그대로) */
  private fun buildUsltFrame(lrc: String, id3Major: Int): ByteArray? {
    val trimmed = lrc.trim()
    if (trimmed.isEmpty()) return null
    val body = ByteArrayOutputStream().also { os ->
      os.write(3) // UTF-8
      os.write("eng".toByteArray())
      os.write(0) // 빈 content descriptor
      os.write(trimmed.toByteArray(Charsets.UTF_8))
    }.toByteArray()
    return wrapId3v2Frame("USLT", body, id3Major)
  }

  /** LRC 텍스트 → SYLT ID3 프레임 바이너리 (SYLT 지원 플레이어용) */
  private fun buildSyltFrame(lrc: String, id3Major: Int): ByteArray? {
    val entries = parseLrcTimedEntries(lrc)
    if (entries.isEmpty()) return null

    val body = ByteArrayOutputStream().also { os ->
      os.write(3) // UTF-8
      os.write("eng".toByteArray())
      os.write(2) // 타임스탬프: ms (ID3 $02)
      os.write(1) // 내용 유형: lyrics
      os.write(0) // content descriptor null
      for ((ms, text) in entries) {
        os.write(text.toByteArray(Charsets.UTF_8))
        os.write(0)
        os.write((ms ushr 24) and 0xFF)
        os.write((ms ushr 16) and 0xFF)
        os.write((ms ushr 8) and 0xFF)
        os.write(ms and 0xFF)
      }
    }.toByteArray()
    return wrapId3v2Frame("SYLT", body, id3Major)
  }

  private fun parseLrcTimedEntries(lrc: String): List<Pair<Int, String>> {
    val pattern = Regex("""^\[(\d+):(\d+(?:[.,]\d+)?)\](.*)$""")
    val entries = mutableListOf<Pair<Int, String>>()
    for (line in lrc.lines()) {
      val m = pattern.matchEntire(line.trim()) ?: continue
      val minutes = m.groupValues[1].toInt()
      val seconds = m.groupValues[2].replace(',', '.').toDoubleOrNull() ?: continue
      val text = m.groupValues[3].trim()
      val ms = (minutes * 60_000 + seconds * 1000.0).toInt()
      entries += Pair(ms, text)
    }
    return entries
  }

  private fun wrapId3v2Frame(frameId: String, body: ByteArray, id3Major: Int): ByteArray {
    return ByteArrayOutputStream().also { os ->
      os.write(frameId.toByteArray())
      if (id3Major >= 4) {
        os.write(encodeId3SyncsafeInt(body.size))
      } else {
        os.write((body.size ushr 24) and 0xFF)
        os.write((body.size ushr 16) and 0xFF)
        os.write((body.size ushr 8) and 0xFF)
        os.write(body.size and 0xFF)
      }
      os.write(byteArrayOf(0, 0))
      os.write(body)
    }.toByteArray()
  }

  /** MP3 USLT·SYLT 프레임 → LRC 텍스트 (USLT 우선 — Musicolet 등) */
  private fun readEmbeddedLyricsFromMp3(file: File): String? {
    readUsltLyricsFromMp3(file)?.let { return it }
    return readSyltLyricsFromMp3(file)
  }

  private data class M4aFfmetadataFields(
      val lyricsMode: String? = null,
      val comment: String? = null,
  )

  /** m4a ffmetadata 덤프 — nrm_lyrics_mode·comment(URL) (probe 누락 보완) */
  private fun readM4aCustomFieldsFromFfmetadata(
      file: File,
      paths: FfmpegBootstrap.FfmpegPaths,
  ): M4aFfmetadataFields {
    return try {
      val (_, dump) =
          FfmpegExec.runCapture(
              paths.binary,
              paths.libDir,
              listOf(
                  "-hide_banner",
                  "-i",
                  file.absolutePath,
                  "-f",
                  "ffmetadata",
                  "-",
              ),
              tag = "ffmpeg-read-m4a-meta",
              timeoutSec = 60,
          )
      parseM4aCustomFieldsFromFfmetadata(dump)
    } catch (_: Exception) {
      M4aFfmetadataFields()
    }
  }

  private fun parseM4aCustomFieldsFromFfmetadata(dump: String): M4aFfmetadataFields {
    var lyricsMode: String? = null
    var comment: String? = null
    for (line in dump.lineSequence()) {
      val trimmed = line.trim()
      if (trimmed.startsWith(";")) continue
      if (trimmed.startsWith("${NRM_LYRICS_MODE_META_KEY}=")) {
        val value = unescapeFfmetadataValue(trimmed.removePrefix("${NRM_LYRICS_MODE_META_KEY}=").trim())
        if (value.isNotEmpty()) lyricsMode = value
        continue
      }
      if (trimmed.startsWith("comment=")) {
        val value = unescapeFfmetadataValue(trimmed.removePrefix("comment=").trim())
        if (value.isNotEmpty()) comment = value
      }
    }
    return M4aFfmetadataFields(lyricsMode = lyricsMode, comment = comment)
  }

  /** ffmetadata 덤프의 이스케이프 복원 (= → \= 등) */
  private fun unescapeFfmetadataValue(raw: String): String {
    if (!raw.contains('\\')) return raw
    val sb = StringBuilder(raw.length)
    var i = 0
    while (i < raw.length) {
      if (raw[i] == '\\' && i + 1 < raw.length) {
        sb.append(raw[i + 1])
        i += 2
      } else {
        sb.append(raw[i])
        i++
      }
    }
    return sb.toString()
  }

  /** MP3 TXXX(NRM_LYRICS_MODE) → 가사 UI 모드 토큰 */
  private fun readNrmLyricsModeFromMp3(file: File): String? {
    return readTxxxValueFromMp3(file, NRM_LYRICS_MODE_TXXX_DESC)
  }

  private fun readTxxxValueFromMp3(file: File, description: String): String? {
    return try {
      val bytes = file.readBytes()
      val range = id3TagBodyRange(bytes) ?: return null
      val (bodyStart, tagEnd) = range
      val id3Major = bytes[3].toInt() and 0xFF
      var pos = bodyStart
      while (pos + 10 <= tagEnd) {
        if (bytes[pos] == 0.toByte()) break
        val frameId = String(bytes.sliceArray(pos until pos + 4))
        val frameSize = readId3FrameSize(bytes, pos + 4, id3Major)
        if (frameSize <= 0 || pos + 10 + frameSize > tagEnd) break
        if (frameId == "TXXX") {
          val (desc, value) =
            decodeTxxxFrameBody(bytes.sliceArray(pos + 10 until pos + 10 + frameSize))
              ?: Pair("", "")
          if (desc.equals(description, ignoreCase = true) && value.isNotBlank()) {
            return value.trim()
          }
        }
        pos += 10 + frameSize
      }
      null
    } catch (_: Exception) {
      null
    }
  }

  private fun decodeTxxxFrameBody(data: ByteArray): Pair<String, String>? {
    if (data.isEmpty()) return null
    val encoding = data[0].toInt() and 0xFF
    var pos = 1
    val descEnd = findId3TextTerminator(data, pos, encoding) ?: return null
    val desc =
      decodeId3EncodedText(data.sliceArray(pos until descEnd), encoding)
    pos = descEnd + if (encoding == 1 || encoding == 2) 2 else 1
    if (pos >= data.size) return Pair(desc, "")
    val value = decodeId3EncodedText(data.sliceArray(pos until data.size), encoding)
    return Pair(desc, value)
  }

  private fun findId3TextTerminator(data: ByteArray, start: Int, encoding: Int): Int? {
    if (encoding == 1 || encoding == 2) {
      var i = start
      while (i + 1 < data.size) {
        if (data[i] == 0.toByte() && data[i + 1] == 0.toByte()) return i
        i += 2
      }
      return null
    }
    var i = start
    while (i < data.size) {
      if (data[i] == 0.toByte()) return i
      i++
    }
    return null
  }

  private fun decodeId3EncodedText(data: ByteArray, encoding: Int): String {
    if (data.isEmpty()) return ""
    return when (encoding) {
      1, 2 -> String(data, Charsets.UTF_16LE)
      else -> String(data, Charsets.UTF_8)
    }
  }

  private fun readUsltLyricsFromMp3(file: File): String? {
    return try {
      val bytes = file.readBytes()
      val range = id3TagBodyRange(bytes) ?: return null
      val (bodyStart, tagEnd) = range
      val id3Major = bytes[3].toInt() and 0xFF
      var pos = bodyStart
      while (pos + 10 <= tagEnd) {
        if (bytes[pos] == 0.toByte()) break
        val frameId = String(bytes.sliceArray(pos until pos + 4))
        val frameSize = readId3FrameSize(bytes, pos + 4, id3Major)
        if (frameSize <= 0 || pos + 10 + frameSize > tagEnd) break
        if (frameId == "USLT") {
          val text = decodeUsltFrameBody(bytes.sliceArray(pos + 10 until pos + 10 + frameSize))
          if (!text.isNullOrBlank()) return text.trim()
        }
        pos += 10 + frameSize
      }
      null
    } catch (_: Exception) {
      null
    }
  }

  private fun decodeUsltFrameBody(data: ByteArray): String? {
    if (data.isEmpty()) return null
    val encoding = data[0].toInt() and 0xFF
    var pos = 4 // encoding + language(3)
    if (encoding == 1 || encoding == 2) {
      while (pos + 1 < data.size) {
        if (data[pos] == 0.toByte() && data[pos + 1] == 0.toByte()) {
          pos += 2
          break
        }
        pos += 2
      }
      if (pos >= data.size) return null
      return String(data.sliceArray(pos until data.size), Charsets.UTF_16LE)
    }
    while (pos < data.size) {
      if (data[pos] == 0.toByte()) {
        pos += 1
        break
      }
      pos++
    }
    if (pos >= data.size) return null
    return String(data.sliceArray(pos until data.size), Charsets.UTF_8)
  }

  /** MP3 SYLT 프레임 → LRC 텍스트 (없으면 null) */
  private fun readSyltLyricsFromMp3(file: File): String? {
    return try {
      val bytes = file.readBytes()
      val range = id3TagBodyRange(bytes) ?: return null
      val (bodyStart, tagEnd) = range
      val id3Major = bytes[3].toInt() and 0xFF
      var pos = bodyStart
      while (pos + 10 <= tagEnd) {
        if (bytes[pos] == 0.toByte()) break
        val frameId = String(bytes.sliceArray(pos until pos + 4))
        val frameSize = readId3FrameSize(bytes, pos + 4, id3Major)
        if (frameSize <= 0 || pos + 10 + frameSize > tagEnd) break
        if (frameId == "SYLT") {
          val frameData = bytes.sliceArray(pos + 10 until pos + 10 + frameSize)
          return decodeSyltFrameToLrc(frameData)
        }
        pos += 10 + frameSize
      }
      null
    } catch (_: Exception) { null }
  }

  /** SYLT 프레임 바이너리 → LRC 텍스트 */
  private fun decodeSyltFrameToLrc(data: ByteArray): String? {
    // 헤더: 1(encoding) + 3(lang) + 1(timestampFmt) + 1(contentType) + 설명자(null 종료)
    if (data.size < 6) return null
    val encoding = data[0].toInt() and 0xFF
    // 설명자(null 종료) 끝 위치 찾기
    var pos = 5
    if (encoding == 1 || encoding == 2) {
      while (pos + 1 < data.size) {
        if (data[pos] == 0.toByte() && data[pos + 1] == 0.toByte()) { pos += 2; break }
        pos += 2
      }
    } else {
      while (pos < data.size) {
        if (data[pos] == 0.toByte()) { pos += 1; break }
        pos++
      }
    }
    val entries = mutableListOf<Pair<Int, String>>()
    while (pos < data.size) {
      val textStart = pos
      val text: String
      if (encoding == 1 || encoding == 2) {
        var end = textStart
        while (end + 1 < data.size && !(data[end] == 0.toByte() && data[end + 1] == 0.toByte())) end += 2
        text = String(data.sliceArray(textStart until end), Charsets.UTF_16LE)
        pos = end + 2
      } else {
        var end = textStart
        while (end < data.size && data[end] != 0.toByte()) end++
        text = String(data.sliceArray(textStart until end), Charsets.UTF_8)
        pos = end + 1
      }
      if (pos + 4 > data.size) break
      val ms = ((data[pos].toInt() and 0xFF) shl 24) or
        ((data[pos + 1].toInt() and 0xFF) shl 16) or
        ((data[pos + 2].toInt() and 0xFF) shl 8) or
        (data[pos + 3].toInt() and 0xFF)
      pos += 4
      if (entries.size < 50) entries.add(Pair(ms, text)) // 모드 감지용으로 50줄 충분
    }
    if (entries.isEmpty()) return null
    return entries.joinToString("\n") { (ms, text) ->
      val min = ms / 60000
      val sec = (ms % 60000) / 1000
      val centisec = (ms % 1000) / 10
      "[%02d:%02d.%02d] %s".format(min, sec, centisec, text)
    }
  }

  /** MP3 파일에서 기존 USLT·SYLT 프레임을 제거하고 새 프레임을 삽입 */
  private fun insertOrReplaceEmbeddedLyricsInMp3(
    file: File,
    lyricFrames: List<ByteArray>,
    preferredMajor: Int = 3,
  ) {
    val bytes = file.readBytes()
    val newFrameBytes = lyricFrames.fold(ByteArray(0)) { acc, frame -> acc + frame }

    if (bytes.size < 10 ||
      bytes[0] != 'I'.code.toByte() ||
      bytes[1] != 'D'.code.toByte() ||
      bytes[2] != '3'.code.toByte()
    ) {
      file.writeBytes(buildMinimalId3v2Tag(newFrameBytes, preferredMajor) + bytes)
      return
    }

    val id3Major = bytes[3].toInt() and 0xFF
    if (id3Major < 3) {
      file.writeBytes(buildMinimalId3v2Tag(newFrameBytes, preferredMajor) + bytes)
      return
    }

    val range = id3TagBodyRange(bytes)
    if (range == null) {
      file.writeBytes(buildMinimalId3v2Tag(newFrameBytes, preferredMajor) + bytes)
      return
    }
    val (bodyStart, tagEnd) = range
    if (tagEnd > bytes.size) {
      file.writeBytes(buildMinimalId3v2Tag(newFrameBytes, preferredMajor) + bytes)
      return
    }

    val tagBody = bytes.sliceArray(bodyStart until tagEnd)
    val filtered =
      removeId3FramesFromBody(
        tagBody,
        frameIdsToRemove = setOf("USLT", "SYLT"),
        txxxDescriptionsToRemove = setOf(NRM_LYRICS_MODE_TXXX_DESC),
        usesSyncsafeFrameSize = id3Major >= 4,
      )
    val newTagBody = filtered + newFrameBytes

    val newHeader = buildId3v2Header(id3Major, bytes[4], bytes[5], newTagBody.size)
    val audioData = bytes.sliceArray(tagEnd until bytes.size)
    file.writeBytes(newHeader + newTagBody + audioData)
  }

  /** @return tag body 시작·끝 오프셋 (extended header 건너뜀) */
  private fun id3TagBodyRange(bytes: ByteArray): Pair<Int, Int>? {
    if (bytes.size < 10 ||
      bytes[0] != 'I'.code.toByte() ||
      bytes[1] != 'D'.code.toByte() ||
      bytes[2] != '3'.code.toByte()
    ) {
      return null
    }
    val id3Major = bytes[3].toInt() and 0xFF
    if (id3Major < 3) return null
    val flags = bytes[5].toInt() and 0xFF
    var bodyStart = 10
    if ((flags and 0x40) != 0 && bytes.size >= 14) {
      val extSize =
        if (id3Major >= 4) {
          readId3SyncsafeInt(bytes, 10)
        } else {
          ((bytes[10].toInt() and 0xFF) shl 24) or
            ((bytes[11].toInt() and 0xFF) shl 16) or
            ((bytes[12].toInt() and 0xFF) shl 8) or
            (bytes[13].toInt() and 0xFF)
        }
      bodyStart = 10 + extSize
    }
    val tagBodySize = readId3SyncsafeInt(bytes, 6)
    val tagEnd = 10 + tagBodySize
    if (bodyStart >= tagEnd || tagEnd > bytes.size) return null
    return Pair(bodyStart, tagEnd)
  }

  private fun readId3FrameSize(bytes: ByteArray, offset: Int, id3Major: Int): Int {
    if (id3Major >= 4) return readId3SyncsafeInt(bytes, offset)
    return ((bytes[offset].toInt() and 0xFF) shl 24) or
      ((bytes[offset + 1].toInt() and 0xFF) shl 16) or
      ((bytes[offset + 2].toInt() and 0xFF) shl 8) or
      (bytes[offset + 3].toInt() and 0xFF)
  }

  private fun readId3SyncsafeInt(bytes: ByteArray, offset: Int): Int =
    ((bytes[offset].toInt() and 0x7F) shl 21) or
      ((bytes[offset + 1].toInt() and 0x7F) shl 14) or
      ((bytes[offset + 2].toInt() and 0x7F) shl 7) or
      (bytes[offset + 3].toInt() and 0x7F)

  private fun encodeId3SyncsafeInt(value: Int): ByteArray = byteArrayOf(
    ((value ushr 21) and 0x7F).toByte(),
    ((value ushr 14) and 0x7F).toByte(),
    ((value ushr 7) and 0x7F).toByte(),
    (value and 0x7F).toByte(),
  )

  private fun buildId3v2Header(major: Int, minor: Byte, flags: Byte, bodySize: Int): ByteArray {
    val os = ByteArrayOutputStream()
    os.write("ID3".toByteArray())
    os.write(major); os.write(minor.toInt()); os.write(flags.toInt())
    os.write(encodeId3SyncsafeInt(bodySize))
    return os.toByteArray()
  }

  private fun buildMinimalId3v2Tag(body: ByteArray, major: Int = 3): ByteArray =
    buildId3v2Header(major, 0, 0, body.size) + body

  /**
   * ID3 태그 바디에서 지정 프레임 ID를 제거.
   * ID3v2.4(usesSyncsafeFrameSize=true)와 v2.3(false)의 프레임 크기 인코딩 차이 처리.
   */
  private fun removeId3FramesFromBody(
    tagBody: ByteArray,
    frameIdsToRemove: Set<String>,
    txxxDescriptionsToRemove: Set<String> = emptySet(),
    usesSyncsafeFrameSize: Boolean,
  ): ByteArray {
    val result = ByteArrayOutputStream()
    var pos = 0
    while (pos + 10 <= tagBody.size) {
      if (tagBody[pos] == 0.toByte()) break   // 패딩 시작
      val frameId = String(tagBody.sliceArray(pos until pos + 4))
      val frameSize = if (usesSyncsafeFrameSize) {
        readId3SyncsafeInt(tagBody, pos + 4)
      } else {
        ((tagBody[pos + 4].toInt() and 0xFF) shl 24) or
          ((tagBody[pos + 5].toInt() and 0xFF) shl 16) or
          ((tagBody[pos + 6].toInt() and 0xFF) shl 8) or
          (tagBody[pos + 7].toInt() and 0xFF)
      }
      if (frameSize < 0 || pos + 10 + frameSize > tagBody.size) break
      val shouldRemove =
        when {
          frameIdsToRemove.contains(frameId) -> true
          frameId == "TXXX" && txxxDescriptionsToRemove.isNotEmpty() -> {
            val body = tagBody.sliceArray(pos + 10 until pos + 10 + frameSize)
            val desc = decodeTxxxFrameBody(body)?.first.orEmpty()
            txxxDescriptionsToRemove.any { it.equals(desc, ignoreCase = true) }
          }
          else -> false
        }
      if (!shouldRemove) {
        result.write(tagBody, pos, 10 + frameSize)
      }
      pos += 10 + frameSize
    }
    return result.toByteArray()
  }

  private fun downloadCover(url: String, dir: File?): File? {
    return try {
      if (url.isBlank()) return null
      val parent = dir ?: reactApplicationContext.cacheDir

      fun isMinSize(out: File): Boolean = out.length() >= 256L

      fun writeBytesToOut(bytes: ByteArray, ext: String): File {
        val out = uniqueCacheFile(parent, "nrm-cover", ext)
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
        val out = uniqueCacheFile(parent, "nrm-cover", ext)
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
        val out = uniqueCacheFile(parent, "nrm-cover", ext)
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
      val out = uniqueCacheFile(parent, "nrm-cover", ext)
      val conn = URL(httpsUrl).openConnection() as HttpURLConnection
      conn.connectTimeout = 20_000
      conn.readTimeout = 30_000
      conn.instanceFollowRedirects = true
      conn.setRequestProperty("User-Agent", NrmBrand.userAgent(BuildConfig.VERSION_NAME))
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
