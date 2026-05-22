package com.nullrefer.music.chart;



/** charts.spotify.com 내부 API 차트 슬러그. */

public enum SpotifyChartKind {

  TOP50_KR(
      "top50-kr",
      "regional-kr-daily",
      "37i9dQZEVXbJlXK4fQztZ3",
      "KR",
      50,
      "Top 50 - Korea"),

  VIRAL50_KR(
      "viral50-kr",
      "viral-kr-daily",
      "37i9dQZEVXbJfc6vjXwHfWy",
      "KR",
      50,
      "Viral 50 - Korea"),

  TOP50_GLOBAL(
      "top50-global",
      "regional-global-daily",
      "37i9dQZEVXbMDoHDwVN2tF",
      "US",
      50,
      "Top 50 - Global"),

  VIRAL50_GLOBAL(
      "viral50-global",
      "viral-global-daily",
      "37i9dQZEVXbLiRSasXNY5lA",
      "US",
      50,
      "Viral 50 - Global");



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

      return TOP50_KR;

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

