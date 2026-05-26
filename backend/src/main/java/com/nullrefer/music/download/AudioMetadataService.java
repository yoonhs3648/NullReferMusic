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

    String artist = trim(req.artist);
    String title = trim(req.title);
    String album = trim(req.album);
    String genre = trim(req.genre);
    String releaseDate = trim(req.releaseDate);
    String coverUrl = trim(req.coverUrl);

    boolean hasTags =
        !artist.isEmpty()
            || !title.isEmpty()
            || !album.isEmpty()
            || !genre.isEmpty()
            || !releaseDate.isEmpty();

    Path coverFile = null;
    try {
      if (!coverUrl.isEmpty()) {
        coverFile = downloadCover(coverUrl, file.getParent());
      }
      if (!hasTags && coverFile == null) {
        return;
      }

      Path out = file.resolveSibling("nrm-meta-" + System.currentTimeMillis() + "-" + file.getFileName());
      List<String> cmd = new ArrayList<>();
      cmd.add(paths.getFfmpegExe().toString());
      cmd.add("-y");
      cmd.add("-i");
      cmd.add(file.toString());
      if (coverFile != null) {
        cmd.add("-i");
        cmd.add(coverFile.toString());
      }
      cmd.add("-map");
      cmd.add("0:a");
      if (coverFile != null) {
        cmd.add("-map");
        cmd.add("1:v");
        cmd.add("-c:v");
        cmd.add("copy");
        cmd.add("-disposition:v:0");
        cmd.add("attached_pic");
        cmd.add("-metadata:s:v");
        cmd.add("title=Album cover");
        cmd.add("-metadata:s:v");
        cmd.add("comment=Cover (front)");
      }
      cmd.add("-c:a");
      cmd.add("copy");
      if (!artist.isEmpty()) {
        cmd.add("-metadata");
        cmd.add("artist=" + artist);
      }
      if (!title.isEmpty()) {
        cmd.add("-metadata");
        cmd.add("title=" + title);
      }
      if (!album.isEmpty()) {
        cmd.add("-metadata");
        cmd.add("album=" + album);
      }
      if (!genre.isEmpty()) {
        cmd.add("-metadata");
        cmd.add("genre=" + genre);
      }
      if (!releaseDate.isEmpty()) {
        cmd.add("-metadata");
        cmd.add("date=" + releaseDate);
      }
      cmd.add(out.toString());

      runFfmpeg(cmd);
      if (!Files.isRegularFile(out) || Files.size(out) <= 0) {
        throw new IllegalStateException("metadata_output_empty");
      }
      Files.deleteIfExists(file);
      Files.move(out, file);
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
    if (Files.isRegularFile(fallback)) {
      return fallback;
    }
    return null;
  }

  private Path downloadCover(String url, Path dir) throws Exception {
    String ext =
        url.toLowerCase().contains(".png")
            ? ".png"
            : url.toLowerCase().contains(".webp") ? ".webp" : ".jpg";
    Path out = dir.resolve("nrm-cover-" + System.currentTimeMillis() + ext);
    HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
    HttpResponse<InputStream> response =
        client.send(request, HttpResponse.BodyHandlers.ofInputStream());
    if (response.statusCode() < 200 || response.statusCode() >= 300) {
      throw new IllegalStateException("cover_http_" + response.statusCode());
    }
    try (InputStream in = response.body()) {
      Files.copy(in, out);
    }
    if (Files.size(out) <= 0) {
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
    try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), cs))) {
      String line;
      while ((line = r.readLine()) != null) {
        out.append(line).append('\n');
      }
    }
    int code = p.waitFor();
    if (code != 0) {
      throw new IllegalStateException("ffmpeg_exit_" + code + ": " + tail(out.toString(), 2000));
    }
  }

  private static String tail(String s, int max) {
    if (s == null || s.length() <= max) {
      return s == null ? "" : s;
    }
    return s.substring(s.length() - max);
  }
}
