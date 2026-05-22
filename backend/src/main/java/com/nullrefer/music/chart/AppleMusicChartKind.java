package com.nullrefer.music.chart;

/** Apple Music RSS(most-played) 차트 키. */
public enum AppleMusicChartKind {
  TOP100_KR("top100-kr", "kr", "KR", 100, "Top 100 - Korea"),
  TOP100_GLOBAL("top100-global", "us", "GLOBAL", 100, "Top 100 - Global");

  private static final String RSS_BASE =
      "https://rss.marketingtools.apple.com/api/v2";

  private final String key;
  private final String storefront;
  private final String market;
  private final int maxTracks;
  private final String displayName;

  AppleMusicChartKind(
      String key, String storefront, String market, int maxTracks, String displayName) {
    this.key = key;
    this.storefront = storefront;
    this.market = market;
    this.maxTracks = maxTracks;
    this.displayName = displayName;
  }

  public String key() {
    return key;
  }

  public String storefront() {
    return storefront;
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

  public String feedUrl() {
    return RSS_BASE + "/" + storefront + "/music/most-played/" + maxTracks + "/songs.json";
  }

  public static AppleMusicChartKind fromKey(String raw) {
    if (raw == null || raw.isBlank()) {
      return TOP100_KR;
    }
    String k = raw.trim().toLowerCase();
    if ("top50-kr".equals(k)) {
      return TOP100_KR;
    }
    if ("top50-global".equals(k)) {
      return TOP100_GLOBAL;
    }
    for (AppleMusicChartKind kind : values()) {
      if (kind.key.equals(k)) {
        return kind;
      }
    }
    throw new IllegalStateException("apple_music_chart_unknown");
  }
}
