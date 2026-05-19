package com.nullrefer.music.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "nrm")
public class NrmSettings {

  /** Absolute repo root; empty = infer from working directory */
  private String repoRoot = "";

  private String ytDlpPath = "";
  private String ffmpegDir = "";
  private String outputDir = "";

  private String youtubeApiKey = "";

  public String getRepoRoot() {
    return repoRoot;
  }

  public void setRepoRoot(String repoRoot) {
    this.repoRoot = repoRoot;
  }

  public String getYtDlpPath() {
    return ytDlpPath;
  }

  public void setYtDlpPath(String ytDlpPath) {
    this.ytDlpPath = ytDlpPath;
  }

  public String getFfmpegDir() {
    return ffmpegDir;
  }

  public void setFfmpegDir(String ffmpegDir) {
    this.ffmpegDir = ffmpegDir;
  }

  public String getOutputDir() {
    return outputDir;
  }

  public void setOutputDir(String outputDir) {
    this.outputDir = outputDir;
  }

  public String getYoutubeApiKey() {
    return youtubeApiKey;
  }

  public void setYoutubeApiKey(String youtubeApiKey) {
    this.youtubeApiKey = youtubeApiKey;
  }
}
