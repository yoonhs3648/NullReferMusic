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



/** Last.fm API로 국가·글로벌 Top 50 트랙 차트를 조회합니다. */

@Service

public class LastfmChartService {



  private static final Logger log = LoggerFactory.getLogger(LastfmChartService.class);

  private static final String LASTFM_API = "https://ws.audioscrobbler.com/2.0/";



  private final NrmSettings settings;

  private final ObjectMapper objectMapper;

  private final RestClient restClient = RestClient.create();



  public LastfmChartService(NrmSettings settings, ObjectMapper objectMapper) {

    this.settings = settings;

    this.objectMapper = objectMapper;

  }



  public void validateApiKey(String apiKeyOverride) {

    String apiKey = resolveApiKey(apiKeyOverride, null);

    fetchTracks(LastfmChartKind.TOP50_GLOBAL, apiKey);

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



  private List<ChartTrackItem> fetchTracks(LastfmChartKind kind, String apiKey) {

    UriComponentsBuilder builder =

        UriComponentsBuilder.fromUriString(LASTFM_API)

            .queryParam("api_key", apiKey)

            .queryParam("format", "json")

            .queryParam("limit", kind.maxTracks());

    if ("geo".equals(kind.method())) {

      builder

          .queryParam("method", "geo.gettoptracks")

          .queryParam("country", kind.country());

    } else {

      builder.queryParam("method", "chart.gettoptracks");

    }

    JsonNode root = lastfmGet(builder.build(true).toUriString());

    JsonNode trackNode = root.path("tracks").path("track");

    List<ChartTrackItem> items = new ArrayList<>();

    if (trackNode.isArray()) {

      for (JsonNode track : trackNode) {

        items.add(mapLastfmTrack(track, items.size() + 1));

        if (items.size() >= kind.maxTracks()) {

          break;

        }

      }

    } else if (trackNode.isObject()) {

      items.add(mapLastfmTrack(trackNode, 1));

    }

    if (items.isEmpty()) {

      throw new IllegalStateException("lastfm_charts_empty");

    }

    return items;

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

        track.path("playcount").asInt(0),

        "");

  }



  private static String pickImage(JsonNode images) {

    if (!images.isArray()) {

      return "";

    }

    String large = "";

    String medium = "";

    for (JsonNode img : images) {

      String url = img.path("#text").asText("");

      if (url.isBlank()) {

        url = img.asText("");

      }

      String size = img.path("size").asText("");

      if ("extralarge".equals(size) || "large".equals(size)) {

        large = url;

      } else if ("medium".equals(size)) {

        medium = url;

      }

    }

    return !large.isBlank() ? large : medium;

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



  private JsonNode lastfmGet(String uri) {

    try {

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

