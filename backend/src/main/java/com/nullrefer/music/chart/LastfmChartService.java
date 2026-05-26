package com.nullrefer.music.chart;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nullrefer.music.config.NrmSettings;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

/** Last.fm API로 국가·글로벌 Top 100 트랙 차트를 조회합니다. */
@Service
public class LastfmChartService {

  private static final Logger log = LoggerFactory.getLogger(LastfmChartService.class);
  private static final String LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
  /** Last.fm geo/chart API — limit=100 (공식 예: geo.getTopTracks&country=South+Korea&limit=100) */
  private static final int LASTFM_PAGE_SIZE = 100;
  private static final int PERIOD_MAX_TRACKS = 1000;
  private static final int PERIOD_PAGE_SIZE_DEFAULT = 50;

  private final NrmSettings settings;
  private final ObjectMapper objectMapper;
  private final RestClient restClient = RestClient.create();

  public LastfmChartService(NrmSettings settings, ObjectMapper objectMapper) {
    this.settings = settings;
    this.objectMapper = objectMapper;
  }

  public void validateApiKey(String apiKeyOverride) {
    String apiKey = resolveApiKey(apiKeyOverride, null);
    fetchTracks(LastfmChartKind.TOP100_GLOBAL, apiKey);
  }

  public SpotifyChartResult fetchChartByKey(String chartKey, String apiKeyOverride) {
    LastfmChartKind kind = LastfmChartKind.fromKey(chartKey);
    String apiKey = resolveApiKey(apiKeyOverride, null);
    List<ChartTrackItem> items = fetchTracks(kind, apiKey);
    return new SpotifyChartResult(
        "lastfm",
        kind.key(),
        kind.displayName(),
        kind.market(),
        Instant.now(),
        List.copyOf(items));
  }

  /** 기간별 차트 — 페이지 단위(최대 1000곡) */
  public PeriodChartPageResult fetchPeriodPage(
      String region,
      String granularity,
      int year,
      Integer month,
      int offset,
      int limit,
      String apiKeyOverride) {
    String apiKey = resolveApiKey(apiKeyOverride, null);
    int safeLimit = clampPeriodLimit(limit);
    int safeOffset = Math.max(0, offset);
    if (safeOffset >= PERIOD_MAX_TRACKS) {
      return emptyPeriodPage(region, granularity, year, month, safeOffset, safeLimit);
    }
    boolean isKr = "kr".equalsIgnoreCase(region);
    boolean isMonth = "month".equalsIgnoreCase(granularity);
    int m = month != null ? month : 1;
    long[] range = periodUnixRange(year, isMonth, m);
    String market = isKr ? "KR" : "GLOBAL";
    String chartKey =
        "period-"
            + (isKr ? "kr" : "global")
            + "-"
            + (isMonth ? "month" : "year")
            + "-"
            + year
            + (isMonth ? "-" + String.format("%02d", m) : "");
    String title =
        (isKr ? "한국" : "글로벌")
            + " · "
            + year
            + (isMonth ? "." + m : "")
            + (isMonth ? " (월)" : " (연)");

    int page = safeOffset / safeLimit + 1;
    URI uri = buildChartPeriodUri(apiKey, page, safeLimit, range[0], range[1]);
    JsonNode root = lastfmGet(uri);
    List<ChartTrackItem> pageItems = new ArrayList<>();
    appendTracksFromPage(root, pageItems, safeLimit);
    for (int i = 0; i < pageItems.size(); i++) {
      ChartTrackItem row = pageItems.get(i);
      pageItems.set(
          i,
          new ChartTrackItem(
              safeOffset + i + 1,
              row.trackId(),
              row.title(),
              row.artists(),
              row.album(),
              row.imageUrl(),
              row.externalUrl(),
              row.durationMs(),
              row.popularity(),
              row.releaseDate()));
    }
    int totalPages = root.path("tracks").path("@attr").path("totalPages").asInt(1);
    int totalAvailable = Math.min(totalPages * safeLimit, PERIOD_MAX_TRACKS);
    boolean hasMore =
        !pageItems.isEmpty()
            && pageItems.size() >= safeLimit
            && safeOffset + pageItems.size() < totalAvailable
            && safeOffset + pageItems.size() < PERIOD_MAX_TRACKS;

    return new PeriodChartPageResult(
        "lastfm",
        chartKey,
        title,
        market,
        Instant.now(),
        List.copyOf(pageItems),
        safeOffset,
        safeLimit,
        hasMore);
  }

