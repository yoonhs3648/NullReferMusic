package com.nullrefer.music.download;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nullrefer.music.config.NrmPaths;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** 로컬 whisper.cpp (large-v3)로 오디오 → LRC */
@Service
public class WhisperLyricsService {

  private static final Logger log = LoggerFactory.getLogger(WhisperLyricsService.class);
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final long PROCESS_TIMEOUT_SEC = 90;

  private final NrmPaths paths;

  public WhisperLyricsService(NrmPaths paths) {
    this.paths = paths;
  }

  public boolean isAvailable() {
    return Files.isRegularFile(paths.getWhisperCli()) && Files.isRegularFile(paths.getWhisperModel());
  }

  /**
   * 언어 자동 감지 전사. 번역 모드도 현재는 동일 경로(추후 분기 가능).
   */
  public String transcribeToLrc(Path audioFile, boolean translationMode, String modelPreference) {
    if (!isAvailable()) {
      log.warn("whisper not configured (cli or model missing)");
      return "";
    }
    if (audioFile == null || !Files.isRegularFile(audioFile)) {
      return "";
    }
    Path workDir = audioFile.getParent();
    if (workDir == null) {
      return "";
    }
    Path wav = null;
    Path outPrefix = null;
    try {
      wav = workDir.resolve("nrm-whisper-" + System.currentTimeMillis() + ".wav");
      convertTo16kMonoWav(audioFile, wav);
      outPrefix =
          workDir.resolve(
              "nrm-whisper-out-" + System.currentTimeMillis());
      runWhisper(wav, outPrefix, modelPreference);
      String fromLrc = readIfExists(Path.of(outPrefix.toString() + ".lrc"));
      if (!fromLrc.isEmpty()) {
        return fromLrc;
      }
      String fromJson = segmentsJsonToLrc(Path.of(outPrefix.toString() + ".json"));
      if (!fromJson.isEmpty()) return fromJson;
      return segmentsJsonToLrc(Path.of(outPrefix.toString() + ".wav.json"));
    } catch (Exception e) {
      log.warn("whisper transcribe failed for {}: {}", audioFile, e.getMessage());
      return "";
    } finally {
      deleteQuiet(wav);
      if (outPrefix != null) {
        deleteQuiet(Path.of(outPrefix.toString() + ".lrc"));
        deleteQuiet(Path.of(outPrefix.toString() + ".json"));
        deleteQuiet(Path.of(outPrefix.toString() + ".wav.json"));
        deleteQuiet(Path.of(outPrefix.toString() + ".txt"));
      }
    }
  }

  private void convertTo16kMonoWav(Path inFile, Path wavOut) throws Exception {
    if (!Files.isRegularFile(paths.getFfmpegExe())) {
      throw new IllegalStateException("ffmpeg_missing");
    }
    List<String> cmd = new ArrayList<>();
    cmd.add(paths.getFfmpegExe().toString());
    cmd.add("-y");
    cmd.add("-i");
    cmd.add(inFile.toString());
    cmd.add("-ar");
    cmd.add("16000");
    cmd.add("-ac");
    cmd.add("1");
    cmd.add("-c:a");
    cmd.add("pcm_s16le");
    cmd.add(wavOut.toString());
    runProcess(cmd);
  }

  private void runWhisper(Path wavFile, Path outPrefix, String modelPreference) throws Exception {
    Path modelPath = resolveModelPath(modelPreference);
    List<String> cmd = new ArrayList<>();
    cmd.add(paths.getWhisperCli().toString());
    cmd.add("-m");
    cmd.add(modelPath.toString());
    cmd.add("-f");
    cmd.add(wavFile.toString());
    cmd.add("-of");
    cmd.add(outPrefix.toString());
    cmd.add("--output-lrc");
    cmd.add("--output-json");
    cmd.add("--no-prints");
    runProcess(cmd);
  }

  private Path resolveModelPath(String modelPreference) {
    List<String> order = modelOrderForPreference(modelPreference);
    Path dir = paths.getWhisperDir();
    for (String modelName : order) {
      Path candidate = dir.resolve(modelName);
      if (Files.isRegularFile(candidate)) return candidate;
    }
    return paths.getWhisperModel();
  }

