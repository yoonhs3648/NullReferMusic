package com.nullrefer.music.web;

import com.nullrefer.music.chart.AppleMusicRssChartService;
import com.nullrefer.music.chart.LastfmChartService;
import com.nullrefer.music.search.LastfmSearchService;
import com.nullrefer.music.search.SpotifySearchService;
import com.nullrefer.music.chart.PeriodChartPageResult;
import com.nullrefer.music.chart.SpotifyChartResult;
import com.nullrefer.music.chart.SpotifyChartService;
import com.nullrefer.music.chart.SpotifyTokenProvider;
import com.nullrefer.music.chart.SpotifyTokenResponse;
import com.nullrefer.music.config.NrmPaths;
import com.nullrefer.music.download.AudioMetadataRequest;
import com.nullrefer.music.download.AudioMetadataService;
import com.nullrefer.music.download.YtDlpDownloadService;
import com.nullrefer.music.download.YtDlpDownloadService.DownloadOutcome;
import com.nullrefer.music.config.NrmSettings;
import com.nullrefer.music.youtube.YoutubeSearchHit;
import com.nullrefer.music.youtube.YoutubeSearchService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ApiController {

  private static final Pattern SAFE_JOB_ID = Pattern.compile("^[a-z0-9]{4,48}$");

  private final YtDlpDownloadService downloadService;
  private final AudioMetadataService audioMetadataService;
  private final YoutubeSearchService youtubeSearchService;
  private final SpotifyChartService spotifyChartService;
  private final LastfmChartService lastfmChartService;
  private final LastfmSearchService lastfmSearchService;
  private final SpotifySearchService spotifySearchService;
  private final AppleMusicRssChartService appleMusicRssChartService;
  private final SpotifyTokenProvider spotifyTokenProvider;
  private final NrmSettings settings;
  private final NrmPaths paths;

  public ApiController(
      YtDlpDownloadService downloadService,
      AudioMetadataService audioMetadataService,
      YoutubeSearchService youtubeSearchService,
      SpotifyChartService spotifyChartService,
      LastfmChartService lastfmChartService,
      LastfmSearchService lastfmSearchService,
      SpotifySearchService spotifySearchService,
      AppleMusicRssChartService appleMusicRssChartService,
      SpotifyTokenProvider spotifyTokenProvider,
      NrmSettings settings,
      NrmPaths paths) {
    this.downloadService = downloadService;
    this.audioMetadataService = audioMetadataService;
    this.youtubeSearchService = youtubeSearchService;
    this.spotifyChartService = spotifyChartService;
    this.lastfmChartService = lastfmChartService;
    this.lastfmSearchService = lastfmSearchService;
    this.spotifySearchService = spotifySearchService;
    this.appleMusicRssChartService = appleMusicRssChartService;
    this.spotifyTokenProvider = spotifyTokenProvider;
    this.settings = settings;
    this.paths = paths;
  }

  @GetMapping("/api/health")
  public Map<String, Object> health() {
    return downloadService.health();
  }

  @GetMapping("/api/meta")
  public Map<String, Object> meta() {
    return Map.of(
        "name", "nullreference-music-backend",
        "youtubeSearchEnabled", settings.getYoutubeApiKey() != null && !settings.getYoutubeApiKey().isBlank(),
        "spotifyChartsEnabled", spotifyTokenProvider.isConfigured(),
        "lastfmChartsEnabled",
            settings.getLastfmApiKey() != null && !settings.getLastfmApiKey().isBlank(),
        "appleMusicChartsEnabled", true,
        "endpoints",
            List.of(
                "/api/health",
                "/api/youtube/search?q=...",
                "/youtube/search?q=... (legacy alias)",
                "/api/charts/apple-music/rss?chart=top100-kr",
                "/api/charts/spotify/top100?market=KR",
                "/api/charts/spotify/playlist?chart=top50-kr",
                "POST /api/charts/spotify/token",
                "/api/charts/lastfm/tracks?chart=top50-kr",
                "POST /api/charts/lastfm/token",
                "/api/search/lastfm/artist?q=...",
                "/api/search/lastfm/artist/detail?artist=...",
                "/api/search/lastfm/album?q=...",
                "/api/search/lastfm/album/detail?artist=...&album=...",
                "/api/search/lastfm/track?q=...",
                "/api/search/lastfm/track/detail?artist=...&track=...",
                "/api/search/spotify/artist?q=...",
                "/api/search/spotify/artist/detail?id=...",
                "/api/search/spotify/album?q=...",
                "/api/search/spotify/album/detail?id=...",
                "/api/search/spotify/track?q=...",
                "/api/search/spotify/track/detail?id=...",
                "/api/download",
                "/api/download/file?jobId=..."));
  }

  @GetMapping("/api/charts/spotify/top100")
  public ResponseEntity<?> spotifyTopChart(
      @RequestParam(value = "market", required = false) String market,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Id",
              required = false)
          String clientIdHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Secret",
              required = false)
          String clientSecretHeader) {
    try {
      String bearer = extractBearerToken(authorization);
      SpotifyChartResult result =
          spotifyChartService.fetchTopChart(market, clientIdHeader, clientSecretHeader, bearer);
      return ResponseEntity.ok(result);
    } catch (IllegalStateException e) {
      return spotifyErrorResponse(e);
    }
  }

  private static String resolveSpotifyPeriodKind(String kind, String legacyGranularity) {
    if (kind != null && !kind.isBlank()) {
      String k = kind.trim().toLowerCase();
      if ("yearly".equals(k) || "monthly".equals(k) || "weekly".equals(k) || "daily".equals(k)) {
        return k;
      }
    }
    if (legacyGranularity != null && "year".equalsIgnoreCase(legacyGranularity.trim())) {
      return "yearly";
    }
    return "daily";
  }

  private static String extractBearerToken(String authorization) {
    if (authorization == null || authorization.isBlank()) {
      return null;
    }
    String t = authorization.trim();
    if (t.length() > 7 && t.regionMatches(true, 0, "Bearer ", 0, 7)) {
      return t.substring(7).trim();
    }
    return null;
  }

  @GetMapping("/api/charts/spotify/playlist")
  public ResponseEntity<?> spotifyPlaylistChart(
      @RequestParam(value = "chart", defaultValue = "top50-kr") String chart,
      @RequestParam(value = "source", defaultValue = "charts") String source,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Id",
              required = false)
          String clientIdHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Secret",
              required = false)
          String clientSecretHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Charts-Username",
              required = false)
          String chartsUsernameHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Charts-Password",
              required = false)
          String chartsPasswordHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Charts-Sp-Dc",
              required = false)
          String chartsSpDcHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Charts-Sp-Key",
              required = false)
          String chartsSpKeyHeader) {
    try {
      String bearer = extractBearerToken(authorization);
      SpotifyChartResult result =
          spotifyChartService.fetchChartByKey(
              chart,
              source,
              clientIdHeader,
              clientSecretHeader,
              bearer,
              chartsUsernameHeader,
              chartsPasswordHeader,
              chartsSpDcHeader,
              chartsSpKeyHeader);
      return ResponseEntity.ok(result);
    } catch (IllegalStateException e) {
      return spotifyErrorResponse(e);
    }
  }

  @GetMapping("/api/charts/apple-music/rss")
  public ResponseEntity<?> appleMusicRssChart(
      @RequestParam(value = "chart", defaultValue = "top100-kr") String chart) {
    try {
      SpotifyChartResult result = appleMusicRssChartService.fetchChartByKey(chart);
      return ResponseEntity.ok(result);
    } catch (IllegalStateException e) {
      return appleMusicErrorResponse(e);
    }
  }

  @GetMapping("/api/charts/period/spotify")
  public ResponseEntity<?> spotifyPeriodChart(
      @RequestParam(value = "region", defaultValue = "kr") String region,
      @RequestParam(value = "kind", defaultValue = "daily") String kind,
      @RequestParam(value = "granularity", required = false) String granularity,
      @RequestParam(value = "year") int year,
      @RequestParam(value = "month", required = false) Integer month,
      @RequestParam(value = "day", required = false) Integer day,
      @RequestParam(value = "week", defaultValue = "1") int week,
      @RequestParam(value = "offset", defaultValue = "0") int offset,
      @RequestParam(value = "limit", defaultValue = "50") int limit,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization) {
    try {
      String bearer = extractBearerToken(authorization);
      if (bearer == null || bearer.isBlank()) {
        throw new IllegalStateException("spotify_charts_not_configured");
      }
      String resolvedKind = resolveSpotifyPeriodKind(kind, granularity);
      PeriodChartPageResult result =
          spotifyChartService.fetchPeriodPage(
              region, resolvedKind, year, month, day, week, offset, limit, bearer);
      return ResponseEntity.ok(result);
    } catch (IllegalStateException e) {
      return spotifyErrorResponse(e);
    }
  }

  @GetMapping("/api/charts/period/lastfm")
  public ResponseEntity<?> lastfmPeriodChart(
      @RequestParam(value = "region", defaultValue = "kr") String region,
      @RequestParam(value = "granularity", defaultValue = "month") String granularity,
      @RequestParam(value = "year") int year,
      @RequestParam(value = "month", required = false) Integer month,
      @RequestParam(value = "offset", defaultValue = "0") int offset,
      @RequestParam(value = "limit", defaultValue = "50") int limit,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Lastfm-Api-Key",
              required = false)
          String apiKeyHeader) {
    try {
      String bearer = extractBearerToken(authorization);
      String apiKey =
          apiKeyHeader != null && !apiKeyHeader.isBlank()
              ? apiKeyHeader.trim()
              : bearer;
      PeriodChartPageResult result =
          lastfmChartService.fetchPeriodPage(
              region, granularity, year, month, offset, limit, apiKey);
      return ResponseEntity.ok(result);
    } catch (IllegalStateException e) {
      return lastfmErrorResponse(e);
    }
  }

  @GetMapping("/api/charts/lastfm/tracks")
  public ResponseEntity<?> lastfmTracksChart(
      @RequestParam(value = "chart", defaultValue = "top50-kr") String chart,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Lastfm-Api-Key",
              required = false)
          String apiKeyHeader) {
    try {
      String bearer = extractBearerToken(authorization);
      String apiKey =
          apiKeyHeader != null && !apiKeyHeader.isBlank()
              ? apiKeyHeader.trim()
              : bearer;
      SpotifyChartResult result = lastfmChartService.fetchChartByKey(chart, apiKey);
      return ResponseEntity.ok(result);
    } catch (IllegalStateException e) {
      return lastfmErrorResponse(e);
    }
  }

  @GetMapping("/api/search/lastfm/artist")
  public ResponseEntity<?> lastfmSearchArtist(
      @RequestParam("q") String query,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Lastfm-Api-Key",
              required = false)
          String apiKeyHeader) {
    return lastfmSearchWithKey(
        apiKeyHeader,
        authorization,
        key -> lastfmSearchService.searchArtists(key, query));
  }

  @GetMapping("/api/search/lastfm/artist/detail")
  public ResponseEntity<?> lastfmArtistDetail(
      @RequestParam("artist") String artist,
      @RequestParam(value = "mbid", required = false) String mbid,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Lastfm-Api-Key",
              required = false)
          String apiKeyHeader) {
    return lastfmSearchWithKey(
        apiKeyHeader,
        authorization,
        key -> lastfmSearchService.fetchArtistDetail(key, artist, mbid));
  }

  @GetMapping("/api/search/lastfm/album")
  public ResponseEntity<?> lastfmSearchAlbum(
      @RequestParam("q") String query,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Lastfm-Api-Key",
              required = false)
          String apiKeyHeader) {
    return lastfmSearchWithKey(
        apiKeyHeader,
        authorization,
        key -> lastfmSearchService.searchAlbums(key, query));
  }

  @GetMapping("/api/search/lastfm/album/detail")
  public ResponseEntity<?> lastfmAlbumDetail(
      @RequestParam("artist") String artist,
      @RequestParam("album") String album,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Lastfm-Api-Key",
              required = false)
          String apiKeyHeader) {
    return lastfmSearchWithKey(
        apiKeyHeader,
        authorization,
        key -> lastfmSearchService.fetchAlbumDetail(key, artist, album));
  }

  @GetMapping("/api/search/lastfm/track")
  public ResponseEntity<?> lastfmSearchTrack(
      @RequestParam("q") String query,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Lastfm-Api-Key",
              required = false)
          String apiKeyHeader) {
    return lastfmSearchWithKey(
        apiKeyHeader,
        authorization,
        key -> lastfmSearchService.searchTracks(key, query));
  }

  @GetMapping("/api/search/lastfm/track/detail")
  public ResponseEntity<?> lastfmTrackDetail(
      @RequestParam("artist") String artist,
      @RequestParam("track") String track,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Lastfm-Api-Key",
              required = false)
          String apiKeyHeader) {
    return lastfmSearchWithKey(
        apiKeyHeader,
        authorization,
        key -> lastfmSearchService.fetchTrackDetail(key, artist, track));
  }

  @GetMapping("/api/search/spotify/artist")
  public ResponseEntity<?> spotifySearchArtist(
      @RequestParam("q") String query,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Id",
              required = false)
          String clientIdHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Secret",
              required = false)
          String clientSecretHeader) {
    return spotifySearchWithAuth(
        authorization,
        clientIdHeader,
        clientSecretHeader,
        (clientId, clientSecret, bearer) ->
            spotifySearchService.searchArtists(clientId, clientSecret, bearer, query));
  }

  @GetMapping("/api/search/spotify/artist/detail")
  public ResponseEntity<?> spotifyArtistDetail(
      @RequestParam("id") String id,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Id",
              required = false)
          String clientIdHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Secret",
              required = false)
          String clientSecretHeader) {
    return spotifySearchWithAuth(
        authorization,
        clientIdHeader,
        clientSecretHeader,
        (clientId, clientSecret, bearer) ->
            spotifySearchService.fetchArtistDetail(clientId, clientSecret, bearer, id));
  }

  @GetMapping("/api/search/spotify/album")
  public ResponseEntity<?> spotifySearchAlbum(
      @RequestParam("q") String query,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Id",
              required = false)
          String clientIdHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Secret",
              required = false)
          String clientSecretHeader) {
    return spotifySearchWithAuth(
        authorization,
        clientIdHeader,
        clientSecretHeader,
        (clientId, clientSecret, bearer) ->
            spotifySearchService.searchAlbums(clientId, clientSecret, bearer, query));
  }

  @GetMapping("/api/search/spotify/album/detail")
  public ResponseEntity<?> spotifyAlbumDetail(
      @RequestParam("id") String id,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Id",
              required = false)
          String clientIdHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Secret",
              required = false)
          String clientSecretHeader) {
    return spotifySearchWithAuth(
        authorization,
        clientIdHeader,
        clientSecretHeader,
        (clientId, clientSecret, bearer) ->
            spotifySearchService.fetchAlbumDetail(clientId, clientSecret, bearer, id));
  }

  @GetMapping("/api/search/spotify/track")
  public ResponseEntity<?> spotifySearchTrack(
      @RequestParam("q") String query,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Id",
              required = false)
          String clientIdHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Secret",
              required = false)
          String clientSecretHeader) {
    return spotifySearchWithAuth(
        authorization,
        clientIdHeader,
        clientSecretHeader,
        (clientId, clientSecret, bearer) ->
            spotifySearchService.searchTracks(clientId, clientSecret, bearer, query));
  }

  @GetMapping("/api/search/spotify/track/detail")
  public ResponseEntity<?> spotifyTrackDetail(
      @RequestParam("id") String id,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = HttpHeaders.AUTHORIZATION,
              required = false)
          String authorization,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Id",
              required = false)
          String clientIdHeader,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Spotify-Client-Secret",
              required = false)
          String clientSecretHeader) {
    return spotifySearchWithAuth(
        authorization,
        clientIdHeader,
        clientSecretHeader,
        (clientId, clientSecret, bearer) ->
            spotifySearchService.fetchTrackDetail(clientId, clientSecret, bearer, id));
  }

  @PostMapping("/api/charts/lastfm/token")
  public ResponseEntity<?> lastfmToken(@RequestBody LastfmTokenRequest req) {
    try {
      String apiKey = req != null ? req.apiKey : null;
      lastfmChartService.validateApiKey(apiKey);
      return ResponseEntity.ok(Map.of("ok", true, "apiKey", apiKey != null ? apiKey.trim() : ""));
    } catch (IllegalStateException e) {
      return lastfmErrorResponse(e);
    }
  }

  @PostMapping("/api/charts/spotify/token")
  public ResponseEntity<?> spotifyToken(@RequestBody SpotifyTokenRequest req) {
    try {
      SpotifyTokenResponse token =
          spotifyTokenProvider.issueToken(
              req != null ? req.clientId : null, req != null ? req.clientSecret : null);
      return ResponseEntity.ok(
          Map.of(
              "accessToken", token.accessToken(),
              "expiresIn", token.expiresIn(),
              "tokenType", token.tokenType()));
    } catch (IllegalStateException e) {
      return spotifyErrorResponse(e);
    }
  }

  private static ResponseEntity<Map<String, String>> spotifyErrorResponse(
      IllegalStateException e) {
    String code = e.getMessage() != null ? e.getMessage() : "spotify_error";
    if ("spotify_not_configured".equals(code)
        || "spotify_playlist_not_configured".equals(code)
        || "spotify_chart_unknown".equals(code)
        || "spotify_charts_not_configured".equals(code)
        || "spotify_charts_login_failed".equals(code)
        || "spotify_charts_access_blocked".equals(code)) {
      return ResponseEntity.status(503).body(Map.of("error", code));
    }
    if ("spotify_playlist_not_accessible".equals(code)
        || "spotify_charts_not_found".equals(code)
        || "spotify_charts_empty".equals(code)) {
      return ResponseEntity.status(404).body(Map.of("error", code));
    }
    if ("spotify_charts_rate_limited".equals(code)) {
      return ResponseEntity.status(429).body(Map.of("error", "spotify_charts_rate_limited"));
    }
    if ("spotify_charts_auth_failed".equals(code)) {
      return ResponseEntity.status(401).body(Map.of("error", "spotify_charts_auth_failed"));
    }
    if ("spotify_auth_failed".equals(code)) {
      return ResponseEntity.status(403).body(Map.of("error", "spotify_auth_failed"));
    }
    if ("spotify_premium_required".equals(code)) {
      return ResponseEntity.status(403).body(Map.of("error", "spotify_premium_required"));
    }
    if ("spotify_search_query_required".equals(code) || "spotify_search_id_required".equals(code)) {
      return ResponseEntity.status(400).body(Map.of("error", code));
    }
    return ResponseEntity.status(502).body(Map.of("error", code));
  }

  @FunctionalInterface
  private interface SpotifySearchAction<T> {
    T run(String clientId, String clientSecret, String bearer);
  }

  private <T> ResponseEntity<?> spotifySearchWithAuth(
      String authorization,
      String clientIdHeader,
      String clientSecretHeader,
      SpotifySearchAction<T> action) {
    try {
      String bearer = extractBearerToken(authorization);
      T result = action.run(clientIdHeader, clientSecretHeader, bearer);
      return ResponseEntity.ok(result);
    } catch (IllegalStateException e) {
      return spotifyErrorResponse(e);
    }
  }

  private static ResponseEntity<Map<String, String>> appleMusicErrorResponse(
      IllegalStateException e) {
    String code = e.getMessage() != null ? e.getMessage() : "apple_music_error";
    if ("apple_music_chart_unknown".equals(code)) {
      return ResponseEntity.status(503).body(Map.of("error", code));
    }
    if ("apple_music_charts_empty".equals(code) || "apple_music_charts_not_found".equals(code)) {
      return ResponseEntity.status(404).body(Map.of("error", code));
    }
    if ("apple_music_forbidden".equals(code)) {
      return ResponseEntity.status(403).body(Map.of("error", code));
    }
    return ResponseEntity.status(502).body(Map.of("error", code));
  }

  @FunctionalInterface
  private interface LastfmSearchAction<T> {
    T run(String apiKey);
  }

  private <T> ResponseEntity<?> lastfmSearchWithKey(
      String apiKeyHeader, String authorization, LastfmSearchAction<T> action) {
    try {
      String bearer = extractBearerToken(authorization);
      String apiKey =
          apiKeyHeader != null && !apiKeyHeader.isBlank()
              ? apiKeyHeader.trim()
              : bearer;
      String resolved = lastfmSearchService.resolveApiKeyForRequest(apiKey, bearer);
      return ResponseEntity.ok(action.run(resolved));
    } catch (IllegalStateException e) {
      return lastfmErrorResponse(e);
    }
  }

  private static ResponseEntity<Map<String, String>> lastfmErrorResponse(IllegalStateException e) {
    String code = e.getMessage() != null ? e.getMessage() : "lastfm_error";
    if ("lastfm_search_query_required".equals(code) || "lastfm_search_name_required".equals(code)) {
      return ResponseEntity.status(400).body(Map.of("error", code));
    }
    if ("lastfm_not_configured".equals(code) || "lastfm_chart_unknown".equals(code)) {
      return ResponseEntity.status(503).body(Map.of("error", code));
    }
    if ("lastfm_charts_empty".equals(code)) {
      return ResponseEntity.status(404).body(Map.of("error", code));
    }
    if ("lastfm_auth_failed".equals(code)) {
      return ResponseEntity.status(502).body(Map.of("error", code));
    }
    return ResponseEntity.status(502).body(Map.of("error", code));
  }

  public static class SpotifyTokenRequest {
    public String clientId;
    public String clientSecret;
  }

  public static class LastfmTokenRequest {
    public String apiKey;
    public String sharedSecret;
  }

  @GetMapping({"/api/youtube/search", "/youtube/search"})
  public ResponseEntity<?> youtubeSearch(@RequestParam(value = "q", required = false) String q) {
    if (q == null || q.isBlank()) {
      return ResponseEntity.badRequest().body(Map.of("error", "empty_query"));
    }
    try {
      List<YoutubeSearchHit> hits = youtubeSearchService.search(q.trim());
      return ResponseEntity.ok(hits);
    } catch (IllegalStateException e) {
      String code = e.getMessage() != null ? e.getMessage() : "youtube_error";
      if ("youtube_api_key_missing".equals(code)) {
        return ResponseEntity.status(503).body(Map.of("error", code));
      }
      return ResponseEntity.status(502).body(Map.of("error", code));
    }
  }

  @PostMapping("/api/download")
  public ResponseEntity<Map<String, Object>> download(@RequestBody DownloadRequest req) {
    boolean noPlaylist = req.noPlaylist == null || req.noPlaylist;
    String format = req.audioFormat != null ? req.audioFormat : "mp3";
    int quality = req.audioQuality != null ? req.audioQuality : 0;
    DownloadOutcome out =
        downloadService.download(
            req.url != null ? req.url : "", noPlaylist, format, quality);
    if (out.status().is2xxSuccessful() && req.hasMetadata()) {
      Object jobId = out.body().get("jobId");
      if (jobId instanceof String job && SAFE_JOB_ID.matcher(job).matches()) {
        try {
          audioMetadataService.applyToJobFile(job, req.toMetadataRequest());
        } catch (Exception e) {
          return ResponseEntity.status(500)
              .body(Map.of("error", "metadata_apply_failed", "jobId", job));
        }
      }
    }
    return ResponseEntity.status(out.status()).body(out.body());
  }

  @PostMapping("/api/download/metadata")
  public ResponseEntity<Map<String, Object>> applyDownloadMetadata(
      @RequestBody AudioMetadataRequest req) {
    if (req.jobId == null || !SAFE_JOB_ID.matcher(req.jobId).matches()) {
      return ResponseEntity.badRequest().body(Map.of("error", "invalid_job_id"));
    }
    try {
      audioMetadataService.applyToJobFile(req.jobId, req);
      return ResponseEntity.ok(Map.of("ok", true));
    } catch (IllegalStateException e) {
      String code = e.getMessage() != null ? e.getMessage() : "metadata_apply_failed";
      return ResponseEntity.status(500).body(Map.of("error", code));
    }
  }

  /**
   * 서버 downloads 폴더에 생성된 MP3를 클라이언트로 전송 (웹 저장 대화상자 / 모바일 저장용).
   */
  @GetMapping("/api/download/file")
  public ResponseEntity<Resource> downloadFile(@RequestParam("jobId") String jobId) {
    if (jobId == null || !SAFE_JOB_ID.matcher(jobId).matches()) {
      return ResponseEntity.badRequest().build();
    }
    Path baseDir = paths.getOutputDir().toAbsolutePath().normalize();
    Path file = resolveDownloadJobFile(baseDir, jobId);
    if (file == null || !file.startsWith(baseDir)) {
      return ResponseEntity.notFound().build();
    }
    Resource resource = new FileSystemResource(file);
    String filename = file.getFileName().toString();
  String ext =
        filename.contains(".")
            ? filename.substring(filename.lastIndexOf('.')).toLowerCase()
            : ".mp3";
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
        .contentType(MediaType.parseMediaType(mimeTypeForExtension(ext)))
        .body(resource);
  }

  private static Path resolveDownloadJobFile(Path baseDir, String jobId) {
    try (var stream = Files.newDirectoryStream(baseDir, "nrm_" + jobId + ".*")) {
      for (Path candidate : stream) {
        if (Files.isRegularFile(candidate) && candidate.normalize().startsWith(baseDir)) {
          return candidate.normalize();
        }
      }
    } catch (Exception ignored) {
      // fall through
    }
    Path fallback = baseDir.resolve("nrm_" + jobId + ".mp3").normalize();
    if (Files.isRegularFile(fallback)) {
      return fallback;
    }
    return null;
  }

  private static String mimeTypeForExtension(String ext) {
    return switch (ext) {
      case ".m4a" -> "audio/mp4";
      case ".opus" -> "audio/opus";
      case ".wav" -> "audio/wav";
      case ".flac" -> "audio/flac";
      case ".ogg" -> "audio/ogg";
      case ".aac" -> "audio/aac";
      default -> "audio/mpeg";
    };
  }

  public static class DownloadRequest {
    public String url;
    public Boolean noPlaylist;
    public String audioFormat;
    public Integer audioQuality;
    public String artist;
    public String title;
    public String album;
    public String genre;
    public String releaseDate;
    public String coverUrl;

    boolean hasMetadata() {
      return isNonBlank(artist)
          || isNonBlank(title)
          || isNonBlank(album)
          || isNonBlank(genre)
          || isNonBlank(releaseDate)
          || isNonBlank(coverUrl);
    }

    AudioMetadataRequest toMetadataRequest() {
      AudioMetadataRequest m = new AudioMetadataRequest();
      m.artist = artist;
      m.title = title;
      m.album = album;
      m.genre = genre;
      m.releaseDate = releaseDate;
      m.coverUrl = coverUrl;
      return m;
    }

    private static boolean isNonBlank(String s) {
      return s != null && !s.isBlank();
    }
  }
}
