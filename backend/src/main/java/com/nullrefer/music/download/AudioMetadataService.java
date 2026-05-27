package com.nullrefer.music.download;

import com.nullrefer.music.config.NrmPaths;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.Charset;
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

  private final NrmPaths paths;

  public AudioMetadataService(NrmPaths paths) {
    this.paths = paths;
  }

  public void applyToJobFile(String jobId, AudioMetadataRequest req) {
    if (jobId == null || !jobId.matches("[a-zA-Z0-9_-]+")) {
      throw new IllegalArgumentException("invalid_job_id");
    }
    Path file = resolveJobFile(jobId);
    if (file == null) {
      throw new IllegalStateException("job_file_not_found");
    }
    if (!Files.isRegularFile(paths.getFfmpegExe())) {
      log.warn("ffmpeg missing; skip metadata for job {}", jobId);
      return;
    }

    boolean hasTextTags = hasAnyTextTag(req);
    Path coverFile = null;
    try {
      String coverUrl = trim(req.coverUrl);
      if (!coverUrl.isEmpty()) {
        coverFile = downloadCover(coverUrl, file.getParent());
      }
      if (!hasTextTags && coverFile == null) {
        return;
      }

      String ext = fileExtension(file);
      boolean mp4 = isMp4Family(ext);
      Path out =
          file.resolveSibling(
              "nrm-meta-" + System.currentTimeMillis() + "-" + file.getFileName());

      Exception lastError = null;
      List<FfmpegStrategy> strategies =
          mp4
              ? List.of(
                  new FfmpegStrategy(true, false),
                  new FfmpegStrategy(false, true))
              : List.of(
                  new FfmpegStrategy(true, true),
                  new FfmpegStrategy(true, false),
                  new FfmpegStrategy(false, true));

      for (FfmpegStrategy s : strategies) {
        if (s.withCover && coverFile == null) continue;
        try {
          runFfmpegMetadata(file, out, s.withCover ? coverFile : null, ext, s.audioCopy, req);
          if (!Files.isRegularFile(out) || Files.size(out) <= 0) {
            throw new IllegalStateException("metadata_output_empty");
          }
          Files.deleteIfExists(file);
          Files.move(out, file);
          return;
        } catch (Exception e) {
          lastError = e;
          try {
            Files.deleteIfExists(out);
          } catch (Exception ignored) {
            // ignore
          }
        }
      }
      throw lastError != null ? lastError : new IllegalStateException("metadata_apply_failed");
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

  private record FfmpegStrategy(boolean withCover, boolean audioCopy) {}

  private void runFfmpegMetadata(
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
      cmd.add("+use_metadata_tags+faststart");
    } else if ("mp3".equals(ext)) {
      cmd.add("-id3v2_version");
      cmd.add("3");
    }

    appendAllTags(cmd, mp4, req);

    cmd.add(outFile.toString());
    runFfmpeg(cmd);
  }

  private static void appendAllTags(List<String> cmd, boolean mp4, AudioMetadataRequest req) {
    String artist = trim(req.artist);
    String title = trim(req.title);
    String albumArtist = trim(req.albumArtist);
    if (albumArtist.isEmpty() && !artist.isEmpty()) {
      albumArtist = artist;
    }

    appendTagPair(cmd, mp4, "title", title);
    appendTagPair(cmd, mp4, "artist", artist);
    appendTagPair(cmd, mp4, "album_artist", albumArtist);
    appendTagPair(cmd, mp4, "album", trim(req.album));
    appendTagPair(cmd, mp4, "genre", trim(req.genre));
    appendTagPair(cmd, mp4, "date", trim(req.releaseDate));
    appendTagPair(cmd, mp4, "track", trim(req.trackNumber));
    appendTagPair(cmd, mp4, "disc", trim(req.discNumber));
    appendTagPair(cmd, mp4, "composer", trim(req.composer));
    appendTagPair(cmd, mp4, "lyrics", trim(req.lyrics));
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
    cmd.add("-metadata");
    cmd.add(key + "=" + value);
    if (mp4) {
      cmd.add("-metadata:s:a:0");
      cmd.add(key + "=" + value);
    }
  }

  private static String trim(String s) {
    return s == null ? "" : s.trim();
  }

  private Path resolveJobFile(String jobId) {
    Path baseDir = paths.getOutputDir().toAbsolutePath().normalize();
    try (var stream = Files.newDirectoryStream(baseDir, "nrm_" + jobId + ".*")) {
      for (Path candidate : stream) {
        if (Files.isRegularFile(candidate) && candidate.normalize().startsWith(baseDir)) {
          return candidate.normalize();
        }
      }
    } catch (Exception ignored) {
      // fall through
    }
    Path fallback = baseDir.resolve("nrm_" + jobId + ".mp3").normalize();
    return Files.isRegularFile(fallback) ? fallback : null;
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
}
