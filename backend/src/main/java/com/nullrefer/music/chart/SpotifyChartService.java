package com.nullrefer.music.chart;



import com.fasterxml.jackson.databind.JsonNode;

import com.fasterxml.jackson.databind.ObjectMapper;

import com.nullrefer.music.config.NrmSettings;

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

  private static final int DATE_LOOKBACK_DAYS = 10;



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

        entries = responses.get(0).path("entries");

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

      int rank = row.path("chartEntryData").path("currentRank").asInt(items.size() + 1);

      items.add(mapChartsComTrack(meta, rank));

      if (items.size() >= maxTracks) {

        break;

      }

    }

    return items;

  }



  private ChartTrackItem mapChartsComTrack(JsonNode meta, int rank) {

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

    return new ChartTrackItem(

        rank,

        trackId,

        title,

        artists,

        "",

        imageUrl,

        externalUrl,

        0L,

        0,

        releaseDate);

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

      if (status == 403) {
        throw new IllegalStateException("spotify_charts_auth_failed");
      }
      if (status == 401) {
        throw new IllegalStateException("spotify_auth_failed");
      }

      if (status == 404) {

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

