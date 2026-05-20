package com.nullrefer.music.web;

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
  private final SpotifyTokenProvider spotifyTokenProvider;
  private final NrmSettings settings;
  private final NrmPaths paths;

  public ApiController(
      YtDlpDownloadService downloadService,
      YoutubeSearchService youtubeSearchService,
      SpotifyChartService spotifyChartService,
      SpotifyTokenProvider spotifyTokenProvider,
      NrmSettings settings,
      NrmPaths paths) {
    this.downloadService = downloadService;
    this.youtubeSearchService = youtubeSearchService;
    this.spotifyChartService = spotifyChartService;
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
        "endpoints",
            List.of(
                "/api/health",
                "/api/youtube/search?q=...",
                "/youtube/search?q=... (legacy alias)",
                "/api/charts/spotify/top100?market=KR",
                "POST /api/charts/spotify/token",
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
        || "spotify_playlist_not_configured".equals(code)) {
      return ResponseEntity.status(503).body(Map.of("error", code));
    }
    if ("spotify_playlist_not_accessible".equals(code)) {
      return ResponseEntity.status(404).body(Map.of("error", code));
    }
    if ("spotify_auth_failed".equals(code)) {
      return ResponseEntity.status(502).body(Map.of("error", code));
    }
    return ResponseEntity.status(502).body(Map.of("error", code));
  }

  public static class SpotifyTokenRequest {
    public String clientId;
    public String clientSecret;
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
