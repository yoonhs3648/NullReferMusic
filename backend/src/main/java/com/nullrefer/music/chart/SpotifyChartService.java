package com.nullrefer.music.chart;



import com.fasterxml.jackson.databind.JsonNode;

import com.fasterxml.jackson.databind.ObjectMapper;

import com.nullrefer.music.config.NrmSettings;

import java.time.Duration;

import java.time.Instant;

import java.time.LocalDate;

import java.time.ZoneOffset;

import java.util.ArrayList;

import java.util.Comparator;

import java.util.HashMap;

import java.util.List;

import java.util.Map;

import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;

import org.slf4j.LoggerFactory;

import org.springframework.stereotype.Service;

import org.springframework.web.client.RestClient;

import org.springframework.web.client.RestClientResponseException;

import org.springframework.web.util.UriComponentsBuilder;



/**

 * charts.spotify.com 내부 API(charts-spotify-com-service.spotify.com)로 실시간 차트를 조회합니다.

 *

 * <p>일간 Top/Viral 50은 인증 엔드포인트({@code /auth/v0/charts/{slug}/{date}})가 필요합니다. Bearer는

 * charts.spotify.com 로그인 세션 토큰 또는 앱 토큰 관리에 저장된 값을 사용합니다.

 */

@Service

public class SpotifyChartService {



  private static final Logger log = LoggerFactory.getLogger(SpotifyChartService.class);

  private static final String CHARTS_API_BASE =

      "https://charts-spotify-com-service.spotify.com";

  private static final int LEGACY_MAX_TRACKS = 100;

  private static final int PERIOD_MAX_TRACKS = 1000;

  private static final int SPOTIFY_CHART_SINGLE_MAX = 200;

  private static final int PERIOD_PAGE_SIZE_DEFAULT = 50;

  private static final int DATE_LOOKBACK_DAYS = 10;

  private static final long PERIOD_REQUEST_GAP_MS = 750L;

  private static final Duration PERIOD_CACHE_TTL = Duration.ofMinutes(20);

  private record CachedPeriodChart(List<ChartTrackItem> items, Instant expiresAt) {
    boolean alive() {
      return Instant.now().isBefore(expiresAt);
    }
  }

  private final ConcurrentHashMap<String, CachedPeriodChart> periodChartCache =
      new ConcurrentHashMap<>();

  private final NrmSettings settings;

  private final SpotifyTokenProvider tokenProvider;

  private final SpotifyWebApiChartService webApiChartService;

  private final SpotifyChartsSessionAuthService chartsSessionAuthService;

  private final ObjectMapper objectMapper;

  private final RestClient restClient = RestClient.create();



  public SpotifyChartService(

      NrmSettings settings,
      SpotifyTokenProvider tokenProvider,
      SpotifyWebApiChartService webApiChartService,
      SpotifyChartsSessionAuthService chartsSessionAuthService,
      ObjectMapper objectMapper) {

    this.settings = settings;

    this.tokenProvider = tokenProvider;

    this.webApiChartService = webApiChartService;

    this.chartsSessionAuthService = chartsSessionAuthService;

    this.objectMapper = objectMapper;

  }



  public SpotifyChartResult fetchTopChart(String market) {
    return fetchTopChart(market, null, null, null);
  }

  public SpotifyChartResult fetchTopChart(
      String market,
      String clientIdOverride,
      String clientSecretOverride,
      String bearerTokenOverride) {
    String key = "KR".equals(normalizeMarket(market)) ? "top50-kr" : "top50-global";
    return fetchChartByKey(key, clientIdOverride, clientSecretOverride, bearerTokenOverride);
  }



  public SpotifyChartResult fetchChartByKey(

      String chartKey,

      String clientIdOverride,

      String clientSecretOverride,

      String bearerTokenOverride) {

    return fetchChartByKey(chartKey, "charts", clientIdOverride, clientSecretOverride, bearerTokenOverride);

  }



  public SpotifyChartResult fetchChartByKey(

      String chartKey,

      String source,

      String clientIdOverride,

      String clientSecretOverride,

      String bearerTokenOverride) {

    return fetchChartByKey(

        chartKey,
        source,
        clientIdOverride,
        clientSecretOverride,
        bearerTokenOverride,
        null,
        null,
        null,
        null);

  }