  private PeriodChartPageResult emptyPeriodPage(
      String region,
      String granularity,
      int year,
      Integer month,
      int offset,
      int limit) {
    boolean isKr = "kr".equalsIgnoreCase(region);
    boolean isMonth = "month".equalsIgnoreCase(granularity);
    int m = month != null ? month : 1;
    String chartKey =
        "period-"
            + (isKr ? "kr" : "global")
            + "-"
            + (isMonth ? "month" : "year")
            + "-"
            + year
            + (isMonth ? "-" + String.format("%02d", m) : "");
    return new PeriodChartPageResult(
        "lastfm",
        chartKey,
        chartKey,
        isKr ? "KR" : "GLOBAL",
        Instant.now(),
        List.of(),
        offset,
        limit,
        false);
  }

  private static int clampPeriodLimit(int limit) {
    if (limit <= 0) {
      return PERIOD_PAGE_SIZE_DEFAULT;
    }
    return Math.min(100, limit);
  }

  private static long[] periodUnixRange(int year, boolean month, int monthNum) {
    if (month) {
      int m = Math.min(12, Math.max(1, monthNum));
      LocalDate start = LocalDate.of(year, m, 1);
      LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
      return new long[] {
        start.atStartOfDay(ZoneOffset.UTC).toEpochSecond(),
        end.atTime(23, 59, 59).toEpochSecond(ZoneOffset.UTC)
      };
    }
    LocalDate start = LocalDate.of(year, 1, 1);
    LocalDate end = LocalDate.of(year, 12, 31);
    return new long[] {
      start.atStartOfDay(ZoneOffset.UTC).toEpochSecond(),
      end.atTime(23, 59, 59).toEpochSecond(ZoneOffset.UTC)
    };
  }

  private URI buildChartPeriodUri(String apiKey, int page, int limit, long from, long to) {
    return UriComponentsBuilder.fromUriString(LASTFM_API)
        .queryParam("method", "chart.gettoptracks")
        .queryParam("api_key", apiKey)
        .queryParam("format", "json")
        .queryParam("limit", limit)
        .queryParam("page", page)
        .queryParam("from", from)
        .queryParam("to", to)
        .build()
        .encode()
        .toUri();
  }

  private URI buildGeoUri(String apiKey, int page, int limit) {
    return UriComponentsBuilder.fromUriString(LASTFM_API)
        .queryParam("method", "geo.getTopTracks")
        .queryParam("api_key", apiKey)
        .queryParam("format", "json")
        .queryParam("country", "Korea, Republic of")
        .queryParam("limit", limit)
        .queryParam("page", page)
        .build()
        .encode()
        .toUri();
  }

  private List<ChartTrackItem> fetchTracks(LastfmChartKind kind, String apiKey) {
    List<ChartTrackItem> items = new ArrayList<>();
    int pagesNeeded = (int) Math.ceil((double) kind.maxTracks() / LASTFM_PAGE_SIZE);

    for (int page = 1; page <= pagesNeeded && items.size() < kind.maxTracks(); page++) {
      int limit = Math.min(LASTFM_PAGE_SIZE, kind.maxTracks() - items.size());
      JsonNode root = lastfmGet(buildChartUri(kind, apiKey, page, limit));
      appendTracksFromPage(root, items, kind);
      JsonNode trackNode = root.path("tracks").path("track");
      if (!trackNode.isArray() && !trackNode.isObject()) {
        break;
      }
      int totalPages = root.path("tracks").path("@attr").path("totalPages").asInt(1);
      if (page >= totalPages) {
        break;
      }
    }

    if (items.isEmpty()) {
      throw new IllegalStateException("lastfm_charts_empty");
    }
    return items;
  }

  private URI buildChartUri(LastfmChartKind kind, String apiKey, int page, int limit) {
    UriComponentsBuilder builder =
        UriComponentsBuilder.fromUriString(LASTFM_API)
            .queryParam("api_key", apiKey)
            .queryParam("format", "json")
            .queryParam("limit", limit)
            .queryParam("page", page);
    if ("geo".equals(kind.method())) {
      builder
          .queryParam("method", "geo.getTopTracks")
          .queryParam("country", kind.country());
    } else {
      builder.queryParam("method", "chart.gettoptracks");
    }
    return builder.build().encode().toUri();
  }

