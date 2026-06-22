package com.nullrefer.music.youtube;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nullrefer.music.config.NrmPaths;
import com.nullrefer.music.config.NrmSettings;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class YoutubeSearchService {

  private static final Logger log = LoggerFactory.getLogger(YoutubeSearchService.class);
  private static final int DEFAULT_PAGE_SIZE = 20;
  private static final int YTDLP_PREFETCH_SIZE = 50;
  private static final String YTDLP_CURSOR_PREFIX = "o:";

  private final NrmSettings settings;
  private final NrmPaths paths;
  private final ObjectMapper objectMapper;
  private final RestClient restClient = RestClient.create();
  private final ConcurrentHashMap<String, List<YoutubeSearchHit>> ytDlpCache =
      new ConcurrentHashMap<>();

  public YoutubeSearchService(NrmSettings settings, NrmPaths paths, ObjectMapper objectMapper) {
    this.settings = settings;
    this.paths = paths;
    this.objectMapper = objectMapper;
  }

  /** @deprecated 첫 페이지만 — {@link #searchPage(String, String, int)} 사용 */
  public List<YoutubeSearchHit> search(String query) {
    return searchPage(query, null, DEFAULT_PAGE_SIZE).items();
  }

  public YoutubeSearchPage searchPage(String query, String cursor, int limit) {
    int pageSize = Math.min(Math.max(limit, 1), 50);
    String key = settings.getYoutubeApiKey();
    if (key == null || key.isBlank()) {
      return searchPageWithYtDlp(query, cursor, pageSize);
    }
    return searchPageWithApi(query, cursor, pageSize, key);
  }

  private YoutubeSearchPage searchPageWithApi(
      String query, String pageToken, int pageSize, String key) {
    UriComponentsBuilder builder =
        UriComponentsBuilder.fromUriString("https://www.googleapis.com/youtube/v3/search")
            .queryParam("part", "snippet")
            .queryParam("type", "video")
            .queryParam("videoCategoryId", "10")
            .queryParam("videoEmbeddable", "true")
            .queryParam("maxResults", String.valueOf(pageSize))
            .queryParam("q", query)
            .queryParam("key", key);
    if (pageToken != null && !pageToken.isBlank()) {
      builder.queryParam("pageToken", pageToken);
    }
    String uri = builder.build(true).toUriString();

    String body =
        restClient
            .get()
            .uri(uri)
            .retrieve()
            .body(String.class);

    if (body == null || body.isBlank()) {
      return new YoutubeSearchPage(List.of(), null);
    }

    try {
      JsonNode root = objectMapper.readTree(body);
      if (root.hasNonNull("error")) {
        log.warn("YouTube API error: {}", root.get("error"));
        throw new IllegalStateException("youtube_api_error");
      }
      JsonNode items = root.path("items");
      if (!items.isArray()) {
        return new YoutubeSearchPage(List.of(), null);
      }
      List<YoutubeSearchHit> out = new ArrayList<>();
      for (JsonNode item : items) {
        YoutubeSearchHit hit = parseApiItem(item);
        if (hit != null) {
          out.add(hit);
        }
      }
      String nextToken = root.path("nextPageToken").asText("");
      String next = nextToken.isBlank() ? null : nextToken;
      return new YoutubeSearchPage(out, next);
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      log.warn("YouTube search parse failed", e);
      throw new IllegalStateException("youtube_parse_error");
    }
  }

  private static YoutubeSearchHit parseApiItem(JsonNode item) {
    String videoId = item.path("id").path("videoId").asText("");
    if (videoId.isEmpty()) {
      return null;
    }
    JsonNode sn = item.path("snippet");
    String title = sn.path("title").asText("");
    String channelTitle = sn.path("channelTitle").asText("");
    JsonNode thumbs = sn.path("thumbnails");
    String thumb =
        firstNonEmpty(
            thumbs.path("medium").path("url").asText(""),
            thumbs.path("high").path("url").asText(""),
            thumbs.path("default").path("url").asText(""));
    return new YoutubeSearchHit(videoId, title, channelTitle, thumb);
  }

  private YoutubeSearchPage searchPageWithYtDlp(String query, String cursor, int pageSize) {
    int offset = 0;
    if (cursor != null && cursor.startsWith(YTDLP_CURSOR_PREFIX)) {
      try {
        offset = Integer.parseInt(cursor.substring(YTDLP_CURSOR_PREFIX.length()));
      } catch (NumberFormatException e) {
        offset = 0;
      }
    }
    List<YoutubeSearchHit> all =
        ytDlpCache.computeIfAbsent(query, q -> searchWithYtDlpFull(q, YTDLP_PREFETCH_SIZE));
    if (offset >= all.size()) {
      return new YoutubeSearchPage(List.of(), null);
    }
    int end = Math.min(offset + pageSize, all.size());
    List<YoutubeSearchHit> slice = all.subList(offset, end);
    String next = end < all.size() ? YTDLP_CURSOR_PREFIX + end : null;
    return new YoutubeSearchPage(new ArrayList<>(slice), next);
  }

  private List<YoutubeSearchHit> searchWithYtDlpFull(String query, int prefetchSize) {
    if (!Files.isRegularFile(paths.getYtDlpPath())) {
      throw new IllegalStateException("youtube_api_key_missing");
    }
    List<String> cmd = new ArrayList<>();
    cmd.add(paths.getYtDlpPath().toString());
    cmd.add("--no-warnings");
    cmd.add("--dump-single-json");
    cmd.add("--skip-download");
    cmd.add("--flat-playlist");
    cmd.add("ytsearch" + prefetchSize + ":" + query);
    ProcessBuilder pb = new ProcessBuilder(cmd);
    pb.directory(paths.getRepoRoot().toFile());
    pb.redirectErrorStream(true);

    try {
      Process p = pb.start();
      String raw = readAll(p, StandardCharsets.UTF_8);
      int code = p.waitFor();
      if (code != 0) {
        log.warn("yt-dlp search failed: code={}, output={}", code, tail(raw, 1200));
        throw new IllegalStateException("youtube_api_error");
      }
      if (raw == null || raw.isBlank()) {
        return List.of();
      }
      JsonNode root = objectMapper.readTree(extractJsonPayload(raw));
      JsonNode entries = root.path("entries");
      if (!entries.isArray()) {
        return List.of();
      }
      List<YoutubeSearchHit> out = new ArrayList<>();
      for (JsonNode e : entries) {
        String videoId = e.path("id").asText("");
        if (videoId == null || videoId.isBlank()) {
          continue;
        }
        String title = e.path("title").asText("");
        String channelTitle =
            firstNonEmpty(e.path("channel").asText(""), e.path("uploader").asText(""), "");
        String thumb =
            firstNonEmpty(
                e.path("thumbnail").asText(""),
                "https://i.ytimg.com/vi/" + videoId + "/mqdefault.jpg",
                "");
        out.add(new YoutubeSearchHit(videoId, title, channelTitle, thumb));
      }
      return out;
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      log.warn("yt-dlp search parse failed", e);
      throw new IllegalStateException("youtube_parse_error");
    }
  }

  private static String extractJsonPayload(String raw) {
    if (raw == null || raw.isBlank()) {
      return raw == null ? "" : raw;
    }
    int start = raw.indexOf('{');
    if (start < 0) {
      return raw.trim();
    }
    int end = raw.lastIndexOf('}');
    if (end <= start) {
      return raw.substring(start).trim();
    }
    return raw.substring(start, end + 1);
  }

  private static String readAll(Process p, Charset cs) throws Exception {
    StringBuilder sb = new StringBuilder(8192);
    try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), cs))) {
      String line;
      while ((line = r.readLine()) != null) {
        sb.append(line).append('\n');
      }
    }
    return sb.toString();
  }

  private static String tail(String s, int maxChars) {
    if (s == null || s.length() <= maxChars) {
      return s == null ? "" : s;
    }
    return s.substring(s.length() - maxChars);
  }

  private static String firstNonEmpty(String a, String b, String c) {
    if (a != null && !a.isEmpty()) {
      return a;
    }
    if (b != null && !b.isEmpty()) {
      return b;
    }
    return c != null ? c : "";
  }
}
