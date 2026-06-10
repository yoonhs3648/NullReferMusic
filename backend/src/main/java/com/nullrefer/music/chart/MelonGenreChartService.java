package com.nullrefer.music.chart;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** 멜론 장르별 기간 차트 (HTML 크롤링) */
@Service
public class MelonGenreChartService {

  private static final Logger log = LoggerFactory.getLogger(MelonGenreChartService.class);
  private static final String BASE = "https://www.melon.com";
  static final String USER_AGENT =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  private static final int MAX_TRACKS = 100;

  private static final Pattern ROW_SPLIT = Pattern.compile("<tr class=\"lst50\"");
  private static final Pattern RANK = Pattern.compile("class=\"rank[^\"]*\">\\s*(\\d+)\\s*<");
  private static final Pattern SONG_ID_ATTR = Pattern.compile("data-song-no=\"(\\d+)\"");
  private static final Pattern SONG_ID_LINK = Pattern.compile("songId=(\\d+)");
  private static final Pattern CHECKBOX_VALUE = Pattern.compile("name=\"input_check\" value=\"(\\d+)\"");
  private static final Pattern IMG_SRC = Pattern.compile("<img[^>]+src=\"([^\"]+)\"");
  private static final Pattern TITLE_STRONG =
      Pattern.compile(
          "rank01[\\s\\S]*?<strong>\\s*<a[^>]*title=\"([^\"]+)\"[^>]*>([^<]*)</a>",
          Pattern.CASE_INSENSITIVE);
  private static final Pattern TITLE_LINK =
      Pattern.compile(
          "rank01[\\s\\S]*?<a[^>]*title=\"([^\"]+) 재생\"[^>]*>([^<]*)</a>",
          Pattern.CASE_INSENSITIVE);
  private static final Pattern ARTIST =
      Pattern.compile("rank02[\\s\\S]*?<a[^>]*>([^<]+)</a>", Pattern.CASE_INSENSITIVE);
  private static final Pattern ALBUM =
      Pattern.compile("rank03[\\s\\S]*?<a[^>]*>([^<]+)</a>", Pattern.CASE_INSENSITIVE);

  private final RestClient restClient =
      RestClient.builder()
          .defaultHeader(HttpHeaders.USER_AGENT, USER_AGENT)
          .defaultHeader(HttpHeaders.ACCEPT, "text/html,application/xhtml+xml")
          .defaultHeader(HttpHeaders.ACCEPT_LANGUAGE, "ko-KR,ko;q=0.9")
          .defaultHeader(HttpHeaders.REFERER, BASE + "/chart/search/index.htm")
          .build();

  public PeriodChartPageResult fetchGenrePage(
      String kind,
      String classCd,
      int year,
      Integer month,
      Integer week,
      int offset,
      int limit) {
    String normalizedKind = normalizeKind(kind);
    String genre = normalizeClassCd(classCd);
    LocalDate today = LocalDate.now(ZoneOffset.ofHours(9));
    int m = month != null ? MelonPeriodDates.clampMonth(year, month, today) : 1;
    int w =
        week != null
            ? MelonPeriodDates.clampWeek(year, m, week, today)
            : MelonPeriodDates.defaultWeekOfMonth(year, m, today);

    String url = buildUrl(normalizedKind, genre, year, m, w);
    String html = fetchHtml(url);
    List<ChartTrackItem> all = parseChartHtml(html);
    int safeOffset = Math.max(0, offset);
    int safeLimit = Math.min(Math.max(1, limit), MAX_TRACKS);
    int end = Math.min(all.size(), safeOffset + safeLimit);
    List<ChartTrackItem> slice =
        safeOffset >= all.size() ? List.of() : all.subList(safeOffset, end);

    String playlistName = playlistLabel(normalizedKind, genre, year, m, w);
    return new PeriodChartPageResult(
        "melon",
        genre + ":" + normalizedKind + ":" + year + ":" + m + ":" + w,
        playlistName,
        "KR",
        Instant.now(),
        slice,
        safeOffset,
        safeLimit,
        end < all.size());
  }

  private String buildUrl(String kind, String classCd, int year, int month, int week) {
    return switch (kind) {
      case "weekly" -> {
        String[] range = MelonPeriodDates.weekRange(year, month, week);
        yield BASE
            + "/chart/week/index.htm?classCd="
            + classCd
            + "&moved=Y&startDay="
            + range[0]
            + "&endDay="
            + range[1];
      }
      case "monthly" ->
          BASE
              + "/chart/month/index.htm?classCd="
              + classCd
              + "&moved=Y&rankMonth="
              + MelonPeriodDates.rankMonth(year, month);
      case "yearly" ->
          BASE
              + "/chart/age/list.htm?chartType=YE&chartGenre="
              + classCd
              + "&chartDate="
              + year
              + "&moved=Y";
      default -> throw new IllegalArgumentException("melon_invalid_kind");
    };
  }

  private String fetchHtml(String url) {
    try {
      return restClient.get().uri(URI.create(url)).retrieve().body(String.class);
    } catch (RestClientResponseException e) {
      log.warn("Melon chart HTTP {} {}", e.getStatusCode().value(), url);
      throw new IllegalStateException("melon_fetch_failed");
    } catch (Exception e) {
      log.warn("Melon chart fetch error {}: {}", url, e.toString());
      throw new IllegalStateException("melon_fetch_failed");
    }
  }

