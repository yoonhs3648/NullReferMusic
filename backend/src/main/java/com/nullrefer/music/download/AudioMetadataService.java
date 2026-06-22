package com.nullrefer.music.download;

import com.nullrefer.music.config.NrmPaths;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Base64;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class AudioMetadataService {

  private static final Logger log = LoggerFactory.getLogger(AudioMetadataService.class);
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final String AUTO_WHISPER_LYRICS_PREFIX = "__AUTO_FROM_WHISPER__:";
  private static final String LEGACY_AUTO_SUBTITLE_PREFIX = "__AUTO_FROM_SUBTITLE__:";
  private static final ExecutorService POST_PROCESS_EXECUTOR =
      Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "nrm-post-process");
        t.setDaemon(true);
        return t;
      });
  private final NrmPaths paths;
  private final WhisperLyricsService whisperLyricsService;
  private final AlignLyricsService alignLyricsService;

  public AudioMetadataService(
      NrmPaths paths,
      WhisperLyricsService whisperLyricsService,
      AlignLyricsService alignLyricsService) {
    this.paths = paths;
    this.whisperLyricsService = whisperLyricsService;
    this.alignLyricsService = alignLyricsService;
  }

  /** 2단계 + 3단계 병렬 실행. Whisper/Melon 실패해도 ffmpeg 결과는 유지 */
  public ApplyMetadataResult applyToJobFile(String jobId, AudioMetadataRequest req) {
    if (AlignLyricsService.isAutoMelonLyrics(trim(req.lyrics))) {
      return applyMelonPostProcessToJobFileParallel(jobId, req);
    }
    if (!isAutoWhisperLyrics(trim(req.lyrics))) {
      return applyFfmpegMetadataToJobFile(jobId, req);
    }
    return applyPostProcessToJobFileParallel(jobId, req);
  }

  /**
   * ffmpeg 메타·커버(2단계)와 Whisper LRC(3단계)를 병렬 실행.
   * Whisper는 작업 파일 복사본으로 전사해 ffmpeg의 in-place 교체와 충돌하지 않습니다.
   */
  public ApplyMetadataResult applyPostProcessToJobFileParallel(
      String jobId, AudioMetadataRequest req) {
    log.info("[post-process] PARALLEL START jobId={}", jobId);
    CompletableFuture<ApplyMetadataResult> ffmpegFuture =
        CompletableFuture.supplyAsync(
            () -> applyFfmpegMetadataToJobFile(jobId, req), POST_PROCESS_EXECUTOR);
    CompletableFuture<ApplyMetadataResult> whisperFuture =
        CompletableFuture.supplyAsync(
            () -> {
              try {
                return applyWhisperLyricsToJobFile(jobId, req);
              } catch (Exception e) {
                log.warn("[post-process] whisper FAIL jobId={} error={}", jobId, e.getMessage());
                return new ApplyMetadataResult(true, false, false, "", "", false);
              }
            },
            POST_PROCESS_EXECUTOR);
    ApplyMetadataResult ffmpeg = ffmpegFuture.join();
    ApplyMetadataResult whisper = whisperFuture.join();
    log.info(
        "[post-process] PARALLEL DONE jobId={} ffmpegOk={} whisperEmbedded={} lrcSidecar={}",
        jobId,
        true,
        whisper.lyricsEmbedded(),
        whisper.lyricsSidecarWritten());
    return new ApplyMetadataResult(
        whisper.lyricsRequested(),
        whisper.lyricsEmbedded(),
        whisper.lyricsTranslationFailed(),
        whisper.whisperModelFile(),
        whisper.whisperModelMissing(),
        whisper.lyricsSidecarWritten() || ffmpeg.lyricsSidecarWritten(),
        whisper.lrcText());
  }

  /** ffmpeg 메타·커버 + 멜론 forced alignment 병렬 */
  public ApplyMetadataResult applyMelonPostProcessToJobFileParallel(
      String jobId, AudioMetadataRequest req) {
    log.info("[post-process-melon] PARALLEL START jobId={}", jobId);
    CompletableFuture<ApplyMetadataResult> ffmpegFuture =
        CompletableFuture.supplyAsync(
            () -> applyFfmpegMetadataToJobFile(jobId, req), POST_PROCESS_EXECUTOR);
    CompletableFuture<ApplyMetadataResult> alignFuture =
        CompletableFuture.supplyAsync(
            () -> {
              try {
                return applyMelonAlignToJobFile(jobId, req);
              } catch (Exception e) {
                log.warn("[post-process-melon] align FAIL jobId={} error={}", jobId, e.getMessage());
                return new ApplyMetadataResult(true, false, false, "", "", false);
              }
            },
            POST_PROCESS_EXECUTOR);
    ApplyMetadataResult ffmpeg = ffmpegFuture.join();
    ApplyMetadataResult align = alignFuture.join();
    return new ApplyMetadataResult(
        align.lyricsRequested(),
        align.lyricsEmbedded(),
        align.lyricsTranslationFailed(),
        "",
        "",
        align.lyricsSidecarWritten() || ffmpeg.lyricsSidecarWritten(),
        align.lrcText());
  }

  /** 3단계: 멜론 plain → forced alignment LRC */
  public ApplyMetadataResult applyMelonAlignToJobFile(String jobId, AudioMetadataRequest req) {
    if (jobId == null || !jobId.matches("[a-zA-Z0-9_-]+")) {
      throw new IllegalArgumentException("invalid_job_id");
    }
    if (!AlignLyricsService.isAutoMelonLyrics(trim(req.lyrics))) {
      return new ApplyMetadataResult(false, false, false, "", "", false);
    }
    AlignLyricsService.MelonAlignResult aligned = alignLyricsService.alignJobFileMelonLyrics(jobId, req);
    String lrc = trim(aligned.lrc());
    if (lrc.isEmpty()) {
      return new ApplyMetadataResult(true, false, aligned.lyricsTranslationFailed(), "", "", false);
    }
    alignLyricsService.writeJobLrcSidecar(jobId, lrc);
    return new ApplyMetadataResult(
        true,
        false,
        aligned.lyricsTranslationFailed(),
        "",
        "",
        true,
        lrc);
  }

  /** 2단계: ffmpeg 메타·커버만 (Whisper sentinel 무시) */
  public ApplyMetadataResult applyFfmpegMetadataToJobFile(String jobId, AudioMetadataRequest req) {
    if (jobId == null || !jobId.matches("[a-zA-Z0-9_-]+")) {
      throw new IllegalArgumentException("invalid_job_id");
    }
    log.info(
        "[ffmpeg] API REQUEST jobId={} artist={} title={} album={} genre={} cover={}",
        jobId,
        trim(req.artist),
        trim(req.title),
        trim(req.album),
        trim(req.genre),
        coverUrlSummary(req.coverUrl));
    Path file = resolveJobFile(jobId);
    if (file == null) {
      log.warn("[ffmpeg] REJECT job_file_not_found jobId={}", jobId);
      throw new IllegalStateException("job_file_not_found");
    }
    log.info(
        "[ffmpeg] INPUT jobId={} file={} size={}",
        jobId,
        file.getFileName(),
        safeFileSize(file));
    if (!Files.isRegularFile(paths.getFfmpegExe())) {
      log.warn("[ffmpeg] REJECT missing_binary jobId={} path={}", jobId, paths.getFfmpegExe());
      return new ApplyMetadataResult(false, false, false, "", "", false);
    }

    String ext = fileExtension(file);
    boolean hasTextTags = hasAnyTextTag(req);
    Path coverFile = null;
    try {
      String coverUrl = trim(req.coverUrl);
      if (!coverUrl.isEmpty()) {
        coverFile = downloadCover(coverUrl, file.getParent());
      }
      if (!hasTextTags && coverFile == null) {
        log.info("[ffmpeg] SKIP jobId={} (no tags, no cover)", jobId);
        return metadataResult(false, false, emptyLyricsResolve(), false);
      }

      boolean mp4 = isMp4Family(ext);
      Path out =
          file.resolveSibling(
              "nrm-meta-" + System.currentTimeMillis() + "-" + file.getFileName());

      List<FfmpegStrategy> strategies =
          mp4
              ? List.of(
                  new FfmpegStrategy(true, true),
                  new FfmpegStrategy(true, false),
                  new FfmpegStrategy(false, true))
              : List.of(
                  new FfmpegStrategy(true, true),
                  new FfmpegStrategy(true, false),
                  new FfmpegStrategy(false, true));

      Exception err =
          runMetadataStrategies(jobId, file, out, coverFile, ext, req, strategies);
      if (err == null) {
        log.info(
            "[ffmpeg] API OK jobId={} file={} size={}",
            jobId,
            file.getFileName(),
            safeFileSize(file));
        return metadataResult(false, false, emptyLyricsResolve(), false);
      }
      throw err;
    } catch (Exception e) {
      log.warn("[ffmpeg] API FAIL jobId={} error={}", jobId, e.getMessage(), e);
      throw new IllegalStateException("metadata_apply_failed");
    } finally {
      if (coverFile != null) {
        try {
          Files.deleteIfExists(coverFile);
        } catch (Exception ignored) {
          // ignore
        }
      }
    }
  }

  /** 3단계: Whisper 전사 → LRC 사이드카만 (ffmpeg 가사 태그 없음) */
  public ApplyMetadataResult applyWhisperLyricsToJobFile(String jobId, AudioMetadataRequest req) {
    if (jobId == null || !jobId.matches("[a-zA-Z0-9_-]+")) {
      throw new IllegalArgumentException("invalid_job_id");
    }
    log.info(
        "[whisper] API REQUEST jobId={} lyricsMode={} modelPref={} deeplKey={}",
        jobId,
        trim(req.lyrics),
        trim(req.whisperModelPreference),
        trim(req.deeplApiKey).isEmpty() ? "no" : "yes");
    if (!isAutoWhisperLyrics(trim(req.lyrics))) {
      log.info("[whisper] SKIP jobId={} (not auto whisper lyrics)", jobId);
      return new ApplyMetadataResult(false, false, false, "", "", false);
    }
    Path file = resolveJobFile(jobId);
    if (file == null) {
      log.warn("[whisper] REJECT job_file_not_found jobId={}", jobId);
      throw new IllegalStateException("job_file_not_found");
    }
    log.info(
        "[whisper] INPUT jobId={} file={} size={}",
        jobId,
        file.getFileName(),
        safeFileSize(file));
    String ext = fileExtension(file);
    if (!"mp3".equals(ext)) {
      return new ApplyMetadataResult(true, false, false, "", "", false);
    }
    LyricsResolveResult resolved = resolveWhisperLyricsForRequest(jobId, file, req);
    boolean lrcOk = resolved.sidecarWritten() && !trim(resolved.lyrics()).isEmpty();
    if (!lrcOk) {
      log.warn(
          "[whisper] API FAIL jobId={} lrc_missing model={} missing={}",
          jobId,
          resolved.whisperModelFile(),
          resolved.whisperModelMissing());
    } else {
      log.info(
          "[whisper] API OK jobId={} lrcChars={} sidecar=true",
          jobId,
          resolved.lyrics().length());
    }
    return whisperMetadataResult(resolved, lrcOk);
  }

  private static LyricsResolveResult emptyLyricsResolve() {
    return new LyricsResolveResult("", false, false, "", "");
  }

  private static ApplyMetadataResult whisperMetadataResult(
      LyricsResolveResult resolved, boolean embedded) {
    return new ApplyMetadataResult(
        true,
        embedded,
        resolved.translationFailed(),
        resolved.whisperModelFile(),
        resolved.whisperModelMissing(),
        resolved.sidecarWritten(),
        embedded ? resolved.lyrics() : "");
  }

  private Exception runMetadataStrategies(
      String jobId,
      Path file,
      Path out,
      Path coverFile,
      String ext,
      AudioMetadataRequest req,
      List<FfmpegStrategy> strategies) {
    Exception lastError = null;
    for (FfmpegStrategy s : strategies) {
      if (s.withCover && coverFile == null) continue;
      try {
        String ctx =
            "jobId="
                + jobId
                + " strategy=cover:"
                + s.withCover
                + ",copy:"
                + s.audioCopy;
        runFfmpegMetadata(
            ctx, file, out, s.withCover ? coverFile : null, ext, s.audioCopy, req);
        if (!Files.isRegularFile(out) || Files.size(out) <= 0) {
          throw new IllegalStateException("metadata_output_empty");
        }
        Files.deleteIfExists(file);
        Files.move(out, file);
        return null;
      } catch (Exception e) {
        lastError = e;
        try {
          Files.deleteIfExists(out);
        } catch (Exception ignored) {
          // ignore
        }
      }
    }
    return lastError != null ? lastError : new IllegalStateException("metadata_apply_failed");
  }

  private record FfmpegStrategy(boolean withCover, boolean audioCopy) {}

  private void runFfmpegMetadata(
      String context,
      Path inFile,
      Path outFile,
      Path coverFile,
      String ext,
      boolean audioCopy,
      AudioMetadataRequest req)
      throws Exception {

    boolean mp4 = isMp4Family(ext);
    List<String> cmd = new ArrayList<>();
    cmd.add(paths.getFfmpegExe().toString());
    cmd.add("-y");
    cmd.add("-i");
    cmd.add(inFile.toString());
    if (coverFile != null) {
      cmd.add("-i");
      cmd.add(coverFile.toString());
    }

    cmd.add("-map_metadata");
    cmd.add("-1");

    cmd.add("-map");
    cmd.add("0:a:0");
    if (coverFile != null) {
      cmd.add("-map");
      cmd.add("1:v:0");
      cmd.add("-disposition:v:0");
      cmd.add("attached_pic");
      cmd.add("-metadata:s:v");
      cmd.add("title=Album cover");
      cmd.add("-metadata:s:v");
      cmd.add("comment=Cover (front)");
    }

    if (audioCopy) {
      cmd.add("-c:a");
      cmd.add("copy");
    } else if ("mp3".equals(ext)) {
      cmd.add("-c:a");
      cmd.add("libmp3lame");
      cmd.add("-b:a");
      cmd.add("192k");
    } else {
      cmd.add("-c:a");
      cmd.add("copy");
    }

    if (coverFile != null) {
      cmd.add("-c:v");
      cmd.add(coverVideoCodec(coverFile, mp4));
    }

    if (mp4) {
      cmd.add("-movflags");
      cmd.add(Mp4FfmpegMetadata.MOOV_FLAGS);
    } else if ("mp3".equals(ext)) {
      cmd.add("-id3v2_version");
      cmd.add("3");
    }

    appendAllTags(cmd, mp4, req);

    cmd.add(outFile.toString());
    runFfmpeg(cmd, context + " op=metadata");
  }

  private static void appendAllTags(List<String> cmd, boolean mp4, AudioMetadataRequest req) {
    String artist = trim(req.artist);
    String title = trim(req.title);
    String albumArtist = trim(req.albumArtist);
    if (albumArtist.isEmpty() && !artist.isEmpty()) {
      albumArtist = artist;
    }

    appendTagPair(cmd, mp4, "title", title);
    appendArtistTagPair(cmd, mp4, artist);
    appendTagPair(cmd, mp4, "album_artist", albumArtist);
    appendTagPair(cmd, mp4, "album", trim(req.album));
    appendTagPair(cmd, mp4, "genre", trim(req.genre));
    appendTagPair(cmd, mp4, "date", trim(req.releaseDate));
    appendTagPair(cmd, mp4, "track", trim(req.trackNumber));
    appendTagPair(cmd, mp4, "disc", trim(req.discNumber));
    appendTagPair(cmd, mp4, "composer", trim(req.composer));
    appendTagPair(cmd, mp4, "bpm", trim(req.bpm));
    appendTagPair(cmd, mp4, "copyright", trim(req.copyright));
    appendTagPair(cmd, mp4, "website", trim(req.website));
    appendTagPair(cmd, mp4, "producer", trim(req.producer));
    appendTagPair(cmd, mp4, "remixer", trim(req.remixer));
  }

  private static boolean hasAnyTextTag(AudioMetadataRequest req) {
    return !trim(req.artist).isEmpty()
        || !trim(req.title).isEmpty()
        || !trim(req.album).isEmpty()
        || !trim(req.genre).isEmpty()
        || !trim(req.releaseDate).isEmpty()
        || !trim(req.albumArtist).isEmpty()
        || !trim(req.trackNumber).isEmpty()
        || !trim(req.website).isEmpty();
  }

  private static boolean isAutoWhisperLyrics(String lyrics) {
    String v = trim(lyrics);
    return v.startsWith(AUTO_WHISPER_LYRICS_PREFIX) || v.startsWith(LEGACY_AUTO_SUBTITLE_PREFIX);
  }

  private LyricsResolveResult resolveWhisperLyricsForRequest(
      String jobId, Path audioFile, AudioMetadataRequest req) {
    String ext = fileExtension(audioFile);
    if (!"mp3".equals(ext)) {
      return new LyricsResolveResult("", false, false, "", "");
    }
    String raw = trim(req.lyrics);
    if (raw.isEmpty()) {
      return new LyricsResolveResult("", false, false, "", "");
    }
    if (!isAutoWhisperLyrics(raw)) {
      return new LyricsResolveResult("", false, false, "", "");
    }
    String modeValue =
        raw.startsWith(AUTO_WHISPER_LYRICS_PREFIX)
            ? raw.substring(AUTO_WHISPER_LYRICS_PREFIX.length())
            : raw.substring(LEGACY_AUTO_SUBTITLE_PREFIX.length());
    LyricsWhisperMode mode = LyricsWhisperMode.from(modeValue);
    if (mode == null) {
      return new LyricsResolveResult("", false, false, "", "");
    }
    boolean translation = mode == LyricsWhisperMode.TRANSLATION;
    Path whisperInput = audioFile;
    Path whisperCopy = null;
    try {
      try {
        whisperCopy = audioFile.resolveSibling("nrm_" + jobId + ".whisper-src.mp3");
        Files.copy(audioFile, whisperCopy, StandardCopyOption.REPLACE_EXISTING);
        whisperInput = whisperCopy;
      } catch (Exception e) {
        log.warn(
            "[whisper] RESOLVE copy_for_parallel FAIL jobId={} fallback=in_place error={}",
            jobId,
            e.getMessage());
      }
      log.info(
          "[whisper] RESOLVE audio={} mode={} translation={} modelPref={}",
          whisperInput.getFileName(),
          modeValue,
          translation,
          trim(req.whisperModelPreference));
      WhisperLyricsService.TranscribeResult whisper =
          whisperLyricsService.transcribeToLrcDetailed(
              whisperInput, translation, trim(req.whisperModelPreference));
      String fromWhisper = whisper.lrc();
      if (fromWhisper.isEmpty()) {
        log.warn(
            "[whisper] RESOLVE empty_lrc model={} missing={}",
            whisper.modelFile(),
            whisper.missingPreference());
        return new LyricsResolveResult(
            "", false, false, whisper.modelFile(), whisper.missingPreference());
      }
      boolean translationFailed = false;
      String finalLrc = fromWhisper;
      if (translation) {
        log.info("[whisper] DEEPL REQUEST lrcChars={}", fromWhisper.length());
        String translated = translateLrcWithDeepL(fromWhisper, trim(req.deeplApiKey));
        if (translated.isEmpty()) {
          translationFailed = true;
          log.warn("[whisper] DEEPL FAIL (empty result)");
        } else {
          finalLrc = translated;
          log.info("[whisper] DEEPL OK lrcChars={}", finalLrc.length());
        }
      }
      writeLrcSidecar(jobId, audioFile, finalLrc);
      return new LyricsResolveResult(
          finalLrc, translationFailed, true, whisper.modelFile(), whisper.missingPreference());
    } finally {
      if (whisperCopy != null) {
        try {
          Files.deleteIfExists(whisperCopy);
        } catch (Exception ignored) {
          // ignore
        }
      }
    }
  }

  private String translateLrcWithDeepL(String lrc, String apiKey) {
    if (apiKey.isEmpty()) return "";
    try {
      List<String> lines = new ArrayList<>();
      List<String> texts = new ArrayList<>();
      List<String> stamps = new ArrayList<>();
      for (String line : lrc.split("\\R")) {
        String t = line.trim();
        if (t.isEmpty()) continue;
        lines.add(t);
        int rb = t.indexOf(']');
        if (t.startsWith("[") && rb > 0 && rb < t.length() - 1) {
          stamps.add(t.substring(1, rb));
          texts.add(t.substring(rb + 1).trim());
        }
      }
      if (texts.isEmpty()) return lrc;
      String body = "target_lang=KO&preserve_formatting=1&split_sentences=nonewlines";
      for (String text : texts) {
        body += "&text=" + java.net.URLEncoder.encode(text, StandardCharsets.UTF_8);
      }
      HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(12)).build();
      HttpRequest req = HttpRequest.newBuilder()
          .uri(URI.create("https://api-free.deepl.com/v2/translate"))
          .header("Authorization", "DeepL-Auth-Key " + apiKey)
          .header("Content-Type", "application/x-www-form-urlencoded")
          .POST(HttpRequest.BodyPublishers.ofString(body))
          .build();
      HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      if (res.statusCode() == 403 || res.statusCode() == 404) {
        req = HttpRequest.newBuilder()
            .uri(URI.create("https://api.deepl.com/v2/translate"))
            .header("Authorization", "DeepL-Auth-Key " + apiKey)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        res = client.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      }
      if (res.statusCode() < 200 || res.statusCode() >= 300) return "";
      JsonNode root = JSON.readTree(res.body());
      JsonNode arr = root.path("translations");
      if (!arr.isArray()) return "";
      StringBuilder out = new StringBuilder();
      for (int i = 0; i < texts.size(); i++) {
        String src = texts.get(i);
        String ts = stamps.get(i);
        String tr = arr.path(i).path("text").asText("").trim();
        if (!src.isEmpty()) out.append('[').append(ts).append(']').append(src).append('\n');
        if (!tr.isEmpty()) out.append('[').append(ts).append("](").append(tr).append(')').append('\n');
      }
      return out.toString().trim();
    } catch (Exception e) {
      return "";
    }
  }

  private void writeLrcSidecar(String jobId, Path audioFile, String lrcText) {
    try {
      Path parent = audioFile.getParent();
      if (parent == null) {
        throw new IllegalStateException("no_parent_dir");
      }
      Path out = parent.resolve("nrm_" + jobId + ".lrc").normalize();
      Files.writeString(out, lrcText + "\n", StandardCharsets.UTF_8);
      log.info(
          "[whisper] LRC_SIDECAR written path={} chars={}",
          out.getFileName(),
          lrcText.length());
    } catch (Exception e) {
      log.warn("[whisper] LRC_SIDECAR FAIL jobId={} error={}", jobId, e.getMessage());
    }
  }

  /** jobId 기준 LRC 사이드카 (다운로드 API·클라이언트 저장용) */
  public Path resolveJobLrcFile(String jobId) {
    if (jobId == null || !jobId.matches("[a-zA-Z0-9_-]+")) {
      return null;
    }
    Path baseDir = paths.getOutputDir().toAbsolutePath().normalize();
    Path explicit = baseDir.resolve("nrm_" + jobId + ".lrc").normalize();
    if (Files.isRegularFile(explicit) && explicit.startsWith(baseDir)) {
      return explicit;
    }
    Path audio = resolveJobFile(jobId);
    if (audio == null) return null;
    String name = audio.getFileName().toString();
    int dot = name.lastIndexOf('.');
    String stem = dot > 0 ? name.substring(0, dot) : name;
    Path sibling = audio.resolveSibling(stem + ".lrc").normalize();
    if (Files.isRegularFile(sibling) && sibling.startsWith(baseDir)) {
      return sibling;
    }
    return null;
  }

  private static String coverVideoCodec(Path coverFile, boolean mp4Family) {
    String name = coverFile.getFileName().toString().toLowerCase();
    if (mp4Family) {
      return "mjpeg";
    }
    return name.endsWith(".png") ? "png" : "mjpeg";
  }

  private static boolean isMp4Family(String ext) {
    return "m4a".equals(ext) || "mp4".equals(ext) || "aac".equals(ext) || "mov".equals(ext);
  }

  private static String fileExtension(Path file) {
    String name = file.getFileName().toString();
    int dot = name.lastIndexOf('.');
    return dot >= 0 ? name.substring(dot + 1).toLowerCase() : "";
  }

  private static void appendTagPair(
      List<String> cmd, boolean mp4, String key, String value) {
    if (value == null || value.isEmpty()) return;
    String ffmpegKey = mp4 ? Mp4FfmpegMetadata.ffmpegKey(key) : key;
    cmd.add("-metadata");
    cmd.add(ffmpegKey + "=" + value);
  }

  /** Windows 플레이어 호환: m4a는 author(©ART) + artist 둘 다 기록 */
  private static void appendArtistTagPair(List<String> cmd, boolean mp4, String artist) {
    if (artist == null || artist.isEmpty()) return;
    appendTagPair(cmd, mp4, "artist", artist);
    if (mp4) {
      cmd.add("-metadata");
      cmd.add("artist=" + artist);
    }
  }

  private static String trim(String s) {
    return s == null ? "" : s.trim();
  }

  private Path resolveJobFile(String jobId) {
    Path baseDir = paths.getOutputDir().toAbsolutePath().normalize();
    Path picked = null;
    try (var stream = Files.newDirectoryStream(baseDir, "nrm_" + jobId + ".*")) {
      for (Path candidate : stream) {
        Path normalized = candidate.normalize();
        if (!Files.isRegularFile(normalized) || !normalized.startsWith(baseDir)) continue;
        String ext = extensionOf(normalized.getFileName().toString());
        if (isAudioExtension(ext)) return normalized;
        if (picked == null) picked = normalized;
      }
    } catch (Exception ignored) {
      // fall through
    }
    if (picked != null) return picked;
    Path fallback = baseDir.resolve("nrm_" + jobId + ".mp3").normalize();
    return Files.isRegularFile(fallback) ? fallback : null;
  }

  private static String extensionOf(String name) {
    int dot = name.lastIndexOf('.');
    if (dot < 0) return "";
    return name.substring(dot).toLowerCase();
  }

  private static boolean isAudioExtension(String ext) {
    return ".mp3".equals(ext)
        || ".m4a".equals(ext)
        || ".wav".equals(ext)
        || ".opus".equals(ext)
        || ".flac".equals(ext)
        || ".ogg".equals(ext)
        || ".aac".equals(ext)
        || ".mp4".equals(ext);
  }

  private Path downloadCover(String url, Path dir) throws Exception {
    if (url == null) return null;
    String trimmed = url.trim();
    if (trimmed.startsWith("data:")) {
      // data:image/png;base64,AAAA...
      int comma = trimmed.indexOf(',');
      if (comma < 0) return null;
      String meta = trimmed.substring(5, comma);
      String b64 = trimmed.substring(comma + 1);
      byte[] bytes;
      try {
        bytes = Base64.getDecoder().decode(b64);
      } catch (Exception e) {
        return null;
      }
      String ext =
          meta.toLowerCase().contains("png")
              ? ".png"
              : meta.toLowerCase().contains("webp")
                  ? ".webp"
                  : meta.toLowerCase().contains("jpeg") || meta.toLowerCase().contains("jpg")
                      ? ".jpg"
                      : ".jpg";
      Path out = dir.resolve("nrm-cover-" + System.currentTimeMillis() + ext);
      Files.write(out, bytes);
      if (Files.size(out) < 256) {
        Files.deleteIfExists(out);
        return null;
      }
      return out;
    }

    String https =
        url.startsWith("http://") ? "https://" + url.substring("http://".length()) : url;
    String ext =
        https.toLowerCase().contains(".png")
            ? ".png"
            : https.toLowerCase().contains(".webp") ? ".webp" : ".jpg";
    Path out = dir.resolve("nrm-cover-" + System.currentTimeMillis() + ext);
    HttpClient client =
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();
    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(https))
            .header("User-Agent", "NullReferenceMusic/1.0")
            .header("Accept", "image/*")
            .GET()
            .build();
    HttpResponse<InputStream> resp =
        client.send(request, HttpResponse.BodyHandlers.ofInputStream());
    if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
      throw new IllegalStateException("cover_http_" + resp.statusCode());
    }
    try (InputStream in = resp.body()) {
      Files.copy(in, out);
    }
    if (Files.size(out) < 256) {
      Files.deleteIfExists(out);
      return null;
    }
    return out;
  }

  private void runFfmpeg(List<String> cmd, String context) throws Exception {
    NrmProcessLogger.ProcessRunResult run =
        NrmProcessLogger.run(
            log, NrmProcessLogger.Tool.FFMPEG, context, cmd, null, true, 0);
    if (!run.success()) {
      String detail = NrmProcessLogger.tail(run.stdout(), 2000);
      throw new IllegalStateException("ffmpeg_exit_" + run.exitCode() + ": " + detail);
    }
  }

  private static String coverUrlSummary(String coverUrl) {
    String v = trim(coverUrl);
    if (v.isEmpty()) return "no";
    if (v.startsWith("data:")) return "data-url(len=" + v.length() + ")";
    if (v.length() > 80) return v.substring(0, 80) + "…";
    return v;
  }

  private static long safeFileSize(Path file) {
    try {
      return Files.size(file);
    } catch (Exception e) {
      return -1;
    }
  }

  public record ApplyMetadataResult(
      boolean lyricsRequested,
      boolean lyricsEmbedded,
      boolean lyricsTranslationFailed,
      String whisperModelFile,
      String whisperModelMissing,
      boolean lyricsSidecarWritten,
      String lrcText) {

    public ApplyMetadataResult(
        boolean lyricsRequested,
        boolean lyricsEmbedded,
        boolean lyricsTranslationFailed,
        String whisperModelFile,
        String whisperModelMissing,
        boolean lyricsSidecarWritten) {
      this(
          lyricsRequested,
          lyricsEmbedded,
          lyricsTranslationFailed,
          whisperModelFile,
          whisperModelMissing,
          lyricsSidecarWritten,
          "");
    }
  }

  private record LyricsResolveResult(
      String lyrics,
      boolean translationFailed,
      boolean sidecarWritten,
      String whisperModelFile,
      String whisperModelMissing) {}

  private static ApplyMetadataResult metadataResult(
      boolean lyricsRequested,
      boolean lyricsEmbedded,
      LyricsResolveResult lyricsResolved,
      boolean lyricsSidecarWritten) {
    boolean sidecar = lyricsSidecarWritten || lyricsResolved.sidecarWritten();
    String lrc =
        sidecar && lyricsEmbedded && !lyricsResolved.lyrics().isEmpty()
            ? lyricsResolved.lyrics()
            : "";
    return new ApplyMetadataResult(
        lyricsRequested,
        lyricsEmbedded,
        lyricsResolved.translationFailed(),
        lyricsResolved.whisperModelFile(),
        lyricsResolved.whisperModelMissing(),
        sidecar,
        lrc);
  }

  private enum LyricsWhisperMode {
    CONFIGURED,
    TRANSLATION;

    static LyricsWhisperMode from(String raw) {
      if ("configured".equals(raw)) return CONFIGURED;
      if ("translation".equals(raw)) return TRANSLATION;
      if ("ko".equals(raw) || "en".equals(raw) || "ko_translation".equals(raw)) {
        return CONFIGURED;
      }
      return null;
    }
  }
}