  public SpotifyChartResult fetchChartByKey(

      String chartKey,

      String source,

      String clientIdOverride,

      String clientSecretOverride,

      String bearerTokenOverride,

      String chartsUsername,

      String chartsPassword,

      String chartsSpDc,

      String chartsSpKey) {

    if (isOfficialSource(source)) {

      return webApiChartService.fetchChartByKey(

          chartKey, clientIdOverride, clientSecretOverride, bearerTokenOverride);

    }

    SpotifyChartKind kind = SpotifyChartKind.fromKey(chartKey);

    if (bearerTokenOverride == null || bearerTokenOverride.isBlank()) {
      throw new IllegalStateException("spotify_charts_not_configured");
    }
    return fetchChartsComChart(kind, bearerTokenOverride.trim());

  }



  private static boolean isOfficialSource(String source) {

    if (source == null || source.isBlank()) {

      return false;

    }

    String s = source.trim().toLowerCase();

    return "official".equals(s) || "webapi".equals(s);

  }



  /** 기간별 — 일간 1회 / 주간 1회 / 월간=주간합산 / 연간=월간합산 */
  public PeriodChartPageResult fetchPeriodPage(
      String region,
      String kind,
      int year,
      Integer month,
      Integer day,
      int weekOfMonth,
      int offset,
      int limit,
      String bearerToken) {
    if (bearerToken == null || bearerToken.isBlank()) {
      throw new IllegalStateException("spotify_charts_not_configured");
    }
    String chartKind = normalizePeriodKind(kind);
    int safeLimit = clampPeriodLimit(limit);
    int safeOffset = Math.max(0, offset);
    int maxRank = periodMaxRank(chartKind);
    if (safeOffset >= maxRank) {
      return emptySpotifyPeriodPage(
          region, chartKind, year, month, day, safeOffset, safeLimit, maxRank);
    }
    boolean isKr = "kr".equalsIgnoreCase(region);
    int m = month != null ? month : 1;
    int d = day != null ? day : 1;
    int week = Math.max(1, weekOfMonth);
    String market = isKr ? "KR" : "GLOBAL";
    String chartKey = buildPeriodChartKey(isKr, chartKind, year, m, d, week);
    String title = buildPeriodChartTitle(isKr, chartKind, year, m, d, week);

    List<ChartTrackItem> all =
        getOrFetchPeriodChartList(
            chartKey, isKr, chartKind, year, m, d, week, bearerToken.trim(), maxRank);
    int end = Math.min(safeOffset + safeLimit, all.size());
    List<ChartTrackItem> slice = new ArrayList<>();
    if (safeOffset < all.size()) {
      slice.addAll(all.subList(safeOffset, end));
    }
    boolean hasMore =
        end < all.size() && end < maxRank && slice.size() >= safeLimit;

    return new PeriodChartPageResult(
        "spotify",
        chartKey,
        title,
        market,
        Instant.now(),
        List.copyOf(slice),
        safeOffset,
        safeLimit,
        hasMore);
  }

  private PeriodChartPageResult emptySpotifyPeriodPage(
      String region,
      String kind,
      int year,
      Integer month,
      Integer day,
      int offset,
      int limit,
      int maxRank) {
    boolean isKr = "kr".equalsIgnoreCase(region);
    int m = month != null ? month : 1;
    int d = day != null ? day : 1;
    String chartKey = buildPeriodChartKey(isKr, normalizePeriodKind(kind), year, m, d, 1);
    return new PeriodChartPageResult(
        "spotify",
        chartKey,
        chartKey,
        isKr ? "KR" : "GLOBAL",
        Instant.now(),
        List.of(),
        offset,
        limit,
        false);
  }

  private static String normalizePeriodKind(String kind) {
    if (kind == null || kind.isBlank()) {
      return "daily";
    }
    String k = kind.trim().toLowerCase();
    return switch (k) {
      case "yearly", "year" -> "yearly";
      case "weekly", "week" -> "weekly";
      case "daily", "day" -> "daily";
      default -> "monthly";
    };
  }

