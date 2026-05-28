package com.nullrefer.music.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "nrm")
public class NrmSettings {

  /** Absolute repo root; empty = infer from working directory */
  private String repoRoot = "";

  private String ytDlpPath = "";
  private String ffmpegDir = "";
  private String outputDir = "";
  private String whisperDir = "";
  private String whisperCli = "";
  private String whisperModel = "";

  private String youtubeApiKey = "";

  private String spotifyClientId = "";
  private String spotifyClientSecret = "";
  /** 공개 플레이리스트 ID (레거시 top100). */
  private String spotifyChartPlaylistId = "";

  private String lastfmApiKey = "";
  private String lastfmSharedSecret = "";

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

  public String getWhisperDir() {
    return whisperDir;
  }

  public void setWhisperDir(String whisperDir) {
    this.whisperDir = whisperDir;
  }

  public String getWhisperCli() {
    return whisperCli;
  }

  public void setWhisperCli(String whisperCli) {
    this.whisperCli = whisperCli;
  }

  public String getWhisperModel() {
    return whisperModel;
  }

  public void setWhisperModel(String whisperModel) {
    this.whisperModel = whisperModel;
  }

  public String getYoutubeApiKey() {
    return youtubeApiKey;
  }

  public void setYoutubeApiKey(String youtubeApiKey) {
    this.youtubeApiKey = youtubeApiKey;
  }

  public String getSpotifyClientId() {
    return spotifyClientId;
  }

  public void setSpotifyClientId(String spotifyClientId) {
    this.spotifyClientId = spotifyClientId;
  }

  public String getSpotifyClientSecret() {
    return spotifyClientSecret;
  }

  public void setSpotifyClientSecret(String spotifyClientSecret) {
    this.spotifyClientSecret = spotifyClientSecret;
  }

  public String getSpotifyChartPlaylistId() {
    return spotifyChartPlaylistId;
  }

  public void setSpotifyChartPlaylistId(String spotifyChartPlaylistId) {
    this.spotifyChartPlaylistId = spotifyChartPlaylistId;
  }

  public String getLastfmApiKey() {
    return lastfmApiKey;
  }

  public void setLastfmApiKey(String lastfmApiKey) {
    this.lastfmApiKey = lastfmApiKey;
  }

  public String getLastfmSharedSecret() {
    return lastfmSharedSecret;
  }

  public void setLastfmSharedSecret(String lastfmSharedSecret) {
    this.lastfmSharedSecret = lastfmSharedSecret;
  }
}