  static List<ChartTrackItem> parseChartHtml(String html) {
    if (html == null || html.isBlank()) {
      return List.of();
    }
    String[] chunks = ROW_SPLIT.split(html);
    List<ChartTrackItem> items = new ArrayList<>();
    for (int i = 1; i < chunks.length && items.size() < MAX_TRACKS; i++) {
      ChartTrackItem row = parseRow(chunks[i], items.size() + 1);
      if (row != null) {
        items.add(row);
      }
    }
    return items;
  }

  private static ChartTrackItem parseRow(String chunk, int rankFallback) {
    String songId = firstMatch(chunk, SONG_ID_ATTR);
    if (songId == null) {
      songId = firstMatch(chunk, CHECKBOX_VALUE);
    }
    if (songId == null) {
      songId = firstMatch(chunk, SONG_ID_LINK);
    }
    if (songId == null || songId.isBlank()) {
      return null;
    }

    int rank = parseInt(firstMatch(chunk, RANK), rankFallback);
    String title = "";
    Matcher strong = TITLE_STRONG.matcher(chunk);
    if (strong.find()) {
      title = cleanText(strong.group(1));
      if (title.isBlank()) {
        title = cleanText(strong.group(2));
      }
    } else {
      Matcher link = TITLE_LINK.matcher(chunk);
      if (link.find()) {
        title = cleanText(link.group(1));
        if (title.isBlank()) {
          title = cleanText(link.group(2));
        }
      }
    }
    String artists = cleanText(firstMatchGroup(chunk, ARTIST));
    String album = cleanText(firstMatchGroup(chunk, ALBUM));
    String imageUrl = firstMatch(chunk, IMG_SRC);
    if (imageUrl != null && imageUrl.startsWith("//")) {
      imageUrl = "https:" + imageUrl;
    }

    return new ChartTrackItem(
        rank,
        songId,
        title,
        artists,
        album,
        imageUrl != null ? imageUrl : "",
        BASE + "/song/detail.htm?songId=" + songId,
        0L,
        0,
        "");
  }

  private static int parseInt(String raw, int fallback) {
    if (raw == null || raw.isBlank()) {
      return fallback;
    }
    try {
      return Integer.parseInt(raw.trim());
    } catch (NumberFormatException e) {
      return fallback;
    }
  }

  private static String firstMatch(String text, Pattern pattern) {
    Matcher m = pattern.matcher(text);
    return m.find() ? m.group(1) : null;
  }

  private static String firstMatchGroup(String text, Pattern pattern) {
    Matcher m = pattern.matcher(text);
    return m.find() ? m.group(1) : "";
  }

  private static String cleanText(String raw) {
    if (raw == null) {
      return "";
    }
    return raw
        .replace("&nbsp;", " ")
        .replaceAll("<[^>]+>", "")
        .replaceAll("\\s+", " ")
        .trim();
  }

  private static String normalizeKind(String kind) {
    String k = kind == null ? "" : kind.trim().toLowerCase();
    return switch (k) {
      case "weekly", "week", "w" -> "weekly";
      case "monthly", "month", "mo", "m" -> "monthly";
      case "yearly", "year", "ye", "y" -> "yearly";
      default -> throw new IllegalArgumentException("melon_invalid_kind");
    };
  }

  private static String normalizeClassCd(String classCd) {
    String cd = classCd == null ? "" : classCd.trim().toUpperCase();
    if (!cd.matches("^(GN|DM|AB)\\d{4}$")) {
      throw new IllegalArgumentException("melon_invalid_genre");
    }
    return cd;
  }

  private static String playlistLabel(String kind, String classCd, int year, int month, int week) {
    String genreLabel = genreLabel(classCd);
    return switch (kind) {
      case "weekly" -> {
        String[] range = MelonPeriodDates.weekRange(year, month, week);
        yield genreLabel
            + " · "
            + formatYmd(range[0])
            + " ~ "
            + formatYmd(range[1])
            + " · 주간";
      }
      case "monthly" -> genreLabel + " · " + year + "." + month + " · 월간";
      case "yearly" -> genreLabel + " · " + year + " · 연간";
      default -> genreLabel;
    };
  }

  private static String formatYmd(String ymd) {
    if (ymd == null || ymd.length() != 8) {
      return ymd;
    }
    return ymd.substring(0, 4) + "." + ymd.substring(4, 6) + "." + ymd.substring(6, 8);
  }

  private static String genreLabel(String classCd) {
    return switch (classCd) {
      case "GN0000" -> "장르종합";
      case "DM0000" -> "국내종합";
      case "AB0000" -> "해외종합";
      case "GN0300" -> "국내 랩/힙합";
      case "GN0400" -> "국내 R&B/Soul";
      case "GN0100" -> "발라드";
      case "GN0200" -> "댄스";
      case "GN0500" -> "인디음악";
      case "GN0600" -> "국내 록/메탈";
      case "GN0900" -> "POP";
      case "GN1200" -> "해외 랩/힙합";
      case "GN1300" -> "해외 R&B/Soul";
      case "GN1000" -> "해외 록/메탈";
      case "GN1100" -> "일렉트로니카";
      case "GN1500" -> "OST";
      case "GN1900" -> "J-POP";
      default -> classCd;
    };
  }
}