  private static int periodMaxRank(String kind) {
    return "yearly".equals(kind) ? PERIOD_MAX_TRACKS : SPOTIFY_CHART_SINGLE_MAX;
  }

  private static String buildPeriodChartKey(
      boolean isKr, String kind, int year, int month, int day, int weekOfMonth) {
    String r = isKr ? "kr" : "global";
    return switch (kind) {
      case "yearly" -> "period-" + r + "-yearly-" + year;
      case "monthly" -> "period-" + r + "-monthly-" + year + "-" + String.format("%02d", month);
      case "weekly" -> "period-" + r + "-weekly-" + year + "-" + String.format("%02d", month) + "-w"
          + weekOfMonth;
      case "daily" -> "period-" + r + "-daily-" + year + "-" + String.format("%02d", month) + "-"
          + String.format("%02d", day);
      default -> "period-" + r + "-daily-" + year;
    };
  }

  private static String buildPeriodChartTitle(
      boolean isKr, String kind, int year, int month, int day, int weekOfMonth) {
    String region = isKr ? "한국" : "글로벌";
    String kindLabel =
        switch (kind) {
          case "yearly" -> "연간";
          case "monthly" -> "월간";
          case "weekly" -> "주간";
          case "daily" -> "일간";
          default -> kind;
        };
    return switch (kind) {
      case "yearly" -> region + " · " + year + " · " + kindLabel;
      case "monthly" -> region + " · " + year + "." + month + " · " + kindLabel;
      case "weekly" -> region + " · " + year + "." + month + " " + weekOfMonth + "주 · " + kindLabel;
      default -> region + " · " + year + "." + month + "." + day + " · " + kindLabel;
    };
  }

  private record WeekInMonth(int weekIndex, int fridayDay, String anchor) {}

  private static int clampPeriodLimit(int limit) {
    if (limit <= 0) {
      return PERIOD_PAGE_SIZE_DEFAULT;
    }
    return Math.min(100, limit);
  }

  private static String buildPeriodSlug(boolean isKr, String kind) {
    String r = isKr ? "kr" : "global";
    return switch (kind) {
      case "daily" -> "regional-" + r + "-daily";
      case "weekly" -> "regional-" + r + "-weekly";
      default -> "regional-" + r + "-weekly";
    };
  }

  private static List<WeekInMonth> listWeeksInMonth(int year, int month) {
    LocalDate today = LocalDate.now(ZoneOffset.UTC);
    int m = Math.min(12, Math.max(1, month));
    int lastDay = LocalDate.of(year, m, 1).lengthOfMonth();
    int maxDay =
        year == today.getYear() && m == today.getMonthValue()
            ? Math.min(lastDay, today.getDayOfMonth())
            : lastDay;
    List<WeekInMonth> out = new ArrayList<>();
    int idx = 0;
    for (int d = 1; d <= maxDay; d++) {
      LocalDate date = LocalDate.of(year, m, d);
      if (date.getDayOfWeek() != java.time.DayOfWeek.FRIDAY) {
        continue;
      }
      idx++;
      out.add(new WeekInMonth(idx, d, date.toString()));
    }
    return out;
  }

  private static String weeklyAnchorForWeek(int year, int month, int weekOfMonth) {
    return listWeeksInMonth(year, month).stream()
        .filter(w -> w.weekIndex() == weekOfMonth)
        .map(WeekInMonth::anchor)
        .findFirst()
        .orElse(null);
  }

  private static String weeklySubCacheKey(boolean isKr, int year, int month, int weekOfMonth) {
    return "week-" + (isKr ? "kr" : "global") + "-" + year + "-" + month + "-w" + weekOfMonth;
  }

  private static String monthlySubCacheKey(boolean isKr, int year, int month) {
    return "month-" + (isKr ? "kr" : "global") + "-" + year + "-" + String.format("%02d", month);
  }

