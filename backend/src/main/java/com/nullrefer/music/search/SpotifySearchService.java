package com.nullrefer.music.search;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nullrefer.music.chart.SpotifyTokenProvider;
import com.nullrefer.music.config.NrmSettings;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyAlbumDetail;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyAlbumInfo;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyAlbumSearchHit;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyAlbumSearchResult;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyAlbumSummary;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyAlbumTrack;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyArtistDetail;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyArtistInfo;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyArtistSearchHit;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyArtistSearchResult;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyAlbumSearchPage;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyArtistSearchPage;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyTrackSearchPage;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyTrackDetail;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyTrackInfo;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyTrackSearchHit;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyTrackSearchResult;
import com.nullrefer.music.search.SpotifySearchDtos.SpotifyTrackSummary;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

/** Spotify Web API(api.spotify.com) 검색 — Charts API는 검색 엔드포인트를 제공하지 않음. */
@Service
public class SpotifySearchService {

  private static final Logger log = LoggerFactory.getLogger(SpotifySearchService.class);
  private static final String SPOTIFY_API = "https://api.spotify.com/v1";
  private static final String DEFAULT_MARKET = "KR";
  private static final int SEARCH_LIMIT = 20;

  private final NrmSettings settings;
  private final SpotifyTokenProvider tokenProvider;
  private final ObjectMapper objectMapper;
  private final RestClient restClient = RestClient.create();

  public SpotifySearchService(
      NrmSettings settings, SpotifyTokenProvider tokenProvider, ObjectMapper objectMapper) {
    this.settings = settings;
    this.tokenProvider = tokenProvider;
    this.objectMapper = objectMapper;
  }

  public SpotifyArtistSearchResult searchArtists(
      String clientIdOverride, String clientSecretOverride, String bearerOverride, String query) {
    return new SpotifyArtistSearchResult(
        searchArtistsPage(clientIdOverride, clientSecretOverride, bearerOverride, query, null)
            .artists());
  }

  public SpotifyArtistSearchPage searchArtistsPage(
      String clientIdOverride,
      String clientSecretOverride,
      String bearerOverride,
      String query,
      String cursor) {
    String q = requireQuery(query);
    int offset = parseOffset(cursor);
    String token = resolveAccessToken(clientIdOverride, clientSecretOverride, bearerOverride);
    JsonNode root = search(token, q, "artist", SEARCH_LIMIT, offset);
    List<SpotifyArtistSearchHit> hits = new ArrayList<>();
    for (JsonNode node : root.path("artists").path("items")) {
      hits.add(
          new SpotifyArtistSearchHit(
              node.path("id").asText(""),
              node.path("name").asText(""),
              pickImage(node.path("images")),
              node.path("external_urls").path("spotify").asText(""),
              node.path("followers").path("total").asLong(0)));
    }
    return new SpotifyArtistSearchPage(hits, nextOffsetCursor(offset, hits.size()));
  }

  public SpotifyArtistDetail fetchArtistDetail(
      String clientIdOverride,
      String clientSecretOverride,
      String bearerOverride,
      String artistId) {
    String id = requireId(artistId);
    String token = resolveAccessToken(clientIdOverride, clientSecretOverride, bearerOverride);
    JsonNode artist = spotifyGet(
        UriComponentsBuilder.fromUriString(SPOTIFY_API + "/artists/" + id).build().encode().toUri(),
        token);
    List<String> genres = new ArrayList<>();
    for (JsonNode g : artist.path("genres")) {
      String name = g.asText("");
      if (!name.isBlank()) {
        genres.add(name);
      }
    }
    SpotifyArtistInfo info =
        new SpotifyArtistInfo(
            artist.path("id").asText(id),
            artist.path("name").asText(""),
            pickImage(artist.path("images")),
            artist.path("external_urls").path("spotify").asText(""),
            artist.path("followers").path("total").asLong(0),
            artist.path("popularity").asInt(0),
            List.copyOf(genres));

    JsonNode topTracksRoot =
        spotifyGet(
            UriComponentsBuilder.fromUriString(SPOTIFY_API + "/artists/" + id + "/top-tracks")
                .queryParam("market", DEFAULT_MARKET)
                .build()
                .encode()
                .toUri(),
            token);
    List<SpotifyTrackSummary> topTracks = new ArrayList<>();
    for (JsonNode track : topTracksRoot.path("tracks")) {
      topTracks.add(mapTrackSummary(track));
    }

    JsonNode albumsRoot =
        spotifyGet(
            UriComponentsBuilder.fromUriString(SPOTIFY_API + "/artists/" + id + "/albums")
                .queryParam("market", DEFAULT_MARKET)
                .queryParam("limit", 12)
                .queryParam("include_groups", "album,single")
                .build()
                .encode()
                .toUri(),
            token);
    List<SpotifyAlbumSummary> albums = new ArrayList<>();
    for (JsonNode album : albumsRoot.path("items")) {
      albums.add(mapAlbumSummary(album));
    }

    return new SpotifyArtistDetail(info, List.copyOf(topTracks), List.copyOf(albums));
  }

