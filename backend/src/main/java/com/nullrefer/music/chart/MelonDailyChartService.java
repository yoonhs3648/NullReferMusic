package com.nullrefer.music.chart;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** 멜론 일간 차트(최신 게시분) HTML 크롤링 */
@Service
public class MelonDailyChartService {

  private static final Logger log = LoggerFactory.getLogger(MelonDailyChartService.class);
  private static final String BASE = "https://www.melon.com";
  private static final Pattern DATE_LABEL =
      Pattern.compile("(\\d{4})\\.(\\d{2})\\.(\\d{2})\\s*장르종합");
  private static final Pattern DATE_FALLBACK = Pattern.compile("(\\d{4})\\.(\\d{2})\\.(\\d{2})");

  private final RestClient restClient =
      RestClient.builder()
          .defaultHeader(HttpHeaders.USER_AGENT, MelonGenreChartService.USER_AGENT)
          .defaultHeader(HttpHeaders.ACCEPT, "text/html,application/xhtml+xml")
          .defaultHeader(HttpHeaders.ACCEPT_LANGUAGE, "ko-KR,ko;q=0.9")
          .defaultHeader(HttpHeaders.REFERER, BASE + "/chart/day/index.htm")
          .build();

  public MelonDailyChartResult fetchLatest(String classCd) {
    String genre = classCd == null || classCd.isBlank() ? "GN0000" : classCd.trim();
    String url =
        "GN0000".equals(genre)
            ? BASE + "/chart/day/index.htm"
            : BASE + "/chart/day/index.htm?classCd=" + genre + "&moved=Y";
    String html = fetchHtml(url);
    List<ChartTrackItem> items = MelonGenreChartService.parseChartHtml(html);
    if (items.isEmpty()) {
      throw new IllegalStateException("melon_empty");
    }
    String dateLabel = parseDateLabel(html);
    String playlistName =
        dateLabel != null
            ? "Melon 일간 · " + genre + " · " + dateLabel
            : "Melon 일간 · " + genre;
    return new MelonDailyChartResult(
        "melon",
        "daily:" + genre + ":" + (dateLabel != null ? dateLabel : "latest"),
        playlistName,
        "KR",
        Instant.now(),
        items,
        dateLabel);
  }

  private static String parseDateLabel(String html) {
    if (html == null) return null;
    Matcher m = DATE_LABEL.matcher(html);
    if (!m.find()) {
      m = DATE_FALLBACK.matcher(html);
      if (!m.find()) return null;
    }
    return m.group(1) + "-" + m.group(2) + "-" + m.group(3);
  }

  private String fetchHtml(String url) {
    try {
      return restClient.get().uri(URI.create(url)).retrieve().body(String.class);
    } catch (RestClientResponseException e) {
      log.warn("Melon daily chart HTTP {} {}", e.getStatusCode().value(), url);
      throw new IllegalStateException("melon_fetch_failed");
    } catch (Exception e) {
      log.warn("Melon daily chart fetch error {}: {}", url, e.toString());
      throw new IllegalStateException("melon_fetch_failed");
    }
  }
}