  private List<ChartTrackItem> getOrFetchPeriodChartList(
      String cacheKey,
      boolean isKr,
      String kind,
      int year,
      int month,
      int day,
      int weekOfMonth,
      String token,
      int maxRank) {
    CachedPeriodChart hit = periodChartCache.get(cacheKey);
    if (hit != null && hit.alive()) {
      return hit.items();
    }
    List<ChartTrackItem> items =
        switch (kind) {
          case "yearly" -> fetchYearlyFromMonths(isKr, year, token, maxRank);
          case "monthly" -> fetchMonthlyFromWeeks(isKr, year, month, token, maxRank);
          case "weekly" -> fetchWeeklyOnce(isKr, year, month, weekOfMonth, token, maxRank);
          case "daily" -> fetchDailyOnce(isKr, year, month, day, token, maxRank);
          default -> List.of();
        };
    if (!items.isEmpty()) {
      periodChartCache.put(
          cacheKey,
          new CachedPeriodChart(List.copyOf(items), Instant.now().plus(PERIOD_CACHE_TTL)));
    }
    return items;
  }

  private List<ChartTrackItem> fetchDailyOnce(
      boolean isKr, int year, int month, int day, String token, int maxTracks) {
    int m = Math.min(12, Math.max(1, month));
    int d = Math.max(1, day);
    String segment = String.format("%d-%02d-%02d", year, m, d);
    String slug = buildPeriodSlug(isKr, "daily");
    return fetchChartsComOnce(slug, segment, token, maxTracks);
  }

  private List<ChartTrackItem> fetchWeeklyOnce(
      boolean isKr, int year, int month, int weekOfMonth, String token, int maxTracks) {
    String subKey = weeklySubCacheKey(isKr, year, month, weekOfMonth);
    CachedPeriodChart hit = periodChartCache.get(subKey);
    if (hit != null && hit.alive()) {
      return hit.items();
    }
    String anchor = weeklyAnchorForWeek(year, month, weekOfMonth);
    if (anchor == null) {
      return List.of();
    }
    String slug = buildPeriodSlug(isKr, "weekly");
    List<ChartTrackItem> items = fetchChartsComOnce(slug, anchor, token, maxTracks);
    if (!items.isEmpty()) {
      periodChartCache.put(
          subKey,
          new CachedPeriodChart(List.copyOf(items), Instant.now().plus(PERIOD_CACHE_TTL)));
    }
    return items;
  }

  private List<ChartTrackItem> fetchMonthlyFromWeeks(
      boolean isKr, int year, int month, String token, int maxRank) {
    String subKey = monthlySubCacheKey(isKr, year, month);
    CachedPeriodChart hit = periodChartCache.get(subKey);
    if (hit != null && hit.alive()) {
      return hit.items();
    }
    List<WeekInMonth> weeks = listWeeksInMonth(year, month);
    if (weeks.isEmpty()) {
      return List.of();
    }
    Map<String, YearlyTrackAgg> agg = new HashMap<>();
    boolean first = true;
    for (WeekInMonth w : weeks) {
      if (!first) {
        sleepPeriodGap();
      }
      first = false;
      List<ChartTrackItem> weekItems =
          fetchWeeklyOnce(isKr, year, month, w.weekIndex(), token, SPOTIFY_CHART_SINGLE_MAX);
      if (!weekItems.isEmpty()) {
        mergeMonthlyIntoYearly(agg, weekItems);
      }
    }
    if (agg.isEmpty()) {
      return List.of();
    }
    List<ChartTrackItem> items = finalizeStreamAgg(agg, maxRank);
    periodChartCache.put(
        subKey,
        new CachedPeriodChart(List.copyOf(items), Instant.now().plus(PERIOD_CACHE_TTL)));
    return items;
  }

  private List<ChartTrackItem> fetchYearlyFromMonths(
      boolean isKr, int year, String token, int maxRank) {
    Map<String, YearlyTrackAgg> agg = new HashMap<>();
    LocalDate today = LocalDate.now(ZoneOffset.UTC);
    int lastMonth = year == today.getYear() ? today.getMonthValue() : 12;
    boolean first = true;
    for (int mo = 1; mo <= lastMonth; mo++) {
      if (!first) {
        sleepPeriodGap();
      }
      first = false;
      List<ChartTrackItem> monthItems =
          fetchMonthlyFromWeeks(isKr, year, mo, token, SPOTIFY_CHART_SINGLE_MAX);
      if (!monthItems.isEmpty()) {
        mergeMonthlyIntoYearly(agg, monthItems);
      }
    }
    if (agg.isEmpty()) {
      throw new IllegalStateException("spotify_charts_empty");
    }
    return finalizeStreamAgg(agg, maxRank);
  }