  public SpotifyAlbumSearchResult searchAlbums(
      String clientIdOverride, String clientSecretOverride, String bearerOverride, String query) {
    return new SpotifyAlbumSearchResult(
        searchAlbumsPage(clientIdOverride, clientSecretOverride, bearerOverride, query, null)
            .albums());
  }

  public SpotifyAlbumSearchPage searchAlbumsPage(
      String clientIdOverride,
      String clientSecretOverride,
      String bearerOverride,
      String query,
      String cursor) {
    String q = requireQuery(query);
    int offset = parseOffset(cursor);
    String token = resolveAccessToken(clientIdOverride, clientSecretOverride, bearerOverride);
    JsonNode root = search(token, q, "album", SEARCH_LIMIT, offset);
    List<SpotifyAlbumSearchHit> hits = new ArrayList<>();
    for (JsonNode node : root.path("albums").path("items")) {
      hits.add(
          new SpotifyAlbumSearchHit(
              node.path("id").asText(""),
              node.path("name").asText(""),
              joinArtists(node.path("artists")),
              pickImage(node.path("images")),
              node.path("external_urls").path("spotify").asText(""),
              node.path("release_date").asText("")));
    }
    return new SpotifyAlbumSearchPage(hits, nextOffsetCursor(offset, hits.size()));
  }

  public SpotifyAlbumDetail fetchAlbumDetail(
      String clientIdOverride,
      String clientSecretOverride,
      String bearerOverride,
      String albumId) {
    String id = requireId(albumId);
    String token = resolveAccessToken(clientIdOverride, clientSecretOverride, bearerOverride);
    JsonNode album =
        spotifyGet(
            UriComponentsBuilder.fromUriString(SPOTIFY_API + "/albums/" + id)
                .queryParam("market", DEFAULT_MARKET)
                .build()
                .encode()
                .toUri(),
            token);
    SpotifyAlbumInfo info =
        new SpotifyAlbumInfo(
            album.path("id").asText(id),
            album.path("name").asText(""),
            joinArtists(album.path("artists")),
            pickImage(album.path("images")),
            album.path("external_urls").path("spotify").asText(""),
            album.path("release_date").asText(""),
            album.path("total_tracks").asInt(0),
            album.path("label").asText(""));
    List<SpotifyAlbumTrack> tracks = new ArrayList<>();
    for (JsonNode track : album.path("tracks").path("items")) {
      tracks.add(
          new SpotifyAlbumTrack(
              track.path("id").asText(""),
              track.path("name").asText(""),
              track.path("track_number").asInt(0),
              track.path("duration_ms").asInt(0)));
    }
    return new SpotifyAlbumDetail(info, List.copyOf(tracks));
  }

  public SpotifyTrackSearchResult searchTracks(
      String clientIdOverride, String clientSecretOverride, String bearerOverride, String query) {
    return new SpotifyTrackSearchResult(
        searchTracksPage(clientIdOverride, clientSecretOverride, bearerOverride, query, null)
            .tracks());
  }

  public SpotifyTrackSearchPage searchTracksPage(
      String clientIdOverride,
      String clientSecretOverride,
      String bearerOverride,
      String query,
      String cursor) {
    String q = requireQuery(query);
    int offset = parseOffset(cursor);
    String token = resolveAccessToken(clientIdOverride, clientSecretOverride, bearerOverride);
    JsonNode root = search(token, q, "track", SEARCH_LIMIT, offset);
    List<SpotifyTrackSearchHit> hits = new ArrayList<>();
    for (JsonNode node : root.path("tracks").path("items")) {
      hits.add(
          new SpotifyTrackSearchHit(
              node.path("id").asText(""),
              node.path("name").asText(""),
              joinArtists(node.path("artists")),
              pickImage(node.path("album").path("images")),
              node.path("external_urls").path("spotify").asText(""),
              node.path("album").path("name").asText(""),
              node.path("duration_ms").asInt(0)));
    }
    return new SpotifyTrackSearchPage(hits, nextOffsetCursor(offset, hits.size()));
  }

