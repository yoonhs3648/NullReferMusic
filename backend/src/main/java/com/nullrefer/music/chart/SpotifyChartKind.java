package com.nullrefer.music.chart;

/** Spotify 차트 슬러그 및 플레이리스트 설정. */
public enum SpotifyChartKind {

  TOP100_KR_DAILY(
      "top100-kr-daily",
      "regional-kr-daily",
      "37i9dQZEVXbJlXK4fQztZ3",
      "KR",
      100,
      "Top 100 - Korea Daily"),

  TOP100_KR_WEEKLY(
      "top100-kr-weekly",
      "regional-kr-weekly",
      "",
      "KR",
      100,
      "Top 100 - Korea Weekly"),

  TOP100_GLOBAL_DAILY(
      "top100-global-daily",
      "regional-global-daily",
      "37i9dQZEVXbMDoHDwVN2tF",
      "US",
      100,
      "Top 100 - Global Daily"),

  TOP100_GLOBAL_WEEKLY(
      "top100-global-weekly",
      "regional-global-weekly",
      "",
      "US",
      100,
      "Top 100 - Global Weekly");

  private final String key;
  private final String chartSlug;
  private final String playlistId;
  private final String market;
  private final int maxTracks;
  private final String displayName;

  SpotifyChartKind(
      String key,
      String chartSlug,
      String playlistId,
      String market,
      int maxTracks,
      String displayName) {
    this.key = key;
    this.chartSlug = chartSlug;
    this.playlistId = playlistId;
    this.market = market;
    this.maxTracks = maxTracks;
    this.displayName = displayName;
  }

  public String key() {
    return key;
  }

  public String chartSlug() {
    return chartSlug;
  }

  public String playlistId() {
    return playlistId;
  }

  public String market() {
    return market;
  }

  public int maxTracks() {
    return maxTracks;
  }

  public String displayName() {
    return displayName;
  }

  public static SpotifyChartKind fromKey(String raw) {
    if (raw == null || raw.isBlank()) {
      return TOP100_KR_DAILY;
    }
    String k = raw.trim().toLowerCase();
    for (SpotifyChartKind kind : values()) {
      if (kind.key.equals(k)) {
        return kind;
      }
    }
    throw new IllegalStateException("spotify_chart_unknown");
  }
}
