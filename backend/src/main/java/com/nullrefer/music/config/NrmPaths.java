package com.nullrefer.music.config;

import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class NrmPaths {

  private final Path repoRoot;
  private final Path ytDlpPath;
  private final Path ffmpegDir;
  private final Path outputDir;
  private final Path whisperDir;
  private final Path whisperCli;
  private final Path whisperModel;

  public NrmPaths(NrmSettings settings) {
    this.repoRoot = resolveRepoRoot(settings.getRepoRoot());
    this.ytDlpPath = firstPath(settings.getYtDlpPath(), repoRoot.resolve("library/yt-dlp.exe"));
    this.ffmpegDir =
        firstPath(settings.getFfmpegDir(), repoRoot.resolve("library/ffmpeg-7.1.1-essentials_build/bin"));
    this.outputDir = firstPath(settings.getOutputDir(), repoRoot.resolve("downloads"));
    this.whisperDir = firstPath(settings.getWhisperDir(), repoRoot.resolve("library/whisper"));
    this.whisperCli = resolveWhisperCli(settings.getWhisperCli(), whisperDir);
    this.whisperModel = resolveWhisperModel(settings.getWhisperModel(), whisperDir);
    try {
      Files.createDirectories(this.outputDir);
    } catch (Exception ignored) {
      // mkdir attempt; controller will surface errors if unusable
    }
  }

  private static Path resolveRepoRoot(String configured) {
    if (StringUtils.hasText(configured)) {
      return Path.of(configured.trim()).toAbsolutePath().normalize();
    }
    Path cwd = Path.of(System.getProperty("user.dir", ".")).toAbsolutePath().normalize();
    if (cwd.getFileName() != null && cwd.getFileName().toString().equalsIgnoreCase("backend")) {
      Path parent = cwd.getParent();
      return parent != null ? parent : cwd;
    }
    return cwd;
  }

  private static Path firstPath(String configured, Path fallback) {
    if (StringUtils.hasText(configured)) {
      return Path.of(configured.trim()).toAbsolutePath().normalize();
    }
    return fallback.toAbsolutePath().normalize();
  }

  public Path getRepoRoot() {
    return repoRoot;
  }

  public Path getYtDlpPath() {
    return ytDlpPath;
  }

  public Path getFfmpegDir() {
    return ffmpegDir;
  }

  public Path getOutputDir() {
    return outputDir;
  }

  public Path getFfmpegExe() {
    return ffmpegDir.resolve("ffmpeg.exe");
  }

  public Path getWhisperDir() {
    return whisperDir;
  }

  public Path getWhisperCli() {
    return whisperCli;
  }

  public Path getWhisperModel() {
    return whisperModel;
  }

  private static Path resolveWhisperCli(String configured, Path dir) {
    if (StringUtils.hasText(configured)) {
      return Path.of(configured.trim()).toAbsolutePath().normalize();
    }
    Path win = dir.resolve("whisper-cli.exe");
    if (java.nio.file.Files.isRegularFile(win)) return win;
    Path main = dir.resolve("main.exe");
    if (java.nio.file.Files.isRegularFile(main)) return main;
    Path unix = dir.resolve("whisper-cli");
    if (java.nio.file.Files.isRegularFile(unix)) return unix;
    return dir.resolve("whisper-cli.exe");
  }

  private static Path resolveWhisperModel(String configured, Path dir) {
    if (StringUtils.hasText(configured)) {
      return Path.of(configured.trim()).toAbsolutePath().normalize();
    }
    String[] preferredFastToSlow = {
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
    for (String name : preferredFastToSlow) {
      Path candidate = dir.resolve(name);
      if (java.nio.file.Files.isRegularFile(candidate)) return candidate;
    }
    return dir.resolve("ggml-tiny-q5_1.bin");
  }
}
