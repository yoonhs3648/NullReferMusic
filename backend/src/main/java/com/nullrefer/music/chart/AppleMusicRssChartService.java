package com.nullrefer.music.chart;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** Apple Music 공개 RSS(JSON) — API 키 불필요. */
@Service
public class AppleMusicRssChartService {

  private static final Logger log = LoggerFactory.getLogger(AppleMusicRssChartService.class);

  private final ObjectMapper objectMapper;
  private final RestClient restClient = RestClient.create();

  public AppleMusicRssChartService(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public SpotifyChartResult fetchChartByKey(String chartKey) {
    AppleMusicChartKind kind = AppleMusicChartKind.fromKey(chartKey);
    JsonNode root = rssGet(kind.feedUrl());
    JsonNode results = root.path("feed").path("results");
    if (!results.isArray() || results.isEmpty()) {
      throw new IllegalStateException("apple_music_charts_empty");
    }
    String feedTitle = root.path("feed").path("title").asText(kind.displayName());
    List<ChartTrackItem> items = new ArrayList<>();
    int rank = 1;
    for (JsonNode row : results) {
      items.add(mapSong(row, rank));
      rank++;
      if (items.size() >= kind.maxTracks()) {
        break;
      }
    }
    if (items.isEmpty()) {
      throw new IllegalStateException("apple_music_charts_empty");
    }
    return new SpotifyChartResult(
        "appleMusic",
        kind.storefront(),
        feedTitle,
        kind.market(),
        Instant.now(),
        List.copyOf(items));
  }

  private ChartTrackItem mapSong(JsonNode row, int rank) {
    String title = row.path("name").asText("");
    String artists = row.path("artistName").asText("");
    String trackId = row.path("id").asText("");
    String imageUrl = row.path("artworkUrl100").asText("");
    String externalUrl = row.path("url").asText("");
    String releaseDate = row.path("releaseDate").asText("");
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

  private JsonNode rssGet(String uri) {
    try {
      String body =
          restClient
              .get()
              .uri(uri)
              .header("Accept", "application/json")
              .retrieve()
              .body(String.class);
      if (body == null || body.isBlank()) {
        throw new IllegalStateException("apple_music_api_error");
      }
      return objectMapper.readTree(body);
    } catch (RestClientResponseException e) {
      int status = e.getStatusCode().value();
      log.warn("Apple Music RSS HTTP {} for {} body={}", status, uri, e.getResponseBodyAsString());
      if (status == 403 || status == 401) {
        throw new IllegalStateException("apple_music_forbidden");
      }
      if (status == 404) {
        throw new IllegalStateException("apple_music_charts_not_found");
      }
      throw new IllegalStateException("apple_music_api_error");
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      log.warn("Apple Music RSS request failed", e);
      throw new IllegalStateException("apple_music_api_error");
    }
  }
}
