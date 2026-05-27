package com.nullrefer.music.search;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nullrefer.music.chart.LastfmChartService;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmAlbumDetailResult;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmAlbumInfoDto;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmAlbumSearchHit;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmAlbumSearchResult;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmAlbumSummaryDto;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmAlbumTrackDto;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmArtistDetailResult;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmArtistInfoDto;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmArtistSearchHit;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmArtistSearchResult;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmSimilarArtistDto;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmTagDto;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmTrackDetailResult;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmTrackInfoDto;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmTrackSearchHit;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmTrackSearchResult;
import com.nullrefer.music.search.LastfmSearchDtos.LastfmTrackSummaryDto;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class LastfmSearchService {

  private static final Logger log = LoggerFactory.getLogger(LastfmSearchService.class);
  private static final String LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

  private final LastfmChartService lastfmChartService;
  private final ObjectMapper objectMapper;
  private final RestClient restClient = RestClient.create();

  public LastfmSearchService(LastfmChartService lastfmChartService, ObjectMapper objectMapper) {
    this.lastfmChartService = lastfmChartService;
    this.objectMapper = objectMapper;
  }

  public LastfmArtistSearchResult searchArtists(String apiKey, String query) {
    String q = requireQuery(query);
    JsonNode root =
        lastfmGet(
            baseBuilder(apiKey)
                .queryParam("method", "artist.search")
                .queryParam("artist", q)
                .queryParam("limit", 20));
    List<LastfmArtistSearchHit> hits = new ArrayList<>();
    for (JsonNode node : arrayOrSingle(root.path("results").path("artistmatches").path("artist"))) {
      hits.add(
          new LastfmArtistSearchHit(
              node.path("name").asText(""),
              node.path("mbid").asText(""),
              node.path("url").asText(""),
              pickImage(node.path("image")),
              parseLong(node.path("listeners").asText("0"))));
    }
    return new LastfmArtistSearchResult(List.copyOf(hits));
  }

  public LastfmArtistDetailResult fetchArtistDetail(
      String apiKey, String name, String mbid) {
    String artistName = requireName(name);
    UriComponentsBuilder infoBuilder =
        baseBuilder(apiKey).queryParam("method", "artist.getInfo").queryParam("artist", artistName);
    if (mbid != null && !mbid.isBlank()) {
      infoBuilder.queryParam("mbid", mbid.trim());
    }
    JsonNode infoRoot = lastfmGet(infoBuilder);
    JsonNode artist = infoRoot.path("artist");

    JsonNode similarRoot =
        lastfmGet(
            baseBuilder(apiKey)
                .queryParam("method", "artist.getSimilar")
                .queryParam("artist", artistName)
                .queryParam("limit", 12));
    JsonNode topTracksRoot =
        lastfmGet(
            baseBuilder(apiKey)
                .queryParam("method", "artist.getTopTracks")
                .queryParam("artist", artistName)
                .queryParam("limit", 10));
    JsonNode topAlbumsRoot =
        lastfmGet(
            baseBuilder(apiKey)
                .queryParam("method", "artist.getTopAlbums")
                .queryParam("artist", artistName)
                .queryParam("limit", 10));
    JsonNode tagsRoot =
        lastfmGet(
            baseBuilder(apiKey)
                .queryParam("method", "artist.getTopTags")
                .queryParam("artist", artistName)
                .queryParam("limit", 15));

    String bio = artist.path("bio").path("summary").asText("");
    if (bio.isBlank()) {
      bio = artist.path("bio").path("content").asText("");
    }
    bio = stripHtml(bio);

    LastfmArtistInfoDto info =
        new LastfmArtistInfoDto(
            artist.path("name").asText(artistName),
            artist.path("mbid").asText(""),
            artist.path("url").asText(""),
            pickImage(artist.path("image")),
            bio,
            parseLong(artist.path("stats").path("listeners").asText("0")),
            parseLong(artist.path("stats").path("playcount").asText("0")),
            "1".equals(artist.path("ontour").asText("0")));

    List<LastfmSimilarArtistDto> similar = new ArrayList<>();
    for (JsonNode node :
        arrayOrSingle(similarRoot.path("similarartists").path("artist"))) {
      similar.add(
          new LastfmSimilarArtistDto(
              node.path("name").asText(""),
              node.path("url").asText(""),
              pickImage(node.path("image"))));
    }

    List<LastfmTrackSummaryDto> topTracks = new ArrayList<>();
    int trackRank = 1;
    for (JsonNode node : arrayOrSingle(topTracksRoot.path("toptracks").path("track"))) {
      topTracks.add(mapTrackSummary(node, trackRank++));
    }

    List<LastfmAlbumSummaryDto> topAlbums = new ArrayList<>();
    for (JsonNode node : arrayOrSingle(topAlbumsRoot.path("topalbums").path("album"))) {
      topAlbums.add(
          new LastfmAlbumSummaryDto(
              node.path("name").asText(""),
              node.path("artist").path("name").asText(""),
              node.path("url").asText(""),
              pickImage(node.path("image")),
              parseLong(node.path("playcount").asText("0"))));
    }

    List<LastfmTagDto> tags = mapTags(tagsRoot.path("toptags").path("tag"));

    return new LastfmArtistDetailResult(
        info, List.copyOf(similar), List.copyOf(topTracks), List.copyOf(topAlbums), tags);
  }

  public LastfmAlbumSearchResult searchAlbums(String apiKey, String query) {
    String q = requireQuery(query);
    JsonNode root =
        lastfmGet(
            baseBuilder(apiKey)
                .queryParam("method", "album.search")
                .queryParam("album", q)
                .queryParam("limit", 20));
    List<LastfmAlbumSearchHit> hits = new ArrayList<>();
    for (JsonNode node : arrayOrSingle(root.path("results").path("albummatches").path("album"))) {
      hits.add(
          new LastfmAlbumSearchHit(
              node.path("name").asText(""),
              node.path("artist").asText(""),
              node.path("mbid").asText(""),
              node.path("url").asText(""),
              pickImage(node.path("image"))));
    }
    return new LastfmAlbumSearchResult(List.copyOf(hits));
  }

  public LastfmAlbumDetailResult fetchAlbumDetail(String apiKey, String artist, String album) {
    String artistName = requireName(artist);
    String albumName = requireName(album);
    JsonNode root =
        lastfmGet(
            baseBuilder(apiKey)
                .queryParam("method", "album.getInfo")
                .queryParam("artist", artistName)
                .queryParam("album", albumName));
    JsonNode albumNode = root.path("album");
    String wiki = albumNode.path("wiki").path("summary").asText("");
    if (wiki.isBlank()) {
      wiki = albumNode.path("wiki").path("content").asText("");
    }
    wiki = stripHtml(wiki);

    List<LastfmAlbumTrackDto> tracks = new ArrayList<>();
    int rank = 1;
    for (JsonNode track : arrayOrSingle(albumNode.path("tracks").path("track"))) {
      tracks.add(
          new LastfmAlbumTrackDto(
              track.path("name").asText(""),
              track.path("mbid").asText(""),
              track.path("@attr").path("rank").asInt(rank),
              track.path("duration").asInt(0)));
      rank++;
    }

    LastfmAlbumInfoDto info =
        new LastfmAlbumInfoDto(
            albumNode.path("name").asText(albumName),
            albumNode.path("artist").asText(artistName),
            albumNode.path("mbid").asText(""),
            albumNode.path("url").asText(""),
            pickImage(albumNode.path("image")),
            parseLong(albumNode.path("listeners").asText("0")),
            parseLong(albumNode.path("playcount").asText("0")),
            albumNode.path("releasedate").asText(""),
            wiki,
            List.copyOf(tracks));

    List<LastfmTagDto> tags = mapTags(albumNode.path("tags").path("tag"));
    return new LastfmAlbumDetailResult(info, tags);
  }

  public LastfmTrackSearchResult searchTracks(String apiKey, String query) {
    String q = requireQuery(query);
    JsonNode root =
        lastfmGet(
            baseBuilder(apiKey)
                .queryParam("method", "track.search")
                .queryParam("track", q)
                .queryParam("limit", 20));
    List<LastfmTrackSearchHit> hits = new ArrayList<>();
    for (JsonNode node : arrayOrSingle(root.path("results").path("trackmatches").path("track"))) {
      hits.add(
          new LastfmTrackSearchHit(
              node.path("name").asText(""),
              node.path("artist").asText(""),
              node.path("mbid").asText(""),
              node.path("url").asText(""),
              pickImage(node.path("image"))));
    }
    return new LastfmTrackSearchResult(List.copyOf(hits));
  }

  public LastfmTrackDetailResult fetchTrackDetail(
      String apiKey, String artist, String track, String trackMbid) {
    String artistName = requireName(artist);
    String trackName = requireName(track);
    UriComponentsBuilder infoBuilder =
        baseBuilder(apiKey).queryParam("method", "track.getInfo");
    if (trackMbid != null && !trackMbid.isBlank()) {
      infoBuilder.queryParam("mbid", trackMbid.trim());
    } else {
      infoBuilder.queryParam("artist", artistName).queryParam("track", trackName);
    }
    JsonNode infoRoot = lastfmGet(infoBuilder);
    JsonNode trackNode = infoRoot.path("track");
    String resolvedArtist = trackNode.path("artist").path("name").asText(artistName);
    String resolvedTrack = trackNode.path("name").asText(trackName);

    JsonNode similarRoot =
        lastfmGet(
            baseBuilder(apiKey)
                .queryParam("method", "track.getSimilar")
                .queryParam("artist", resolvedArtist)
                .queryParam("track", resolvedTrack)
                .queryParam("limit", 12));
    JsonNode tagsRoot =
        lastfmGet(
            baseBuilder(apiKey)
                .queryParam("method", "track.getTopTags")
                .queryParam("artist", resolvedArtist)
                .queryParam("track", resolvedTrack)
                .queryParam("limit", 15));

    JsonNode albumNode = trackNode.path("album");
    LastfmTrackInfoDto info =
        new LastfmTrackInfoDto(
            trackNode.path("name").asText(trackName),
            resolvedArtist,
            trackNode.path("mbid").asText(""),
            albumNode.path("title").asText(""),
            albumNode.path("mbid").asText(""),
            trackNode.path("artist").path("mbid").asText(""),
            trackNode.path("url").asText(""),
            pickImage(albumNode.path("image")),
            trackNode.path("duration").asInt(0),
            parseLong(trackNode.path("playcount").asText("0")),
            parseLong(trackNode.path("listeners").asText("0")),
            albumNode.path("@attr").path("position").asText(""));

    List<LastfmTrackSummaryDto> similar = new ArrayList<>();
    int rank = 1;
    for (JsonNode node : arrayOrSingle(similarRoot.path("similartracks").path("track"))) {
      similar.add(mapTrackSummary(node, rank++));
    }

    List<LastfmTagDto> tags = mapTags(tagsRoot.path("toptags").path("tag"));
    return new LastfmTrackDetailResult(info, List.copyOf(similar), tags);
  }

  public String resolveApiKeyForRequest(String apiKeyHeader, String bearerToken) {
    return lastfmChartService.resolveApiKeyForRequest(apiKeyHeader, bearerToken);
  }

  private LastfmTrackSummaryDto mapTrackSummary(JsonNode node, int fallbackRank) {
    int rank = node.path("@attr").path("rank").asInt(0);
    if (rank <= 0) {
      rank = fallbackRank;
    }
    String artists = node.path("artist").path("name").asText("");
    if (artists.isBlank() && node.path("artist").isTextual()) {
      artists = node.path("artist").asText("");
    }
    return new LastfmTrackSummaryDto(
        node.path("name").asText(""),
        artists,
        node.path("mbid").asText(""),
        node.path("url").asText(""),
        pickImage(node.path("image")),
        rank,
        parseLong(node.path("playcount").asText("0")));
  }

  private static List<LastfmTagDto> mapTags(JsonNode tagNode) {
    List<LastfmTagDto> tags = new ArrayList<>();
    for (JsonNode node : arrayOrSingle(tagNode)) {
      String name = node.path("name").asText("");
      if (!name.isBlank()) {
        tags.add(new LastfmTagDto(name, node.path("url").asText("")));
      }
    }
    return List.copyOf(tags);
  }

  private UriComponentsBuilder baseBuilder(String apiKey) {
    return UriComponentsBuilder.fromUriString(LASTFM_API)
        .queryParam("api_key", apiKey)
        .queryParam("format", "json");
  }

  private JsonNode lastfmGet(UriComponentsBuilder builder) {
    return lastfmGet(builder.build().encode().toUri());
  }

  private JsonNode lastfmGet(URI uri) {
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

  private static Iterable<JsonNode> arrayOrSingle(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return List.of();
    }
    if (node.isArray()) {
      return node;
    }
    return List.of(node);
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

  private static long parseLong(String raw) {
    try {
      return Long.parseLong(raw.replace(",", "").trim());
    } catch (NumberFormatException e) {
      return 0L;
    }
  }

  private static String stripHtml(String html) {
    if (html == null || html.isBlank()) {
      return "";
    }
    return html.replaceAll("<[^>]+>", "").replace("&amp;", "&").trim();
  }

  private static String requireQuery(String query) {
    if (query == null || query.trim().length() < 1) {
      throw new IllegalStateException("lastfm_search_query_required");
    }
    return query.trim();
  }

  private static String requireName(String name) {
    if (name == null || name.trim().length() < 1) {
      throw new IllegalStateException("lastfm_search_name_required");
    }
    return name.trim();
  }
}
