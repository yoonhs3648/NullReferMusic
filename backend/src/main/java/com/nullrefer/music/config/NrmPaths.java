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

  public NrmPaths(NrmSettings settings) {
    this.repoRoot = resolveRepoRoot(settings.getRepoRoot());
    this.ytDlpPath = firstPath(settings.getYtDlpPath(), repoRoot.resolve("library/yt-dlp.exe"));
    this.ffmpegDir =
        firstPath(settings.getFfmpegDir(), repoRoot.resolve("library/ffmpeg-7.1.1-essentials_build/bin"));
    this.outputDir = firstPath(settings.getOutputDir(), repoRoot.resolve("downloads"));
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
}
