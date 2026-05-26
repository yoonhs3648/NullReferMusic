package com.nullrefer.music.chart;

/** Last.fm 차트 키. */
public enum LastfmChartKind {

  TOP100_KR("top100-kr", "geo", "Korea, Republic of", "KR", 100, "Top 100 - Korea"),

  TOP100_GLOBAL("top100-global", "chart", "", "GLOBAL", 100, "Top 100 - Global");

  private final String key;
  private final String method;
  private final String country;
  private final String market;
  private final int maxTracks;
  private final String displayName;

  LastfmChartKind(
      String key,
      String method,
      String country,
      String market,
      int maxTracks,
      String displayName) {
    this.key = key;
    this.method = method;
    this.country = country;
    this.market = market;
    this.maxTracks = maxTracks;
    this.displayName = displayName;
  }

  public String key() {
    return key;
  }

  public String method() {
    return method;
  }

  public String country() {
    return country;
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

  public static LastfmChartKind fromKey(String raw) {
    if (raw == null || raw.isBlank()) {
      return TOP100_KR;
    }
    String k = raw.trim().toLowerCase();
    for (LastfmChartKind kind : values()) {
      if (kind.key.equals(k)) {
        return kind;
      }
    }
    throw new IllegalStateException("lastfm_chart_unknown");
  }
}