  private static List<ChartTrackItem> finalizeStreamAgg(
      Map<String, YearlyTrackAgg> agg, int maxRank) {
    List<YearlyTrackAgg> sorted =
        agg.values().stream()
            .sorted(Comparator.<YearlyTrackAgg>comparingLong(a -> a.streamSum).reversed())
            .limit(maxRank)
            .toList();
    List<ChartTrackItem> out = new ArrayList<>();
    int rank = 1;
    for (YearlyTrackAgg a : sorted) {
      out.add(a.toItem(rank++));
    }
    return out;
  }

  /** slug+segment 단일 호출. 429 즉시 중단. */
  private List<ChartTrackItem> fetchChartsComOnce(
      String slug, String segment, String token, int maxTracks) {
    try {
      JsonNode root = chartsGet(buildChartsUri(slug, segment), token);
      List<ChartTrackItem> items = parseChartEntries(root, maxTracks);
      if (!items.isEmpty()) {
        return items;
      }
    } catch (IllegalStateException e) {
      if ("spotify_charts_rate_limited".equals(e.getMessage())
          || "spotify_charts_auth_failed".equals(e.getMessage())
          || "spotify_not_configured".equals(e.getMessage())) {
        throw e;
      }
    }
    return List.of();
  }

  private String buildChartsUri(String slug, String segment) {
    return UriComponentsBuilder.fromUriString(
            CHARTS_API_BASE + "/auth/v0/charts/" + slug + "/" + segment)
        .build(true)
        .toUriString();
  }

  private static void mergeMonthlyIntoYearly(
      Map<String, YearlyTrackAgg> agg, List<ChartTrackItem> monthItems) {
    for (ChartTrackItem item : monthItems) {
      String key = item.trackId().isBlank() ? item.title() + "|" + item.artists() : item.trackId();
      long streams = Math.max(0, item.popularity());
      agg.compute(
          key,
          (k, prev) -> {
            if (prev == null) {
              return new YearlyTrackAgg(item, streams);
            }
            prev.addStreams(streams);
            return prev;
          });
    }
  }