  private void appendTracksFromPage(JsonNode root, List<ChartTrackItem> items, LastfmChartKind kind) {
    appendTracksFromPage(root, items, kind.maxTracks());
  }

  private void appendTracksFromPage(JsonNode root, List<ChartTrackItem> items, int maxItems) {
    JsonNode trackNode = root.path("tracks").path("track");
    if (trackNode.isArray()) {
      for (JsonNode track : trackNode) {
        items.add(mapLastfmTrack(track, items.size() + 1));
        if (items.size() >= maxItems) {
          return;
        }
      }
    } else if (trackNode.isObject() && !trackNode.isEmpty()) {
      items.add(mapLastfmTrack(trackNode, items.size() + 1));
    }
  }

  private ChartTrackItem mapLastfmTrack(JsonNode track, int fallbackRank) {
    int rank = track.path("@attr").path("rank").asInt(0);
    if (rank <= 0) {
      rank = track.path("rank").asInt(0);
    }
    if (rank <= 0) {
      rank = fallbackRank;
    }
    String title = track.path("name").asText("");
    String artists = track.path("artist").path("name").asText("");
    if (artists.isBlank() && track.path("artist").isTextual()) {
      artists = track.path("artist").asText("");
    }
    String imageUrl = pickImage(track.path("image"));
    String externalUrl = track.path("url").asText("");
    String trackId = track.path("mbid").asText("");
    if (trackId.isBlank()) {
      trackId = externalUrl;
    }
    return new ChartTrackItem(
        rank > 0 ? rank : 0,
        trackId,
        title,
        artists,
        "",
        imageUrl,
        externalUrl,
        0L,
        0,
        "");
  }

  private static String pickImage(JsonNode images) {
    if (!images.isArray()) {
      return "";
    }
    String[] priority = {"mega", "extralarge", "large", "medium", "small", ""};
    for (String size : priority) {
      for (JsonNode img : images) {
        String url = img.path("#text").asText("");
        if (url.isBlank()) {
          url = img.asText("");
        }
        if (url.isBlank() || url.contains("2a96cbd8b46e442fc41c2b86b821562f")) {
          continue;
        }
        String imgSize = img.path("size").asText("");
        if (imgSize.equals(size) || (size.isEmpty() && !imgSize.isEmpty())) {
          return url;
        }
      }
    }
    return "";
  }

  private String resolveApiKey(String apiKeyOverride, String bearerTokenOverride) {
    if (bearerTokenOverride != null && !bearerTokenOverride.isBlank()) {
      return bearerTokenOverride.trim();
    }
    if (apiKeyOverride != null && !apiKeyOverride.isBlank()) {
      return apiKeyOverride.trim();
    }
    String fromSettings = settings.getLastfmApiKey();
    if (fromSettings != null && !fromSettings.isBlank()) {
      return fromSettings.trim();
    }
    throw new IllegalStateException("lastfm_not_configured");
  }

  public String resolveApiKeyForRequest(String apiKeyHeader, String bearerToken) {
    return resolveApiKey(apiKeyHeader, bearerToken);
  }

  private JsonNode lastfmGet(URI uri) {
    try {
      // String URI는 RestClient가 %를 다시 인코딩해 country=Korea%252C... 로 깨질 수 있음
      String body = restClient.get().uri(uri).retrieve().body(String.class);
      if (body == null || body.isBlank()) {
        throw new IllegalStateException("lastfm_api_error");
      }
      JsonNode root = objectMapper.readTree(body);
      if (root.has("error")) {
        int code = root.path("error").asInt(0);
        log.warn("Last.fm API error {} message={}", code, root.path("message").asText(""));
        if (code == 10 || code == 4 || code == 26) {
          throw new IllegalStateException("lastfm_auth_failed");
        }
        if (code == 6) {
          String msg = root.path("message").asText("").toLowerCase();
          if (msg.contains("country")) {
            throw new IllegalStateException("lastfm_country_invalid");
          }
          throw new IllegalStateException("lastfm_api_error");
        }
        if (code == 7) {
          throw new IllegalStateException("lastfm_api_error");
        }
        throw new IllegalStateException("lastfm_api_error");
      }
      return root;
    } catch (RestClientResponseException e) {
      log.warn("Last.fm HTTP {} body={}", e.getStatusCode().value(), e.getResponseBodyAsString());
      throw new IllegalStateException("lastfm_api_error");
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      log.warn("Last.fm request failed", e);
      throw new IllegalStateException("lastfm_api_error");
    }
  }
}
