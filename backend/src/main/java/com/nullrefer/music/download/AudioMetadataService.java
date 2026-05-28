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
import java.util.ArrayList;
import java.util.List;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class AudioMetadataService {

  private static final Logger log = LoggerFactory.getLogger(AudioMetadataService.class);
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final String AUTO_WHISPER_LYRICS_PREFIX = "__AUTO_FROM_WHISPER__:";
  private static final String LEGACY_AUTO_SUBTITLE_PREFIX = "__AUTO_FROM_SUBTITLE__:";
  private static final int MAX_EMBED_LYRICS_CHARS = 100000;

  private final NrmPaths paths;
  private final WhisperLyricsService whisperLyricsService;

  public AudioMetadataService(NrmPaths paths, WhisperLyricsService whisperLyricsService) {
    this.paths = paths;
    this.whisperLyricsService = whisperLyricsService;
  }

  public ApplyMetadataResult applyToJobFile(String jobId, AudioMetadataRequest req) {
    if (jobId == null || !jobId.matches("[a-zA-Z0-9_-]+")) {
      throw new IllegalArgumentException("invalid_job_id");
    }
    Path file = resolveJobFile(jobId);
    if (file == null) {
      throw new IllegalStateException("job_file_not_found");
    }
    if (!Files.isRegularFile(paths.getFfmpegExe())) {
      log.warn("ffmpeg missing; skip metadata for job {}", jobId);
      return new ApplyMetadataResult(false, false, false);
    }

    String ext = fileExtension(file);
    boolean lyricsRequested = "mp3".equals(ext) && !trim(req.lyrics).isEmpty();
    LyricsResolveResult lyricsResolved = resolveLyricsForRequest(file, req, ext);
    String effectiveLyrics = lyricsResolved.lyrics();
    boolean hasTextTags = hasAnyTextTag(req, effectiveLyrics);
    Path coverFile = null;
    try {
      String coverUrl = trim(req.coverUrl);
      if (!coverUrl.isEmpty()) {
        coverFile = downloadCover(coverUrl, file.getParent());
      }
      if (!hasTextTags && coverFile == null) {
        return new ApplyMetadataResult(lyricsRequested, false, lyricsResolved.translationFailed());
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

      Exception firstError = null;
      Exception secondError = null;
      boolean withLyrics = !trim(effectiveLyrics).isEmpty();

      Exception tryWithRequested = runMetadataStrategies(
          file, out, coverFile, ext, req, effectiveLyrics, strategies);
      if (tryWithRequested == null) {
        return new ApplyMetadataResult(lyricsRequested, withLyrics, lyricsResolved.translationFailed());
      }
      firstError = tryWithRequested;

      if (lyricsRequested) {
        log.warn(
            "lyrics embed failed for job {}, retrying without lyrics: {}",
            jobId,
            firstError.getMessage());
        Exception retryWithoutLyrics =
            runMetadataStrategies(file, out, coverFile, ext, req, "", strategies);
        if (retryWithoutLyrics == null) {
          return new ApplyMetadataResult(true, false, lyricsResolved.translationFailed());
        }
        secondError = retryWithoutLyrics;
      }

      throw secondError != null
          ? secondError
          : firstError != null
              ? firstError
              : new IllegalStateException("metadata_apply_failed");
    } catch (Exception e) {
      log.warn("metadata apply failed for job {}: {}", jobId, e.getMessage());
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

  private Exception runMetadataStrategies(
      Path file,
      Path out,
      Path coverFile,
      String ext,
      AudioMetadataRequest req,
      String effectiveLyrics,
      List<FfmpegStrategy> strategies) {
    Exception lastError = null;
    for (FfmpegStrategy s : strategies) {
      if (s.withCover && coverFile == null) continue;
      try {
        runFfmpegMetadata(
            file, out, s.withCover ? coverFile : null, ext, s.audioCopy, req, effectiveLyrics);
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
      Path inFile,
      Path outFile,
      Path coverFile,
      String ext,
      boolean audioCopy,
      AudioMetadataRequest req,
      String effectiveLyrics)
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

    appendAllTags(cmd, mp4, req, effectiveLyrics);

    cmd.add(outFile.toString());
    runFfmpeg(cmd);
  }

  private static void appendAllTags(
      List<String> cmd, boolean mp4, AudioMetadataRequest req, String effectiveLyrics) {
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
    if (!mp4) {
      appendTagPair(cmd, mp4, "lyrics", trim(effectiveLyrics));
    }
    appendTagPair(cmd, mp4, "bpm", trim(req.bpm));
    appendTagPair(cmd, mp4, "copyright", trim(req.copyright));
    appendTagPair(cmd, mp4, "website", trim(req.website));
    appendTagPair(cmd, mp4, "producer", trim(req.producer));
    appendTagPair(cmd, mp4, "remixer", trim(req.remixer));
  }

  private static boolean hasAnyTextTag(AudioMetadataRequest req, String effectiveLyrics) {
    return !trim(req.artist).isEmpty()
        || !trim(req.title).isEmpty()
        || !trim(req.album).isEmpty()
        || !trim(req.genre).isEmpty()
        || !trim(req.releaseDate).isEmpty()
        || !trim(req.albumArtist).isEmpty()
        || !trim(req.trackNumber).isEmpty()
        || !trim(effectiveLyrics).isEmpty()
        || !trim(req.website).isEmpty();
  }

  private static boolean isAutoWhisperLyrics(String lyrics) {
    String v = trim(lyrics);
    return v.startsWith(AUTO_WHISPER_LYRICS_PREFIX) || v.startsWith(LEGACY_AUTO_SUBTITLE_PREFIX);
  }

  private LyricsResolveResult resolveLyricsForRequest(Path audioFile, AudioMetadataRequest req, String ext) {
    if (!"mp3".equals(ext)) {
      return new LyricsResolveResult("", false);
    }
    String raw = trim(req.lyrics);
    if (raw.isEmpty()) {
      return new LyricsResolveResult("", false);
    }
    if (!isAutoWhisperLyrics(raw)) {
      return new LyricsResolveResult(raw, false);
    }
    String modeValue =
        raw.startsWith(AUTO_WHISPER_LYRICS_PREFIX)
            ? raw.substring(AUTO_WHISPER_LYRICS_PREFIX.length())
            : raw.substring(LEGACY_AUTO_SUBTITLE_PREFIX.length());
    LyricsWhisperMode mode = LyricsWhisperMode.from(modeValue);
    if (mode == null) {
      return new LyricsResolveResult("", false);
    }
    boolean translation = mode == LyricsWhisperMode.TRANSLATION;
    String fromWhisper =
        whisperLyricsService.transcribeToLrc(audioFile, translation, trim(req.whisperModelPreference));
    if (fromWhisper.isEmpty()) {
      return new LyricsResolveResult("", false);
    }
    boolean translationFailed = false;
    String finalLrc = fromWhisper;
    if (translation) {
      String translated = translateLrcWithDeepL(fromWhisper, trim(req.deeplApiKey));
      if (translated.isEmpty()) {
        translationFailed = true;
      } else {
        finalLrc = translated;
      }
    }
    writeLrcSidecar(audioFile, finalLrc);
    if (finalLrc.length() > MAX_EMBED_LYRICS_CHARS) {
      String truncated = truncateForEmbed(finalLrc, MAX_EMBED_LYRICS_CHARS);
      log.info(
          "lyrics too long for id3 embed: {} chars, truncating to {} chars",
          finalLrc.length(),
          truncated.length());
      return new LyricsResolveResult(truncated, translationFailed);
    }
    return new LyricsResolveResult(finalLrc, translationFailed);
  }

  private static String truncateForEmbed(String text, int maxChars) {
    if (text == null) return "";
    String t = text.trim();
    if (t.length() <= maxChars) return t;
    int cut = Math.min(maxChars, t.length());
    int newline = t.lastIndexOf('\n', cut);
    if (newline > maxChars * 0.6) {
      cut = newline;
    }
    return t.substring(0, Math.max(1, cut)).trim();
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

  private void writeLrcSidecar(Path audioFile, String lrcText) {
    try {
      String name = audioFile.getFileName().toString();
      int dot = name.lastIndexOf('.');
      String stem = dot > 0 ? name.substring(0, dot) : name;
      Path out = audioFile.resolveSibling(stem + ".lrc");
      Files.writeString(out, lrcText + "\n", StandardCharsets.UTF_8);
    } catch (Exception e) {
      log.warn("lrc sidecar write failed for {}: {}", audioFile, e.getMessage());
    }
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

  private void runFfmpeg(List<String> cmd) throws Exception {
    Charset cs = Charset.defaultCharset();
    ProcessBuilder pb = new ProcessBuilder(cmd);
    pb.redirectErrorStream(true);
    Process p = pb.start();
    StringBuilder out = new StringBuilder();
    try (BufferedReader r =
        new BufferedReader(new InputStreamReader(p.getInputStream(), cs))) {
      String line;
      while ((line = r.readLine()) != null) out.append(line).append('\n');
    }
    int code = p.waitFor();
    if (code != 0) {
      throw new IllegalStateException(
          "ffmpeg_exit_" + code + ": " + tail(out.toString(), 2000));
    }
  }

  private static String tail(String s, int max) {
    if (s == null || s.length() <= max) return s == null ? "" : s;
    return s.substring(s.length() - max);
  }

  public record ApplyMetadataResult(boolean lyricsRequested, boolean lyricsEmbedded, boolean lyricsTranslationFailed) {}

  private record LyricsResolveResult(String lyrics, boolean translationFailed) {}

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