  private static void sleepPeriodGap() {
    try {
      Thread.sleep(PERIOD_REQUEST_GAP_MS);
    } catch (InterruptedException ie) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("spotify_charts_api_error");
    }
  }

  private static final class YearlyTrackAgg {
    final String trackId;
    final String title;
    final String artists;
    final String album;
    final String imageUrl;
    final String externalUrl;
    final String releaseDate;
    long streamSum;

    YearlyTrackAgg(ChartTrackItem item, long streams) {
      trackId = item.trackId();
      title = item.title();
      artists = item.artists();
      album = item.album();
      imageUrl = item.imageUrl();
      externalUrl = item.externalUrl();
      releaseDate = item.releaseDate();
      streamSum = streams;
    }

    void addStreams(long delta) {
      streamSum += delta;
    }

    ChartTrackItem toItem(int rank) {
      int pop = streamSum > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) streamSum;
      return new ChartTrackItem(
          rank,
          trackId,
          title,
          artists,
          album,
          imageUrl,
          externalUrl,
          0L,
          pop,
          releaseDate);
    }
  }

  private List<ChartTrackItem> fetchChartsComChartEntries(String slug, String date, String token, int maxTracks) {
    IllegalStateException lastFailure = null;
    List<String> dates = new ArrayList<>();
    dates.add(date);
    dates.add("latest");
    LocalDate anchor = LocalDate.parse(date.length() >= 10 ? date.substring(0, 10) : date);
    for (int i = 0; i < DATE_LOOKBACK_DAYS; i++) {
      String d = anchor.minusDays(i).toString();
      if (!dates.contains(d)) {
        dates.add(d);
      }
    }
    for (String tryDate : dates) {
      String uri =
          UriComponentsBuilder.fromUriString(
                  CHARTS_API_BASE + "/auth/v0/charts/" + slug + "/" + tryDate)
              .build(true)
              .toUriString();
      try {
        JsonNode root = chartsGet(uri, token);
        List<ChartTrackItem> items = parseChartEntries(root, maxTracks);
        if (!items.isEmpty()) {
          return items;
        }
      } catch (IllegalStateException e) {
        lastFailure = e;
        if ("spotify_charts_auth_failed".equals(e.getMessage())
            || "spotify_not_configured".equals(e.getMessage())) {
          throw e;
        }
      }
    }
    if (lastFailure != null) {
      throw lastFailure;
    }
    return List.of();
  }

  private SpotifyChartResult fetchChartsComChart(SpotifyChartKind kind, String token) {
    IllegalStateException lastFailure = null;
    for (String date : chartDateCandidates()) {
      String uri =
          UriComponentsBuilder.fromUriString(
                  CHARTS_API_BASE + "/auth/v0/charts/" + kind.chartSlug() + "/" + date)
              .build(true)
              .toUriString();
      try {
        JsonNode root = chartsGet(uri, token);
        List<ChartTrackItem> items = parseChartEntries(root, kind.maxTracks());
        if (!items.isEmpty()) {
          String playlistName =
              root.path("displayChart")
                  .path("chartMetadata")
                  .path("readableTitle")
                  .asText(kind.displayName());
          return new SpotifyChartResult(
              "spotify",
              kind.chartSlug(),
              playlistName,
              kind.market(),
              Instant.now(),
              List.copyOf(items));
        }
      } catch (IllegalStateException e) {
        lastFailure = e;
        if ("spotify_charts_auth_failed".equals(e.getMessage())
            || "spotify_not_configured".equals(e.getMessage())) {
          throw e;
        }
        log.debug("Spotify charts {} @ {} failed: {}", kind.chartSlug(), date, e.getMessage());
      }
    }
    if (lastFailure != null) {
      throw lastFailure;
    }
    throw new IllegalStateException("spotify_charts_empty");
  }



  private List<String> chartDateCandidates() {

    List<String> dates = new ArrayList<>();

    dates.add("latest");

    LocalDate today = LocalDate.now(ZoneOffset.UTC);

    for (int i = 0; i < DATE_LOOKBACK_DAYS; i++) {

      dates.add(today.minusDays(i).toString());

    }

    return dates;

  }



  private List<ChartTrackItem> parseChartEntries(JsonNode root, int maxTracks) {

    JsonNode entries = root.path("entries");

    if (!entries.isArray() || entries.isEmpty()) {

      JsonNode responses = root.path("chartEntryViewResponses");

      if (responses.isArray() && !responses.isEmpty()) {
        for (JsonNode r : responses) {
          JsonNode maybe = r.path("entries");
          if (maybe.isArray() && !maybe.isEmpty()) {
            entries = maybe;
            break;
          }
        }

      }

    }

    List<ChartTrackItem> items = new ArrayList<>();

    if (!entries.isArray()) {

      return items;

    }

    for (JsonNode row : entries) {

      JsonNode meta = row.path("trackMetadata");

      if (meta.isMissingNode() || meta.isNull()) {

        continue;

      }

      int rank = resolveEntryRank(row, items.size() + 1);

      items.add(mapChartsComTrack(row, rank));

      if (items.size() >= maxTracks) {

        break;

      }

    }

    return items;

  }



  private static int resolveEntryRank(JsonNode row, int fallbackRank) {
    JsonNode entryData = row.path("chartEntryData");
    int rank = entryData.path("currentRank").asInt(0);
    if (rank <= 0) {
      rank = row.path("currentRank").asInt(0);
    }
    if (rank <= 0) {
      rank = row.path("current_rank").asInt(0);
    }
  return rank > 0 ? rank : fallbackRank;
  }

  private ChartTrackItem mapChartsComTrack(JsonNode row, int rank) {

    JsonNode meta = row.path("trackMetadata");

    String title = meta.path("trackName").asText("");

    List<String> artistNames = new ArrayList<>();

    for (JsonNode a : meta.path("artists")) {

      String n = a.path("name").asText("");

      if (!n.isBlank()) {

        artistNames.add(n);

      }

    }

    String artists = String.join(", ", artistNames);

    String trackUri = meta.path("trackUri").asText("");

    String trackId = spotifyIdFromUri(trackUri);

    String imageUrl = meta.path("displayImageUri").asText("");

    String releaseDate = meta.path("releaseDate").asText("");

    String externalUrl =

        trackId.isBlank() ? "" : "https://open.spotify.com/track/" + trackId;

    int streams = resolveStreamCount(row);

    return new ChartTrackItem(

        rank,

        trackId,

        title,

        artists,

        "",

        imageUrl,

        externalUrl,

        0L,

        streams,

        releaseDate);

  }

  private static int resolveStreamCount(JsonNode row) {
    JsonNode entryData = row.path("chartEntryData");
    long value = 0;
    String[] keys = {
      "cumulativePlayCount",
      "playCount",
      "streams",
      "streamingCount",
      "streamCount"
    };
    for (String key : keys) {
      value = entryData.path(key).asLong(0);
      if (value > 0) {
        break;
      }
    }
    if (value <= 0) {
      JsonNode streaming = entryData.path("streamingData");
      for (String key : keys) {
        value = streaming.path(key).asLong(0);
        if (value > 0) {
          break;
        }
      }
    }
    if (value <= 0) {
      return 0;
    }
    return value > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) value;
  }

  private static String spotifyIdFromUri(String uri) {

    if (uri == null || uri.isBlank()) {

      return "";

    }

    String t = uri.trim();

    int idx = t.lastIndexOf(':');

    if (idx >= 0 && idx < t.length() - 1) {

      return t.substring(idx + 1);

    }

    return t;

  }



  private String resolveAccessToken(

      String clientIdOverride, String clientSecretOverride, String bearerTokenOverride) {

    if (bearerTokenOverride != null && !bearerTokenOverride.isBlank()) {

      return bearerTokenOverride.trim();

    }

    String clientId = firstNonBlank(clientIdOverride, settings.getSpotifyClientId());

    String clientSecret = firstNonBlank(clientSecretOverride, settings.getSpotifyClientSecret());

    if (!tokenProvider.isConfigured(clientId, clientSecret)) {

      throw new IllegalStateException("spotify_not_configured");

    }

    return tokenProvider.bearerOrThrow(clientId, clientSecret);

  }



  private JsonNode chartsGet(String uri, String token) {

    try {

      String body =

          restClient

              .get()

              .uri(uri)

              .header("Authorization", "Bearer " + token)

              .header("Accept", "application/json")

              .header("Origin", "https://charts.spotify.com")

              .header("Referer", "https://charts.spotify.com/")

              .retrieve()

              .body(String.class);

      if (body == null || body.isBlank()) {

        throw new IllegalStateException("spotify_charts_api_error");

      }

      return objectMapper.readTree(body);

    } catch (RestClientResponseException e) {

      int status = e.getStatusCode().value();

      String resp = e.getResponseBodyAsString();

      log.warn("Spotify charts HTTP {} for {} body={}", status, uri, resp);

      if (status == 429) {
        throw new IllegalStateException("spotify_charts_rate_limited");
      }
      if (status == 403) {
        throw new IllegalStateException("spotify_charts_auth_failed");
      }
      if (status == 401) {
        throw new IllegalStateException("spotify_auth_failed");
      }

      if (status == 404 || status == 400) {

        throw new IllegalStateException("spotify_charts_not_found");

      }

      throw new IllegalStateException("spotify_charts_api_error");

    } catch (IllegalStateException e) {

      throw e;

    } catch (Exception e) {

      log.warn("Spotify charts request failed", e);

      throw new IllegalStateException("spotify_charts_api_error");

    }

  }



  private static String normalizeMarket(String market) {

    if (market == null || market.isBlank()) {

      return "KR";

    }

    return market.trim().toUpperCase();

  }



  private static String firstNonBlank(String override, String fallback) {

    if (override != null && !override.isBlank()) {

      return override.trim();

    }

    return fallback != null ? fallback.trim() : "";

  }

}

