package com.nullrefer.music.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nullrefer.music.chart.AppleMusicRssChartService;
import com.nullrefer.music.chart.LastfmChartService;
import com.nullrefer.music.chart.MelonDailyChartResult;
import com.nullrefer.music.chart.MelonDailyChartService;
import com.nullrefer.music.chart.MelonGenreChartService;
import com.nullrefer.music.chart.MelonRealtimeChartService;
import com.nullrefer.music.search.LastfmSearchService;
import com.nullrefer.music.search.MelonSearchService;
import com.nullrefer.music.search.SpotifySearchService;
import com.nullrefer.music.chart.PeriodChartPageResult;
import com.nullrefer.music.chart.SpotifyChartResult;
import com.nullrefer.music.chart.SpotifyChartService;
import com.nullrefer.music.chart.SpotifyTokenProvider;
import com.nullrefer.music.chart.SpotifyTokenResponse;
import com.nullrefer.music.config.NrmPaths;
import com.nullrefer.music.download.AlignLyricsService;
import com.nullrefer.music.download.AlignModelStatusService;
import com.nullrefer.music.download.AudioMetadataRequest;
import com.nullrefer.music.download.AudioMetadataService;
import com.nullrefer.music.download.WhisperLyricsService;
import com.nullrefer.music.download.WhisperModelStatusService;
import com.nullrefer.music.download.YtDlpDownloadService;
import com.nullrefer.music.download.YtDlpDownloadService.DownloadOutcome;
import com.nullrefer.music.config.NrmSettings;
import com.nullrefer.music.youtube.YoutubeSearchHit;
import com.nullrefer.music.youtube.YoutubeSearchPage;
import com.nullrefer.music.youtube.YoutubeSearchService;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import org.springframework.web.multipart.MultipartFile;

@RestController
public class ApiController {

  private static final Logger log = LoggerFactory.getLogger(ApiController.class);
  private static final Pattern SAFE_JOB_ID = Pattern.compile("^[a-z0-9]{4,48}$");
  private static final ObjectMapper JSON = new ObjectMapper();

  private final YtDlpDownloadService downloadService;
  private final AudioMetadataService audioMetadataService;
  private final WhisperLyricsService whisperLyricsService;
  private final WhisperModelStatusService whisperModelStatusService;
  private final AlignModelStatusService alignModelStatusService;
  private final AlignLyricsService alignLyricsService;
  private final YoutubeSearchService youtubeSearchService;
  private final SpotifyChartService spotifyChartService;
  private final LastfmChartService lastfmChartService;
  private final LastfmSearchService lastfmSearchService;
  private final SpotifySearchService spotifySearchService;
  private final AppleMusicRssChartService appleMusicRssChartService;
  private final MelonGenreChartService melonGenreChartService;
  private final MelonRealtimeChartService melonRealtimeChartService;
  private final MelonDailyChartService melonDailyChartService;
  private final MelonSearchService melonSearchService;
  private final SpotifyTokenProvider spotifyTokenProvider;
  private final NrmSettings settings;
  private final NrmPaths paths;

  public ApiController(
      YtDlpDownloadService downloadService,
      AudioMetadataService audioMetadataService,
      WhisperLyricsService whisperLyricsService,
      WhisperModelStatusService whisperModelStatusService,
      AlignModelStatusService alignModelStatusService,
      AlignLyricsService alignLyricsService,
      YoutubeSearchService youtubeSearchService,
      SpotifyChartService spotifyChartService,
      LastfmChartService lastfmChartService,
      LastfmSearchService lastfmSearchService,
      SpotifySearchService spotifySearchService,
      AppleMusicRssChartService appleMusicRssChartService,
      MelonGenreChartService melonGenreChartService,
      MelonRealtimeChartService melonRealtimeChartService,
      MelonDailyChartService melonDailyChartService,
      MelonSearchService melonSearchService,
      SpotifyTokenProvider spotifyTokenProvider,
      NrmSettings settings,
      NrmPaths paths) {
    this.downloadService = downloadService;
    this.audioMetadataService = audioMetadataService;
    this.whisperLyricsService = whisperLyricsService;
    this.whisperModelStatusService = whisperModelStatusService;
    this.alignModelStatusService = alignModelStatusService;
    this.alignLyricsService = alignLyricsService;
    this.youtubeSearchService = youtubeSearchService;
    this.spotifyChartService = spotifyChartService;
    this.lastfmChartService = lastfmChartService;
    this.lastfmSearchService = lastfmSearchService;
    this.spotifySearchService = spotifySearchService;
    this.appleMusicRssChartService = appleMusicRssChartService;
    this.melonGenreChartService = melonGenreChartService;
    this.melonRealtimeChartService = melonRealtimeChartService;
    this.melonDailyChartService = melonDailyChartService;
    this.melonSearchService = melonSearchService;
    this.spotifyTokenProvider = spotifyTokenProvider;
    this.settings = settings;
    this.paths = paths;
  }