  private static List<String> modelOrderForPreference(String modelPreference) {
    String pref = trim(modelPreference);
    String[] fast = {
      "ggml-tiny-q5_1.bin",
      "ggml-tiny.bin",
      "ggml-base.en-q5_1.bin",
      "ggml-base.en.bin",
      "ggml-small-q5_1.bin",
      "ggml-medium-q5_0.bin",
      "ggml-large-v3-turbo-q5_0.bin",
      "ggml-large-v3-turbo.bin",
      "ggml-large-v3-q5_0.bin",
      "ggml-large-v3.bin"
    };
    if (pref.startsWith("model:")) {
      String one = pref.substring("model:".length()).trim();
      if (!one.isEmpty()) {
        List<String> out = new ArrayList<>();
        out.add(one);
        out.addAll(Arrays.asList(fast));
        return out;
      }
    }
    if ("profile:quality".equals(pref)) {
      return List.of(
          "ggml-large-v3.bin",
          "ggml-large-v3-q5_0.bin",
          "ggml-large-v3-turbo.bin",
          "ggml-large-v3-turbo-q5_0.bin",
          "ggml-medium-q5_0.bin",
          "ggml-small-q5_1.bin",
          "ggml-base.en.bin",
          "ggml-base.en-q5_1.bin",
          "ggml-tiny.bin",
          "ggml-tiny-q5_1.bin");
    }
    if ("profile:balanced".equals(pref)) {
      return List.of(
          "ggml-medium-q5_0.bin",
          "ggml-small-q5_1.bin",
          "ggml-base.en.bin",
          "ggml-base.en-q5_1.bin",
          "ggml-large-v3-turbo-q5_0.bin",
          "ggml-large-v3-turbo.bin",
          "ggml-large-v3-q5_0.bin",
          "ggml-large-v3.bin",
          "ggml-tiny.bin",
          "ggml-tiny-q5_1.bin");
    }
    return Arrays.asList(fast);
  }

  private static String segmentsJsonToLrc(Path jsonPath) throws Exception {
    if (!Files.isRegularFile(jsonPath)) {
      return "";
    }
    JsonNode root = JSON.readTree(Files.readString(jsonPath, StandardCharsets.UTF_8));
    JsonNode segments = root.get("segments");
    if (segments == null || !segments.isArray()) {
      return "";
    }
    StringBuilder out = new StringBuilder();
    for (JsonNode seg : segments) {
      double start = seg.path("start").asDouble(-1);
      String text = seg.path("text").asText("").trim();
      if (start < 0 || text.isEmpty()) continue;
      out.append('[').append(formatLrcTimestamp((long) Math.round(start * 1000))).append(']');
      out.append(text).append('\n');
    }
    return out.toString().trim();
  }

  private static String formatLrcTimestamp(long startMs) {
    long totalCs = Math.max(0, Math.round(startMs / 10.0));
    long cs = totalCs % 100;
    long totalSec = totalCs / 100;
    long sec = totalSec % 60;
    long min = (totalSec / 60) % 60;
    long hour = totalSec / 3600;
    long mm = min + hour * 60;
    return String.format("%02d:%02d.%02d", mm, sec, cs);
  }

  private static String readIfExists(Path p) {
    try {
      if (Files.isRegularFile(p)) {
        return Files.readString(p, StandardCharsets.UTF_8).trim();
      }
    } catch (Exception ignored) {
      // ignore
    }
    return "";
  }

  private void runProcess(List<String> cmd) throws Exception {
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
    boolean finished = p.waitFor(PROCESS_TIMEOUT_SEC, TimeUnit.SECONDS);
    if (!finished) {
      p.destroyForcibly();
      throw new IllegalStateException("process_timeout");
    }
    int code = p.exitValue();
    if (code != 0) {
      throw new IllegalStateException("process_exit_" + code + ": " + tail(out.toString(), 1500));
    }
  }

  private static void deleteQuiet(Path p) {
    if (p == null) return;
    try {
      Files.deleteIfExists(p);
    } catch (Exception ignored) {
      // ignore
    }
  }

  private static String tail(String s, int max) {
    if (s == null || s.length() <= max) return s == null ? "" : s;
    return s.substring(s.length() - max);
  }

  private static String trim(String v) {
    return v == null ? "" : v.trim();
  }
}
