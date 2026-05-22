package com.nullrefer.music.web;

import com.nullrefer.music.chart.AppleMusicRssChartService;
import com.nullrefer.music.chart.LastfmChartService;
import com.nullrefer.music.search.LastfmSearchService;
import com.nullrefer.music.chart.SpotifyChartResult;
import com.nullrefer.music.chart.SpotifyChartService;
import com.nullrefer.music.chart.SpotifyTokenProvider;
import com.nullrefer.music.chart.SpotifyTokenResponse;
import com.nullrefer.music.config.NrmPaths;
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
  private final YoutubeSearchService youtubeSearchService;
  private final SpotifyChartService spotifyChartService;
  private final LastfmChartService lastfmChartService;
  private final LastfmSearchService lastfmSearchService;
  private final AppleMusicRssChartService appleMusicRssChartService;
  private final SpotifyTokenProvider spotifyTokenProvider;
  private final NrmSettings settings;
  private final NrmPaths paths;

  public ApiController(
      YtDlpDownloadService downloadService,
      YoutubeSearchService youtubeSearchService,
      SpotifyChartService spotifyChartService,
      LastfmChartService lastfmChartService,
      LastfmSearchService lastfmSearchService,
      AppleMusicRssChartService appleMusicRssChartService,
      SpotifyTokenProvider spotifyTokenProvider,
      NrmSettings settings,
      NrmPaths paths) {
    this.downloadService = downloadService;
    this.youtubeSearchService = youtubeSearchService;
    this.spotifyChartService = spotifyChartService;
    this.lastfmChartService = lastfmChartService;
    this.lastfmSearchService = lastfmSearchService;
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
        || "spotify_premium_required".equals(code)
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
    if ("spotify_charts_auth_failed".equals(code)) {
      return ResponseEntity.status(401).body(Map.of("error", "spotify_charts_auth_failed"));
    }
    if ("spotify_auth_failed".equals(code)) {
      return ResponseEntity.status(403).body(Map.of("error", "spotify_auth_failed"));
    }
    return ResponseEntity.status(502).body(Map.of("error", code));
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
    DownloadOutcome out = downloadService.download(req.url != null ? req.url : "", noPlaylist);
    return ResponseEntity.status(out.status()).body(out.body());
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
    Path file = baseDir.resolve("nrm_" + jobId + ".mp3").normalize();
    if (!file.startsWith(baseDir)) {
      return ResponseEntity.badRequest().build();
    }
    if (!Files.isRegularFile(file)) {
      return ResponseEntity.notFound().build();
    }
    Resource resource = new FileSystemResource(file);
    String filename = file.getFileName().toString();
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
        .contentType(MediaType.parseMediaType("audio/mpeg"))
        .body(resource);
  }

  public static class DownloadRequest {
    public String url;
    public Boolean noPlaylist;
  }
}
