package com.nullrefer.music.chart;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** 멜론 실시간 차트 Top100 / HOT100 (HTML 크롤링) */
@Service
public class MelonRealtimeChartService {

  private static final Logger log = LoggerFactory.getLogger(MelonRealtimeChartService.class);
  private static final String BASE = "https://www.melon.com";

  private final RestClient restClient =
      RestClient.builder()
          .defaultHeader(HttpHeaders.USER_AGENT, MelonGenreChartService.USER_AGENT)
          .defaultHeader(HttpHeaders.ACCEPT, "text/html,application/xhtml+xml")
          .defaultHeader(HttpHeaders.ACCEPT_LANGUAGE, "ko-KR,ko;q=0.9")
          .defaultHeader(HttpHeaders.REFERER, BASE + "/chart/index.htm")
          .build();

  public SpotifyChartResult fetchChart(String chartKey) {
    String key = normalizeChartKey(chartKey);
    String url =
        switch (key) {
          case "hot100" -> BASE + "/chart/hot100/index.htm";
          case "top100" -> BASE + "/chart/index.htm";
          default -> throw new IllegalArgumentException("melon_invalid_chart");
        };
    String html = fetchHtml(url);
    List<ChartTrackItem> items = MelonGenreChartService.parseChartHtml(html);
    if (items.isEmpty()) {
      throw new IllegalStateException("melon_empty");
    }
    String playlistName = "hot100".equals(key) ? "HOT100" : "TOP100";
    return new SpotifyChartResult(
        "melon",
        key,
        playlistName,
        "KR",
        Instant.now(),
        items);
  }

  private static String normalizeChartKey(String raw) {
    if (raw == null || raw.isBlank()) {
      return "top100";
    }
    String key = raw.trim().toLowerCase();
    if ("top100".equals(key) || "hot100".equals(key)) {
      return key;
    }
    throw new IllegalArgumentException("melon_invalid_chart");
  }

  private String fetchHtml(String url) {
    try {
      return restClient.get().uri(URI.create(url)).retrieve().body(String.class);
    } catch (RestClientResponseException e) {
      log.warn("Melon realtime chart HTTP {} {}", e.getStatusCode().value(), url);
      throw new IllegalStateException("melon_fetch_failed");
    } catch (Exception e) {
      log.warn("Melon realtime chart fetch error {}: {}", url, e.toString());
      throw new IllegalStateException("melon_fetch_failed");
    }
  }
}
