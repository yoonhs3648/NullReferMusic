package com.nullrefer.music.download;

import com.nullrefer.music.config.NrmPaths;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class YtDlpDownloadService {

  private final NrmPaths paths;

  public YtDlpDownloadService(NrmPaths paths) {
    this.paths = paths;
  }

  public Map<String, Object> health() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("ytDlp", Files.isRegularFile(paths.getYtDlpPath()));
    body.put("ffmpeg", Files.isRegularFile(paths.getFfmpegExe()));
    body.put("outputDir", paths.getOutputDir().toString());
    return body;
  }

  public DownloadOutcome download(String url, boolean noPlaylist) {
    return download(url, noPlaylist, "mp3", 0);
  }

  public DownloadOutcome download(
      String url, boolean noPlaylist, String audioFormat, int audioQuality) {
    if (!YoutubeUrlValidator.isValid(url)) {
      return DownloadOutcome.error(
          HttpStatus.BAD_REQUEST, Map.of("error", "YouTube URL만 허용됩니다."));
    }

    if (!Files.isRegularFile(paths.getYtDlpPath())) {
      return DownloadOutcome.error(
          HttpStatus.INTERNAL_SERVER_ERROR,
          Map.of("error", "yt-dlp를 찾을 수 없습니다: " + paths.getYtDlpPath()));
    }

    if (!Files.isRegularFile(paths.getFfmpegExe())) {
      return DownloadOutcome.error(
          HttpStatus.INTERNAL_SERVER_ERROR,
          Map.of("error", "ffmpeg를 찾을 수 없습니다: " + paths.getFfmpegExe()));
    }

    String jobId = Long.toString(System.currentTimeMillis(), 36);
    String outPattern = "nrm_" + jobId + ".%(ext)s";

    List<String> cmd = new ArrayList<>();
    cmd.add(paths.getYtDlpPath().toString());
    cmd.add("--ffmpeg-location");
    cmd.add(paths.getFfmpegDir().toString());
    if (noPlaylist) {
      cmd.add("--no-playlist");
    }
    cmd.add("-x");
    cmd.add("--audio-format");
    cmd.add("mp3");
    cmd.add("--audio-quality");
    cmd.add("0");
    cmd.add("-P");
    cmd.add(paths.getOutputDir().toString());
    cmd.add("-o");
    cmd.add(outPattern);
    cmd.add(url.trim());

    Charset cs = Charset.defaultCharset();
    ProcessBuilder pb = new ProcessBuilder(cmd);
    pb.directory(paths.getRepoRoot().toFile());
    pb.redirectErrorStream(false);

    try {
      Process p = pb.start();
      StringBuilder stdout = new StringBuilder();
      StringBuilder stderr = new StringBuilder();
      Thread tOut = startDrain(p.getInputStream(), stdout, cs);
      Thread tErr = startDrain(p.getErrorStream(), stderr, cs);
      int code = p.waitFor();
      tOut.join();
      tErr.join();
      if (code != 0) {
        Map<String, Object> err = new LinkedHashMap<>();
        err.put("error", "yt-dlp 실행이 실패했습니다.");
        err.put("code", code);
        err.put("detail", tail(stderr.toString(), 6000));
        return DownloadOutcome.error(HttpStatus.INTERNAL_SERVER_ERROR, err);
      }
      Map<String, Object> ok = new LinkedHashMap<>();
      ok.put("ok", true);
      ok.put("jobId", jobId);
      ok.put("outputDir", paths.getOutputDir().toString());
      ok.put("message", "다운로드가 완료되었습니다.");
      ok.put("logTail", tail(stderr.toString(), 2000));
      return DownloadOutcome.success(ok);
    } catch (Exception e) {
      return DownloadOutcome.error(
          HttpStatus.INTERNAL_SERVER_ERROR, Map.of("error", e.getMessage()));
    }
  }

  private static String normalizeAudioFormat(String raw) {
    if (raw == null || raw.isBlank()) {
      return "mp3";
    }
    String f = raw.trim().toLowerCase();
    if (f.startsWith(".")) {
      f = f.substring(1);
    }
    return switch (f) {
      case "mp3", "m4a", "opus", "wav", "flac", "aac" -> f;
      case "ogg", "vorbis" -> "vorbis";
      default -> "mp3";
    };
  }

  private static Thread startDrain(InputStream in, StringBuilder sink, Charset cs) {
    Thread t =
        new Thread(
            () -> {
              try (BufferedReader r =
                  new BufferedReader(new InputStreamReader(in, cs))) {
                String line;
                while ((line = r.readLine()) != null) {
                  sink.append(line).append('\n');
                }
              } catch (Exception ignored) {
                // stream closed
              }
            });
    t.setDaemon(true);
    t.start();
    return t;
  }

  private static String tail(String s, int maxChars) {
    if (s == null || s.length() <= maxChars) {
      return s == null ? "" : s;
    }
    return s.substring(s.length() - maxChars);
  }

  public record DownloadOutcome(HttpStatus status, Map<String, Object> body) {

    static DownloadOutcome success(Map<String, Object> body) {
      return new DownloadOutcome(HttpStatus.OK, body);
    }

    static DownloadOutcome error(HttpStatus status, Map<String, Object> body) {
      return new DownloadOutcome(status, body);
    }
  }
}
