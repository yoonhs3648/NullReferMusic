package com.nullrefer.music.chart;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nullrefer.music.config.NrmSettings;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Spotify 공개 플레이리스트 트랙을 차트로 노출합니다.
 *
 * <p>2024년 이후 Spotify 소유 에디토리얼 플레이리스트는 신규 앱에서 404가 날 수 있습니다. 이 경우
 * {@code NRM_SPOTIFY_CHART_PLAYLIST_ID}에 접근 가능한 <strong>일반 공개 플레이리스트</strong> ID를
 * 지정하세요.
 */
@Service
public class SpotifyChartService {

  private static final Logger log = LoggerFactory.getLogger(SpotifyChartService.class);
  private static final int MAX_TRACKS = 100;

  private final NrmSettings settings;
  private final SpotifyTokenProvider tokenProvider;
  private final ObjectMapper objectMapper;
  private final RestClient restClient = RestClient.create();

  public SpotifyChartService(
      NrmSettings settings, SpotifyTokenProvider tokenProvider, ObjectMapper objectMapper) {
    this.settings = settings;
    this.tokenProvider = tokenProvider;
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
    String playlistId = settings.getSpotifyChartPlaylistId();
    if (playlistId == null || playlistId.isBlank()) {
      throw new IllegalStateException("spotify_playlist_not_configured");
    }

    String m = normalizeMarket(market);
    String token = resolveAccessToken(clientIdOverride, clientSecretOverride, bearerTokenOverride);

    String playlistUri =
        UriComponentsBuilder.fromUriString(
                "https://api.spotify.com/v1/playlists/" + playlistId)
            .queryParam("market", m)
            .queryParam("fields", "name")
            .build(true)
            .toUriString();
    JsonNode playlistMeta = spotifyGet(playlistUri, token);
    String playlistName = playlistMeta.path("name").asText("Spotify Chart");

    List<ChartTrackItem> items = new ArrayList<>();
    int offset = 0;
    while (items.size() < MAX_TRACKS) {
      int limit = Math.min(50, MAX_TRACKS - items.size());
      String tracksUri =
          UriComponentsBuilder.fromUriString(
                  "https://api.spotify.com/v1/playlists/" + playlistId + "/tracks")
              .queryParam("market", m)
              .queryParam("limit", limit)
              .queryParam("offset", offset)
              .queryParam(
                  "fields",
                  "items(track(id,name,duration_ms,external_urls.spotify,artists(name),album(name,images))),next")
              .build(true)
              .toUriString();

      JsonNode page = spotifyGet(tracksUri, token);
      JsonNode trackItems = page.path("items");
      if (!trackItems.isArray() || trackItems.isEmpty()) {
        break;
      }
      for (JsonNode row : trackItems) {
        JsonNode track = row.path("track");
        if (track.isMissingNode() || track.isNull()) {
          continue;
        }
        String trackId = track.path("id").asText("");
        if (trackId.isEmpty()) {
          continue;
        }
        items.add(mapTrack(track, items.size() + 1));
        if (items.size() >= MAX_TRACKS) {
          break;
        }
      }
      if (items.size() >= MAX_TRACKS || page.path("next").isNull() || page.path("next").asText("").isBlank()) {
        break;
      }
      offset += limit;
    }

    return new SpotifyChartResult(
        "spotify", playlistId, playlistName, m, Instant.now(), List.copyOf(items));
  }

  /**
   * 클라이언트가 전달한 Bearer 액세스 토큰이 있으면 그대로 사용하고, 없으면 Client ID·Secret으로
   * Client Credentials 토큰을 발급합니다.
   */
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

  private ChartTrackItem mapTrack(JsonNode track, int rank) {
    String title = track.path("name").asText("");
    List<String> artistNames = new ArrayList<>();
    for (JsonNode a : track.path("artists")) {
      String n = a.path("name").asText("");
      if (!n.isBlank()) {
        artistNames.add(n);
      }
    }
    String artists = String.join(", ", artistNames);
    String album = track.path("album").path("name").asText("");
    String imageUrl = "";
    JsonNode images = track.path("album").path("images");
    if (images.isArray() && !images.isEmpty()) {
      imageUrl = images.get(images.size() - 1).path("url").asText("");
    }
    String externalUrl = track.path("external_urls").path("spotify").asText("");
    long durationMs = track.path("duration_ms").asLong(0);
    return new ChartTrackItem(
        rank,
        track.path("id").asText(""),
        title,
        artists,
        album,
        imageUrl,
        externalUrl,
        durationMs);
  }

  private JsonNode spotifyGet(String uri, String token) {
    try {
      String body =
          restClient
              .get()
              .uri(uri)
              .header("Authorization", "Bearer " + token)
              .retrieve()
              .body(String.class);
      if (body == null || body.isBlank()) {
        throw new IllegalStateException("spotify_api_error");
      }
      JsonNode root = objectMapper.readTree(body);
      if (root.hasNonNull("error")) {
        log.warn("Spotify API error: {}", root.get("error"));
        throw new IllegalStateException("spotify_api_error");
      }
      return root;
    } catch (RestClientResponseException e) {
      int status = e.getStatusCode().value();
      log.warn("Spotify HTTP {} for {}", status, uri);
      if (status == 404) {
        throw new IllegalStateException("spotify_playlist_not_accessible");
      }
      if (status == 401 || status == 403) {
        throw new IllegalStateException("spotify_auth_failed");
      }
      throw new IllegalStateException("spotify_api_error");
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      log.warn("Spotify request failed", e);
      throw new IllegalStateException("spotify_api_error");
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