  @GetMapping("/api/health")
  public Map<String, Object> health() {
    java.util.Map<String, Object> body = new java.util.LinkedHashMap<>(downloadService.health());
    body.put("whisper", whisperLyricsService.isAvailable());
    body.put("whisperModels", whisperModelStatusService.listStatuses());
    body.put("alignModels", alignModelStatusService.listStatuses());
    return body;
  }

  /** PC forced alignment 모델 (aeneas + wav2vec2 팩 상태) */
  @GetMapping("/api/align/models")
  public List<Map<String, Object>> alignModelStatuses() {
    return alignModelStatusService.listStatuses();
  }

  /** PC `library/whisper` 설치·다운로드 모델 (웹·5종 카탈로그) */
  @GetMapping("/api/whisper/models")
  public List<Map<String, Object>> whisperModelStatuses() {
    return whisperModelStatusService.listStatuses();
  }

  @PostMapping("/api/whisper/models/{modelId}/download")
  public ResponseEntity<Map<String, Object>> startWhisperModelDownload(
      @org.springframework.web.bind.annotation.PathVariable("modelId") String modelId) {
    String id = modelId != null ? modelId.trim() : "";
    if (!id.startsWith("whisper:")) {
      return ResponseEntity.badRequest().body(Map.of("error", "invalid_model_id"));
    }
    try {
      whisperModelStatusService.startDownload(id);
      return ResponseEntity.ok(Map.of("started", true, "modelId", id));
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }
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
                "/api/search/melon/artist?q=...",
                "/api/search/melon/artist/detail?artistId=...",
                "/api/search/melon/album?q=...",
                "/api/search/melon/album/detail?albumId=...",
                "/api/search/melon/track?q=...",
                "/api/search/melon/track/detail?songId=...",
                "/api/search/spotify/artist?q=...",
                "/api/search/spotify/artist/detail?id=...",
                "/api/search/spotify/album?q=...",
                "/api/search/spotify/album/detail?id=...",
                "/api/search/spotify/track?q=...",
                "/api/search/spotify/track/detail?id=...",
                "/api/download",
                "/api/download/file?jobId=..."));
  }

  @PostMapping("/api/deepl/usage")
  public ResponseEntity<Map<String, Object>> deepLUsage(@RequestBody DeepLUsageRequest req) {
    String apiKey = req != null && req.apiKey != null ? req.apiKey.trim() : "";
    if (apiKey.isEmpty()) {
      return ResponseEntity.badRequest().body(Map.of("error", "deepl_not_configured"));
    }
    try {
      HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(12)).build();
      HttpRequest request =
          HttpRequest.newBuilder()
              .uri(URI.create("https://api-free.deepl.com/v2/usage"))
              .header("Authorization", "DeepL-Auth-Key " + apiKey)
              .GET()
              .build();
      HttpResponse<String> res = client.send(request, HttpResponse.BodyHandlers.ofString());
      if (res.statusCode() == 403 || res.statusCode() == 404) {
        request =
            HttpRequest.newBuilder()
                .uri(URI.create("https://api.deepl.com/v2/usage"))
                .header("Authorization", "DeepL-Auth-Key " + apiKey)
                .GET()
                .build();
        res = client.send(request, HttpResponse.BodyHandlers.ofString());
      }
      if (res.statusCode() == 401 || res.statusCode() == 403) {
        return ResponseEntity.status(401).body(Map.of("error", "deepl_auth_failed"));
      }
      if (res.statusCode() < 200 || res.statusCode() >= 300) {
        return ResponseEntity.status(502).body(Map.of("error", "deepl_usage_failed"));
      }
      JsonNode body = JSON.readTree(res.body());
      int count = Math.max(0, body.path("character_count").asInt(0));
      int limit = Math.max(0, body.path("character_limit").asInt(0));
      return ResponseEntity.ok(Map.of("character_count", count, "character_limit", limit));
    } catch (Exception e) {
      return ResponseEntity.status(502).body(Map.of("error", "deepl_network_failed"));
    }
  }

  @PostMapping("/api/deepl/translate")
  public ResponseEntity<?> deepLTranslate(@RequestBody DeepLTranslateRequest req) {
    String apiKey = req != null && req.apiKey != null ? req.apiKey.trim() : "";
    if (apiKey.isEmpty()) {
      return ResponseEntity.badRequest().body(Map.of("error", "deepl_not_configured"));
    }
    List<String> texts =
        req != null && req.texts != null
            ? req.texts.stream().map(s -> s == null ? "" : s.trim()).toList()
            : List.of();
    if (texts.isEmpty()) {
      return ResponseEntity.ok(Map.of("translations", List.of(), "apiUsed", "free"));
    }
    try {
      HttpClient client =
          HttpClient.newBuilder()
              .connectTimeout(Duration.ofSeconds(30))
              .build();
      List<Map<String, String>> translations = new ArrayList<>();
      String apiUsed = "free";
      List<List<String>> chunks = chunkDeepLTexts(texts);
      for (int ci = 0; ci < chunks.size(); ci++) {
        if (ci > 0) {
          Thread.sleep(50);
        }
        List<String> chunk = chunks.get(ci);
        String payload =
            JSON.writeValueAsString(
                Map.of(
                    "text",
                    chunk,
                    "target_lang",
                    "KO",
                    "preserve_formatting",
                    true,
                    "split_sentences",
                    "nonewlines"));
        HttpResponse<String> res =
            postDeepLTranslate(client, "https://api-free.deepl.com/v2/translate", apiKey, payload);
        if (res.statusCode() == 403 || res.statusCode() == 404) {
          apiUsed = "pro";
          res =
              postDeepLTranslate(
                  client, "https://api.deepl.com/v2/translate", apiKey, payload);
        }
        if (res.statusCode() == 401 || res.statusCode() == 403) {
          return ResponseEntity.status(401).body(Map.of("error", "deepl_auth_failed"));
        }
        if (res.statusCode() < 200 || res.statusCode() >= 300) {
          return ResponseEntity.status(502).body(Map.of("error", "deepl_translate_failed"));
        }
        JsonNode root = JSON.readTree(res.body());
        JsonNode arr = root.path("translations");
        if (!arr.isArray()) {
          return ResponseEntity.status(502).body(Map.of("error", "deepl_translate_invalid"));
        }
        for (JsonNode node : arr) {
          translations.add(
              Map.of(
                  "text", node.path("text").asText(""),
                  "detected_source_language", node.path("detected_source_language").asText("")));
        }
      }
      return ResponseEntity.ok(Map.of("translations", translations, "apiUsed", apiUsed));
    } catch (Exception e) {
      return ResponseEntity.status(502).body(Map.of("error", "deepl_network_failed"));
    }
  }

  private static final int DEEPL_MAX_LINES_PER_REQUEST = 50;

  private static List<List<String>> chunkDeepLTexts(List<String> lines) {
    List<List<String>> out = new ArrayList<>();
    List<String> current = new ArrayList<>();
    int currentBytes = 96;
    for (String line : lines) {
      int add = line.length() + 4;
      if (!current.isEmpty()
          && (current.size() + 1 > DEEPL_MAX_LINES_PER_REQUEST
              || currentBytes + add > 120 * 1024)) {
        out.add(new ArrayList<>(current));
        current.clear();
        currentBytes = 96;
      }
      current.add(line);
      currentBytes += add;
    }
    if (!current.isEmpty()) {
      out.add(current);
    }
    return out;
  }

  private static HttpResponse<String> postDeepLTranslate(
      HttpClient client, String url, String apiKey, String jsonBody)
      throws Exception {
    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(Duration.ofSeconds(120))
            .header("Authorization", "DeepL-Auth-Key " + apiKey)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
            .build();
    return client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
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
      if ("monthly".equals(k) || "weekly".equals(k) || "daily".equals(k)) {
        return k;
      }
    }
    if (legacyGranularity != null && "month".equalsIgnoreCase(legacyGranularity.trim())) {
      return "monthly";
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
      @RequestParam(value = "snapshotDay", defaultValue = "4") int snapshotDay,
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
              region, resolvedKind, year, month, day, week, snapshotDay, offset, limit, bearer);
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

  @GetMapping("/api/charts/melon/realtime")
  public ResponseEntity<?> melonRealtimeChart(
      @RequestParam(value = "chart", defaultValue = "top100") String chart) {
    try {
      return ResponseEntity.ok(melonRealtimeChartService.fetchChart(chart));
    } catch (IllegalArgumentException e) {
      return ResponseEntity.status(400).body(Map.of("error", e.getMessage()));
    } catch (IllegalStateException e) {
      String code = e.getMessage() != null ? e.getMessage() : "melon_fetch_failed";
      if ("melon_empty".equals(code)) {
        return ResponseEntity.ok(
            new SpotifyChartResult(
                "melon",
                chart,
                chart,
                "KR",
                java.time.Instant.now(),
                List.of()));
      }
      return ResponseEntity.status(502).body(Map.of("error", code));
    }
  }

  @GetMapping("/api/charts/melon/daily")
  public ResponseEntity<?> melonDailyChart(
      @RequestParam(value = "classCd", defaultValue = "GN0000") String classCd) {
    try {
      return ResponseEntity.ok(melonDailyChartService.fetchLatest(classCd));
    } catch (IllegalArgumentException e) {
      return ResponseEntity.status(400).body(Map.of("error", e.getMessage()));
    } catch (IllegalStateException e) {
      String code = e.getMessage() != null ? e.getMessage() : "melon_fetch_failed";
      if ("melon_empty".equals(code)) {
        return ResponseEntity.ok(
            new MelonDailyChartResult(
                "melon",
                "daily:" + classCd,
                "Melon 일간",
                "KR",
                java.time.Instant.now(),
                List.of(),
                null));
      }
      return ResponseEntity.status(502).body(Map.of("error", code));
    }
  }

  @GetMapping("/api/charts/melon/genre")
  public ResponseEntity<?> melonGenreChart(
      @RequestParam(value = "kind", defaultValue = "weekly") String kind,
      @RequestParam(value = "classCd", defaultValue = "GN0000") String classCd,
      @RequestParam(value = "year") int year,
      @RequestParam(value = "month", required = false) Integer month,
      @RequestParam(value = "week", required = false) Integer week,
      @RequestParam(value = "offset", defaultValue = "0") int offset,
      @RequestParam(value = "limit", defaultValue = "50") int limit) {
    try {
      PeriodChartPageResult result =
          melonGenreChartService.fetchGenrePage(kind, classCd, year, month, week, offset, limit);
      return ResponseEntity.ok(result);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    } catch (IllegalStateException e) {
      return ResponseEntity.status(502).body(Map.of("error", e.getMessage()));
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

  @GetMapping("/api/charts/lastfm/track-cover")
  public ResponseEntity<?> lastfmChartTrackCover(
      @RequestParam("mbid") String mbid,
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
        key -> lastfmSearchService.fetchTrackCoverByMbid(key, mbid));
  }

  @GetMapping("/api/search/lastfm/artist-image")
  public ResponseEntity<?> lastfmArtistImage(
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
        key -> lastfmSearchService.fetchArtistImage(key, artist, mbid));
  }

  @GetMapping("/api/search/lastfm/artist")
  public ResponseEntity<?> lastfmSearchArtist(
      @RequestParam("q") String query,
      @RequestParam(value = "cursor", required = false) String cursor,
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
        key -> lastfmSearchService.searchArtistsPage(key, query, cursor));
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
      @RequestParam(value = "cursor", required = false) String cursor,
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
        key -> lastfmSearchService.searchAlbumsPage(key, query, cursor));
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
      @RequestParam(value = "cursor", required = false) String cursor,
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
        key -> lastfmSearchService.searchTracksPage(key, query, cursor));
  }

  @GetMapping("/api/search/lastfm/track/detail")
  public ResponseEntity<?> lastfmTrackDetail(
      @RequestParam("artist") String artist,
      @RequestParam("track") String track,
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
        key -> lastfmSearchService.fetchTrackDetail(key, artist, track, mbid));
  }

  @GetMapping("/api/search/melon/artist")
  public ResponseEntity<?> melonSearchArtist(
      @RequestParam("q") String query,
      @RequestParam(value = "cursor", required = false) String cursor,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Melon-Cookie",
              required = false)
          String melonCookieHeader) {
    return melonSearchWithCookie(
        melonCookieHeader,
        () -> melonSearchService.searchArtistsPage(query, cursor));
  }

  @GetMapping("/api/search/melon/artist/detail")
  public ResponseEntity<?> melonArtistDetail(
      @RequestParam("artistId") String artistId,
      @RequestParam(value = "artist", defaultValue = "") String artist,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Melon-Cookie",
              required = false)
          String melonCookieHeader) {
    return melonSearchWithCookie(
        melonCookieHeader,
        () -> melonSearchService.fetchArtistDetail(artistId, artist));
  }

  @GetMapping("/api/search/melon/album")
  public ResponseEntity<?> melonSearchAlbum(
      @RequestParam("q") String query,
      @RequestParam(value = "cursor", required = false) String cursor,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Melon-Cookie",
              required = false)
          String melonCookieHeader) {
    return melonSearchWithCookie(
        melonCookieHeader,
        () -> melonSearchService.searchAlbumsPage(query, cursor));
  }

  @GetMapping("/api/search/melon/album/detail")
  public ResponseEntity<?> melonAlbumDetail(
      @RequestParam("albumId") String albumId,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Melon-Cookie",
              required = false)
          String melonCookieHeader) {
    return melonSearchWithCookie(
        melonCookieHeader, () -> melonSearchService.fetchAlbumDetail(albumId));
  }

  @GetMapping("/api/search/melon/track")
  public ResponseEntity<?> melonSearchTrack(
      @RequestParam("q") String query,
      @RequestParam(value = "cursor", required = false) String cursor,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Melon-Cookie",
              required = false)
          String melonCookieHeader) {
    return melonSearchWithCookie(
        melonCookieHeader,
        () -> melonSearchService.searchTracksPage(query, cursor));
  }

  @GetMapping("/api/search/melon/track/detail")
  public ResponseEntity<?> melonTrackDetail(
      @RequestParam("songId") String songId,
      @org.springframework.web.bind.annotation.RequestHeader(
              value = "X-NRM-Melon-Cookie",
              required = false)
          String melonCookieHeader) {
    return melonSearchWithCookie(
        melonCookieHeader, () -> melonSearchService.fetchTrackDetail(songId));
  }

  @GetMapping("/api/search/spotify/artist")
  public ResponseEntity<?> spotifySearchArtist(
      @RequestParam("q") String query,
      @RequestParam(value = "cursor", required = false) String cursor,
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
            spotifySearchService.searchArtistsPage(clientId, clientSecret, bearer, query, cursor));
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
      @RequestParam(value = "cursor", required = false) String cursor,
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
            spotifySearchService.searchAlbumsPage(clientId, clientSecret, bearer, query, cursor));
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
      @RequestParam(value = "cursor", required = false) String cursor,
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
            spotifySearchService.searchTracksPage(clientId, clientSecret, bearer, query, cursor));
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
      return ResponseEntity.status(401).body(Map.of("error", "spotify_auth_failed"));
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
  private interface MelonSearchAction<T> {
    T run();
  }

  private <T> ResponseEntity<?> melonSearchWithCookie(String melonCookieHeader, MelonSearchAction<T> action) {
    try {
      melonSearchService.setMelonCookieHeader(melonCookieHeader);
      return ResponseEntity.ok(action.run());
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    } catch (IllegalStateException e) {
      return ResponseEntity.status(502).body(Map.of("error", e.getMessage()));
    } finally {
      melonSearchService.clearMelonCookieHeader();
    }
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
    if ("lastfm_rate_limited".equals(code)) {
      return ResponseEntity.status(429).body(Map.of("error", code));
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
  public ResponseEntity<?> youtubeSearch(
      @RequestParam(value = "q", required = false) String q,
      @RequestParam(value = "cursor", required = false) String cursor,
      @RequestParam(value = "limit", defaultValue = "20") int limit) {
    if (q == null || q.isBlank()) {
      return ResponseEntity.badRequest().body(Map.of("error", "empty_query"));
    }
    try {
      YoutubeSearchPage page = youtubeSearchService.searchPage(q.trim(), cursor, limit);
      return ResponseEntity.ok(
          Map.of(
              "items", page.items(),
              "nextCursor", page.nextCursor() != null ? page.nextCursor() : ""));
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
    log.info(
        "[api] POST /api/download url={} noPlaylist={} format={} quality={} hasMetadata={}",
        req.url,
        noPlaylist,
        format,
        quality,
        req.hasMetadata());
    DownloadOutcome out =
        downloadService.download(
            req.url != null ? req.url : "", noPlaylist, format, quality);
    log.info(
        "[api] POST /api/download RESPONSE status={} body={}",
        out.status().value(),
        out.body());
    if (out.status().is2xxSuccessful() && req.hasMetadata()) {
      Object jobId = out.body().get("jobId");
      if (jobId instanceof String job && SAFE_JOB_ID.matcher(job).matches()) {
        try {
          var result = audioMetadataService.applyToJobFile(job, req.toMetadataRequest());
          if (result.lyricsRequested() && !result.lyricsEmbedded()) {
            out.body().put("lyricsEmbedded", false);
          }
          if (result.lyricsTranslationFailed()) {
            out.body().put("lyricsTranslationFailed", true);
          }
        } catch (Exception e) {
          return ResponseEntity.status(500)
              .body(Map.of("error", "metadata_apply_failed", "jobId", job));
        }
      }
    }
    return ResponseEntity.status(out.status()).body(out.body());
  }

  private static java.util.Map<String, Object> metadataResultBody(
      AudioMetadataService.ApplyMetadataResult result) {
    java.util.Map<String, Object> body = new java.util.LinkedHashMap<>();
    body.put("ok", true);
    body.put("lyricsRequested", result.lyricsRequested());
    body.put("lyricsEmbedded", result.lyricsEmbedded());
    body.put("lyricsTranslationFailed", result.lyricsTranslationFailed());
    body.put("lyricsSidecarWritten", result.lyricsSidecarWritten());
    if (!result.whisperModelFile().isEmpty()) {
      body.put("whisperModelFile", result.whisperModelFile());
    }
    if (!result.whisperModelMissing().isEmpty()) {
      body.put("whisperModelMissing", result.whisperModelMissing());
    }
    if (!result.lrcText().isEmpty()) {
      body.put("lrcText", result.lrcText());
    }
    return body;
  }

  @PostMapping("/api/download/metadata")
  public ResponseEntity<Map<String, Object>> applyDownloadMetadata(
      @RequestBody AudioMetadataRequest req) {
    if (req.jobId == null || !SAFE_JOB_ID.matcher(req.jobId).matches()) {
      return ResponseEntity.badRequest().body(Map.of("error", "invalid_job_id"));
    }
    log.info(
        "[api] POST /api/download/metadata jobId={} artist={} title={}",
        req.jobId,
        req.artist,
        req.title);
    try {
      var result = audioMetadataService.applyFfmpegMetadataToJobFile(req.jobId, req);
      java.util.Map<String, Object> body = metadataResultBody(result);
      log.info("[api] POST /api/download/metadata OK jobId={} body={}", req.jobId, body);
      return ResponseEntity.ok(body);
    } catch (IllegalStateException e) {
      String code = e.getMessage() != null ? e.getMessage() : "metadata_apply_failed";
      log.warn("[api] POST /api/download/metadata FAIL jobId={} error={}", req.jobId, code);
      return ResponseEntity.status(500).body(Map.of("error", code));
    }
  }

  /** ffmpeg 메타·커버 + Whisper LRC — 서버에서 병렬 실행 */
  @PostMapping("/api/download/post-process")
  public ResponseEntity<Map<String, Object>> postProcessDownloadJob(
      @RequestBody AudioMetadataRequest req) {
    if (req.jobId == null || !SAFE_JOB_ID.matcher(req.jobId).matches()) {
      return ResponseEntity.badRequest().body(Map.of("error", "invalid_job_id"));
    }
    log.info(
        "[api] POST /api/download/post-process jobId={} artist={} title={} lyrics={}",
        req.jobId,
        req.artist,
        req.title,
        req.lyrics);
    try {
      var result = audioMetadataService.applyPostProcessToJobFileParallel(req.jobId, req);
      java.util.Map<String, Object> body = metadataResultBody(result);
      log.info("[api] POST /api/download/post-process OK jobId={} body={}", req.jobId, body);
      return ResponseEntity.ok(body);
    } catch (IllegalStateException e) {
      String code = e.getMessage() != null ? e.getMessage() : "post_process_failed";
      log.warn("[api] POST /api/download/post-process FAIL jobId={} error={}", req.jobId, code);
      return ResponseEntity.status(500).body(Map.of("error", code));
    }
  }

  @PostMapping("/api/download/melon-align")
  public ResponseEntity<Map<String, Object>> applyDownloadMelonAlign(
      @RequestBody AudioMetadataRequest req) {
    if (req.jobId == null || !SAFE_JOB_ID.matcher(req.jobId).matches()) {
      return ResponseEntity.badRequest().body(Map.of("error", "invalid_job_id"));
    }
    log.info(
        "[api] POST /api/download/melon-align jobId={} mode={} plainChars={}",
        req.jobId,
        req.lyrics,
        req.melonLyricsPlain != null ? req.melonLyricsPlain.length() : 0);
    try {
      var result = audioMetadataService.applyMelonAlignToJobFile(req.jobId, req);
      java.util.Map<String, Object> body = metadataResultBody(result);
      log.info("[api] POST /api/download/melon-align OK jobId={} body={}", req.jobId, body);
      return ResponseEntity.ok(body);
    } catch (IllegalStateException e) {
      String code = e.getMessage() != null ? e.getMessage() : "melon_align_failed";
      log.warn("[api] POST /api/download/melon-align FAIL jobId={} error={}", req.jobId, code);
      return ResponseEntity.status(500).body(Map.of("error", code));
    }
  }

  /** 업로드 오디오 Whisper 전사 (웹·Expo Go 트랙 편집용) */
  @PostMapping("/api/whisper/transcribe")
  public ResponseEntity<Map<String, Object>> transcribeUploadedAudio(
      @RequestParam("file") MultipartFile file,
      @RequestParam(value = "whisperModelPreference", required = false) String modelPref) {
    if (file == null || file.isEmpty()) {
      return ResponseEntity.badRequest().body(Map.of("error", "empty_file"));
    }
    Path temp = null;
    try {
      String original = file.getOriginalFilename() != null ? file.getOriginalFilename() : "audio.mp3";
      String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : ".mp3";
      temp = paths.getOutputDir().resolve("nrm-upload-" + System.currentTimeMillis() + ext);
      Files.write(temp, file.getBytes());
      var result =
          whisperLyricsService.transcribeToLrcDetailed(temp, false, modelPref != null ? modelPref : "");
      java.util.Map<String, Object> body = new java.util.LinkedHashMap<>();
      body.put("ok", !result.lrc().isBlank());
      body.put("lrcText", result.lrc());
      if (!result.modelFile().isEmpty()) body.put("whisperModelFile", result.modelFile());
      if (!result.missingPreference().isEmpty()) {
        body.put("whisperModelMissing", result.missingPreference());
      }
      return ResponseEntity.ok(body);
    } catch (Exception e) {
      log.warn("[api] POST /api/whisper/transcribe FAIL error={}", e.getMessage());
      return ResponseEntity.status(500).body(Map.of("error", "transcribe_failed"));
    } finally {
      if (temp != null) {
        try {
          Files.deleteIfExists(temp);
        } catch (Exception ignored) {
          // ignore
        }
      }
    }
  }

  /** 업로드 오디오 멜론 forced alignment (웹·Expo Go 트랙 편집용) */
  @PostMapping("/api/align/melon")
  public ResponseEntity<Map<String, Object>> alignUploadedMelonLyrics(
      @RequestParam("file") MultipartFile file,
      @RequestParam("lyricsPlain") String lyricsPlain,
      @RequestParam(value = "mode", defaultValue = "melon") String mode) {
    if (file == null || file.isEmpty()) {
      return ResponseEntity.badRequest().body(Map.of("error", "empty_file"));
    }
    if (lyricsPlain == null || lyricsPlain.isBlank()) {
      return ResponseEntity.badRequest().body(Map.of("error", "empty_lyrics"));
    }
    Path temp = null;
    try {
      String original = file.getOriginalFilename() != null ? file.getOriginalFilename() : "audio.mp3";
      String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : ".mp3";
      temp = paths.getOutputDir().resolve("nrm-align-upload-" + System.currentTimeMillis() + ext);
      Files.write(temp, file.getBytes());
      var result = alignLyricsService.alignAudioFileMelonLyrics(temp, lyricsPlain, mode, "");
      java.util.Map<String, Object> body = new java.util.LinkedHashMap<>();
      body.put("ok", !result.lrc().isBlank());
      body.put("lrcText", result.lrc());
      body.put("alignFailed", result.alignFailed());
      body.put("alignMemoryInsufficient", result.alignMemoryInsufficient());
      body.put("lyricsTranslationFailed", result.lyricsTranslationFailed());
      return ResponseEntity.ok(body);
    } catch (Exception e) {
      log.warn("[api] POST /api/align/melon FAIL error={}", e.getMessage());
      return ResponseEntity.status(500).body(Map.of("error", "align_failed"));
    } finally {
      if (temp != null) {
        try {
          Files.deleteIfExists(temp);
        } catch (Exception ignored) {
          // ignore
        }
      }
    }
  }

  @PostMapping("/api/download/whisper-lyrics")
  public ResponseEntity<Map<String, Object>> applyDownloadWhisperLyrics(
      @RequestBody AudioMetadataRequest req) {
    if (req.jobId == null || !SAFE_JOB_ID.matcher(req.jobId).matches()) {
      return ResponseEntity.badRequest().body(Map.of("error", "invalid_job_id"));
    }
    log.info(
        "[api] POST /api/download/whisper-lyrics jobId={} lyrics={} modelPref={}",
        req.jobId,
        req.lyrics,
        req.whisperModelPreference);
    try {
      var result = audioMetadataService.applyWhisperLyricsToJobFile(req.jobId, req);
      java.util.Map<String, Object> body = metadataResultBody(result);
      log.info("[api] POST /api/download/whisper-lyrics OK jobId={} body={}", req.jobId, body);
      return ResponseEntity.ok(body);
    } catch (IllegalStateException e) {
      String code = e.getMessage() != null ? e.getMessage() : "whisper_lyrics_failed";
      log.warn("[api] POST /api/download/whisper-lyrics FAIL jobId={} error={}", req.jobId, code);
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

  @PostMapping("/api/download/cleanup")
  public ResponseEntity<Map<String, Object>> cleanupDownloadArtifacts(
      @RequestBody CleanupRequest req) {
    String jobId = req != null ? req.jobId : null;
    log.info("[api] POST /api/download/cleanup jobId={}", jobId);
    if (jobId == null || !SAFE_JOB_ID.matcher(jobId).matches()) {
      return ResponseEntity.badRequest().body(Map.of("error", "invalid_job_id"));
    }
    Path baseDir = paths.getOutputDir().toAbsolutePath().normalize();
    int deleted = 0;
    try (var stream = Files.newDirectoryStream(baseDir, "nrm_" + jobId + ".*")) {
      for (Path candidate : stream) {
        Path normalized = candidate.toAbsolutePath().normalize();
        if (!normalized.startsWith(baseDir) || !Files.isRegularFile(normalized)) continue;
        try {
          if (Files.deleteIfExists(normalized)) deleted++;
        } catch (Exception ignored) {
          // best effort
        }
      }
    } catch (Exception ignored) {
      // best effort
    }
    log.info("[api] POST /api/download/cleanup OK jobId={} deleted={}", jobId, deleted);
    return ResponseEntity.ok(Map.of("ok", true, "deleted", deleted));
  }

  @GetMapping("/api/download/lrc")
  public ResponseEntity<Resource> downloadLrcFile(@RequestParam("jobId") String jobId) {
    if (jobId == null || !SAFE_JOB_ID.matcher(jobId).matches()) {
      return ResponseEntity.badRequest().build();
    }
    Path lrc = audioMetadataService.resolveJobLrcFile(jobId);
    if (lrc == null) {
      return ResponseEntity.notFound().build();
    }
    Resource resource = new FileSystemResource(lrc);
    String filename = lrc.getFileName().toString();
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
        .contentType(MediaType.parseMediaType("text/plain; charset=utf-8"))
        .body(resource);
  }

  private static Path resolveDownloadJobFile(Path baseDir, String jobId) {
    Path picked = null;
    try (var stream = Files.newDirectoryStream(baseDir, "nrm_" + jobId + ".*")) {
      for (Path candidate : stream) {
        Path normalized = candidate.normalize();
        if (!Files.isRegularFile(normalized) || !normalized.startsWith(baseDir)) continue;
        String ext = extensionOf(normalized.getFileName().toString());
        if (isAudioExtension(ext)) return normalized;
        if (picked == null) picked = normalized;
      }
    } catch (Exception ignored) {
      // fall through
    }
    if (picked != null) return picked;
    Path fallback = baseDir.resolve("nrm_" + jobId + ".mp3").normalize();
    if (Files.isRegularFile(fallback)) {
      return fallback;
    }
    return null;
  }

  private static String extensionOf(String name) {
    int dot = name.lastIndexOf('.');
    if (dot < 0) return "";
    return name.substring(dot).toLowerCase();
  }

  private static boolean isAudioExtension(String ext) {
    return ".mp3".equals(ext)
        || ".m4a".equals(ext)
        || ".wav".equals(ext)
        || ".opus".equals(ext)
        || ".flac".equals(ext)
        || ".ogg".equals(ext)
        || ".aac".equals(ext)
        || ".mp4".equals(ext);
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
    public String albumArtist;
    public String trackNumber;
    public String discNumber;
    public String composer;
    public String lyrics;
    public String bpm;
    public String copyright;
    public String website;
    public String producer;
    public String remixer;

    boolean hasMetadata() {
      return isNonBlank(artist)
          || isNonBlank(title)
          || isNonBlank(album)
          || isNonBlank(genre)
          || isNonBlank(releaseDate)
          || isNonBlank(coverUrl)
          || isNonBlank(albumArtist)
          || isNonBlank(trackNumber)
          || isNonBlank(website);
    }

    AudioMetadataRequest toMetadataRequest() {
      AudioMetadataRequest m = new AudioMetadataRequest();
      m.artist = artist;
      m.title = title;
      m.album = album;
      m.genre = genre;
      m.releaseDate = releaseDate;
      m.coverUrl = coverUrl;
      m.albumArtist = albumArtist;
      m.trackNumber = trackNumber;
      m.discNumber = discNumber;
      m.composer = composer;
      m.lyrics = lyrics;
      m.bpm = bpm;
      m.copyright = copyright;
      m.website = website;
      m.producer = producer;
      m.remixer = remixer;
      return m;
    }

    private static boolean isNonBlank(String s) {
      return s != null && !s.isBlank();
    }
  }

  public static class DeepLUsageRequest {
    public String apiKey;
  }

  public static class DeepLTranslateRequest {
    public String apiKey;
    public List<String> texts;
  }

  public static class CleanupRequest {
    public String jobId;
  }
}