  public SpotifyTrackDetail fetchTrackDetail(
      String clientIdOverride,
      String clientSecretOverride,
      String bearerOverride,
      String trackId) {
    String id = requireId(trackId);
    String token = resolveAccessToken(clientIdOverride, clientSecretOverride, bearerOverride);
    JsonNode track =
        spotifyGet(
            UriComponentsBuilder.fromUriString(SPOTIFY_API + "/tracks/" + id)
                .queryParam("market", DEFAULT_MARKET)
                .build()
                .encode()
                .toUri(),
            token);
    SpotifyTrackInfo info =
        new SpotifyTrackInfo(
            track.path("id").asText(id),
            track.path("name").asText(""),
            joinArtists(track.path("artists")),
            track.path("album").path("name").asText(""),
            pickImage(track.path("album").path("images")),
            track.path("external_urls").path("spotify").asText(""),
            track.path("duration_ms").asInt(0),
            track.path("popularity").asInt(0),
            track.path("preview_url").asText(""));
    return new SpotifyTrackDetail(info);
  }

  private JsonNode search(String token, String query, String type) {
    return search(token, query, type, SEARCH_LIMIT, 0);
  }

  private JsonNode search(String token, String query, String type, int limit, int offset) {
    URI uri =
        UriComponentsBuilder.fromUriString(SPOTIFY_API + "/search")
            .queryParam("q", query)
            .queryParam("type", type)
            .queryParam("limit", limit)
            .queryParam("offset", offset)
            .queryParam("market", DEFAULT_MARKET)
            .build()
            .encode()
            .toUri();
    return spotifyGet(uri, token);
  }

  private static int parseOffset(String cursor) {
    if (cursor == null || cursor.isBlank()) {
      return 0;
    }
    try {
      int offset = Integer.parseInt(cursor.trim());
      return Math.max(0, offset);
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  private static String nextOffsetCursor(int offset, int itemCount) {
    if (itemCount < SEARCH_LIMIT) {
      return null;
    }
    return String.valueOf(offset + itemCount);
  }

  private SpotifyTrackSummary mapTrackSummary(JsonNode track) {
    return new SpotifyTrackSummary(
        track.path("id").asText(""),
        track.path("name").asText(""),
        joinArtists(track.path("artists")),
        pickImage(track.path("album").path("images")),
        track.path("external_urls").path("spotify").asText(""),
        track.path("duration_ms").asInt(0),
        track.path("popularity").asInt(0));
  }

  private SpotifyAlbumSummary mapAlbumSummary(JsonNode album) {
    return new SpotifyAlbumSummary(
        album.path("id").asText(""),
        album.path("name").asText(""),
        joinArtists(album.path("artists")),
        pickImage(album.path("images")),
        album.path("external_urls").path("spotify").asText(""),
        album.path("release_date").asText(""));
  }

  private static String joinArtists(JsonNode artists) {
    List<String> names = new ArrayList<>();
    if (artists.isArray()) {
      for (JsonNode a : artists) {
        String n = a.path("name").asText("");
        if (!n.isBlank()) {
          names.add(n);
        }
      }
    }
    return String.join(", ", names);
  }

  private static String pickImage(JsonNode images) {
    if (!images.isArray() || images.isEmpty()) {
      return "";
    }
    return images.get(0).path("url").asText("");
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

  private JsonNode spotifyGet(URI uri, String token) {
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
        log.warn("Spotify search API error: {}", root.get("error"));
        throw new IllegalStateException("spotify_api_error");
      }
      return root;
    } catch (RestClientResponseException e) {
      int status = e.getStatusCode().value();
      log.warn("Spotify search HTTP {} for {}", status, uri);
      if (status == 401) {
        throw new IllegalStateException("spotify_auth_failed");
      }
      if (status == 403) {
        throw new IllegalStateException("spotify_premium_required");
      }
      throw new IllegalStateException("spotify_api_error");
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      log.warn("Spotify search request failed", e);
      throw new IllegalStateException("spotify_api_error");
    }
  }

  private static String requireQuery(String query) {
    if (query == null || query.isBlank()) {
      throw new IllegalStateException("spotify_search_query_required");
    }
    return query.trim();
  }

  private static String requireId(String id) {
    if (id == null || id.isBlank()) {
      throw new IllegalStateException("spotify_search_id_required");
    }
    return id.trim();
  }

  private static String firstNonBlank(String override, String fallback) {
    if (override != null && !override.isBlank()) {
      return override.trim();
    }
    return fallback != null ? fallback.trim() : "";
  }
}
