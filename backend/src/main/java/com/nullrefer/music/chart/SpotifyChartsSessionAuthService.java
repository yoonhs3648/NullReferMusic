package com.nullrefer.music.chart;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * charts.spotify.com용 Bearer — {@code sp_dc}(+{@code sp_key}) 쿠키 또는 계정 로그인으로
 * open.spotify.com get_access_token을 발급·캐시합니다.
 */
@Service
public class SpotifyChartsSessionAuthService {

  private static final Logger log = LoggerFactory.getLogger(SpotifyChartsSessionAuthService.class);
  private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(30);
  private static final String TOKEN_URL =
      "https://open.spotify.com/get_access_token?reason=transport&productType=web_player";
  private static final String LOGIN_URL =
      "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F";
  private static final Pattern FLOW_CTX_IN_HTML =
      Pattern.compile("flow_ctx=([^&\"]+)", Pattern.CASE_INSENSITIVE);
  private static final Pattern CSRF_IN_NEXT_DATA =
      Pattern.compile(
          "\"headers\"\\s*:\\s*\\{[^}]*\"csrfToken\"\\s*:\\s*\"([^\"]+)\"",
          Pattern.CASE_INSENSITIVE);
  private static final Pattern CSRF_TOKEN_FALLBACK =
      Pattern.compile("\"csrfToken\"\\s*:\\s*\"([^\"]+)\"", Pattern.CASE_INSENSITIVE);

  private final ObjectMapper objectMapper;
  private final ConcurrentHashMap<String, CachedToken> cache = new ConcurrentHashMap<>();

  public SpotifyChartsSessionAuthService(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public String bearerOrThrow(String username, String password, String spDc, String spKey) {
    String dc = spDc != null ? spDc.trim() : "";
    String key = spKey != null ? spKey.trim() : "";
    boolean hasPassword = password != null && !password.isBlank();
    if (dc.isEmpty() && !hasPassword) {
      throw new IllegalStateException("spotify_charts_not_configured");
    }
    String user = normalize(username);
    if (user.isEmpty()) {
      user = "nrm-charts-webview";
    }
    String cacheKey =
        dc.isEmpty()
            ? user
            : user + ":spdc:" + dc.length() + ":" + dc.hashCode() + ":spk:" + key.hashCode();
    CachedToken hit = cache.get(cacheKey);
    if (hit != null && hit.isValid()) {
      return hit.accessToken();
    }
    CachedToken fresh =
        dc.isEmpty() ? loginWithPassword(user, password) : tokenFromSpDc(user, dc, key);
    cache.put(cacheKey, fresh);
    return fresh.accessToken();
  }

  public void invalidate(String username) {
    String user = normalize(username);
    cache.keySet().removeIf(key -> key.equals(user) || key.startsWith(user + ":spdc:"));
  }

  private CachedToken tokenFromSpDc(String username, String spDc, String spKey) {
    List<String> cookieAttempts = new ArrayList<>();
    cookieAttempts.add(buildCookieHeader(spDc, spKey));
    if (spKey != null && !spKey.isBlank()) {
      cookieAttempts.add(buildCookieHeader(spDc, ""));
    }
    IllegalStateException lastFailure = null;
    for (String cookieHeader : cookieAttempts) {
      try {
        return fetchAccessTokenWithCookieHeader(cookieHeader, "sp_dc session for " + username);
      } catch (IllegalStateException e) {
        lastFailure = e;
      } catch (Exception e) {
        log.warn("Spotify charts sp_dc session failed", e);
        lastFailure = new IllegalStateException("spotify_charts_login_failed");
      }
    }
    if (lastFailure != null) {
      throw lastFailure;
    }
    throw new IllegalStateException("spotify_charts_login_failed");
  }

  private CachedToken loginWithPassword(String username, String password) {
    CookieManager cookies = newCookieJar();
    HttpClient client = httpClient(cookies);
    try {
      String loginHtml = httpGet(client, LOGIN_URL);
      String csrf =
          extractCsrf(loginHtml, cookies)
              .orElseThrow(() -> new IllegalStateException("spotify_charts_login_failed"));
      String flowCtxEncoded =
          extractFlowCtxEncoded(loginHtml)
              .orElseThrow(() -> new IllegalStateException("spotify_charts_login_failed"));
      String flowCtx = URLDecoder.decode(flowCtxEncoded, StandardCharsets.UTF_8);
      String continueUrl = "https://open.spotify.com/?flow_ctx=" + flowCtx;

      Map<String, String> fields = new LinkedHashMap<>();
      fields.put("username", username);
      fields.put("password", password);
      fields.put("remember", "true");
      fields.put("flow_ctx", flowCtx);
      fields.put("continue", continueUrl);

      String referer =
          "https://accounts.spotify.com/en/login?flow_ctx="
              + URLEncoder.encode(flowCtx, StandardCharsets.UTF_8);
      HttpResponse<String> passwordRes =
          postForm(
              client,
              "https://accounts.spotify.com/login/password",
              csrf,
              referer,
              fields);

      if (!hasSessionCookie(cookies)) {
        String snippet = truncate(passwordRes.body(), 240);
        log.warn(
            "Spotify charts login: no sp_dc cookie (status={}, body={})",
            passwordRes.statusCode(),
            snippet);
        throw new IllegalStateException("spotify_charts_login_failed");
      }

      String cookieHeader = cookieHeaderFromJar(cookies);
      return fetchAccessTokenWithCookieHeader(cookieHeader, "password login for " + username);
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      log.warn("Spotify charts session login failed", e);
      throw new IllegalStateException("spotify_charts_login_failed");
    }
  }

  private CachedToken fetchAccessTokenWithCookieHeader(String cookieHeader, String context)
      throws Exception {
    HttpClient client = spotifyHttpClient();

    warmupSpotifySession(client, cookieHeader);

    try {
      String tokenJson =
          httpGetWithCookie(
              client, TOKEN_URL, cookieHeader, true, "https://open.spotify.com/");
      return parseAccessTokenJson(tokenJson, context);
    } catch (IllegalStateException httpClientFailure) {
      Optional<String> curlJson = fetchAccessTokenViaCurl(cookieHeader);
      if (curlJson.isPresent()) {
        log.info("Spotify get_access_token: HttpClient failed, curl.exe succeeded ({})", context);
        return parseAccessTokenJson(curlJson.get(), context);
      }
      throw httpClientFailure;
    }
  }

  private static HttpClient spotifyHttpClient() {
    return HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(HTTP_TIMEOUT)
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();
  }

  private void warmupSpotifySession(HttpClient client, String cookieHeader) {
    try {
      httpGetWithCookie(
          client, "https://open.spotify.com/", cookieHeader, false, "https://open.spotify.com/");
    } catch (Exception e) {
      log.debug("Spotify open.spotify.com warmup skipped: {}", e.getMessage());
    }
  }

  private CachedToken parseAccessTokenJson(String tokenJson, String context) throws Exception {
    if (tokenJson.trim().startsWith("<")) {
      log.warn(
          "Spotify charts: get_access_token returned HTML ({}) snippet={}",
          context,
          truncate(tokenJson, 160));
      failTokenFetch(tokenJson);
    }

    JsonNode root = objectMapper.readTree(tokenJson);
    String accessToken = root.path("accessToken").asText("");
    long expMs = root.path("accessTokenExpirationTimestampMs").asLong(0);
    if (accessToken.isBlank()) {
      log.warn(
          "Spotify charts: empty accessToken ({}) body={}",
          context,
          truncate(tokenJson, 200));
      throw new IllegalStateException("spotify_charts_login_failed");
    }
    Instant expiresAt =
        expMs > 0
            ? Instant.ofEpochMilli(expMs).minus(Duration.ofMinutes(2))
            : Instant.now().plus(Duration.ofMinutes(45));
    return new CachedToken(accessToken, expiresAt);
  }

  /** Windows: 브라우저 curl 과 동일 스택으로 토큰 발급 (Java HttpClient 403 우회). */
  private Optional<String> fetchAccessTokenViaCurl(String cookieHeader) {
    String os = System.getProperty("os.name", "").toLowerCase();
    if (!os.contains("win")) {
      return Optional.empty();
    }
    try {
      ProcessBuilder pb =
          new ProcessBuilder(
              "curl.exe",
              "-s",
              "-S",
              "--http1.1",
              "-H",
              "Cookie: " + cookieHeader,
              "-H",
              "Accept: application/json",
              "-H",
              "Origin: https://open.spotify.com",
              "-H",
              "Referer: https://open.spotify.com/",
              "-H",
              "User-Agent: " + userAgent(),
              TOKEN_URL);
      pb.redirectErrorStream(true);
      Process process = pb.start();
      String body;
      try (InputStream in = process.getInputStream()) {
        body = new String(in.readAllBytes(), StandardCharsets.UTF_8);
      }
      int code = process.waitFor();
      if (code != 0 || body.isBlank() || body.trim().startsWith("<")) {
        log.warn(
            "Spotify curl get_access_token failed (exit={}, snippet={})",
            code,
            truncate(body, 120));
        if (isVarnishUrlBlocked(body)) {
          throw new IllegalStateException("spotify_charts_access_blocked");
        }
        return Optional.empty();
      }
      return Optional.of(body);
    } catch (Exception e) {
      log.warn("Spotify curl get_access_token unavailable: {}", e.getMessage());
      return Optional.empty();
    }
  }

  private static String buildCookieHeader(String spDc, String spKey) {
    StringBuilder sb = new StringBuilder("sp_dc=").append(spDc.trim());
    if (spKey != null && !spKey.isBlank()) {
      sb.append("; sp_key=").append(spKey.trim());
    }
    return sb.toString();
  }

  private static String cookieHeaderFromJar(CookieManager cookies) {
    StringBuilder sb = new StringBuilder();
    for (HttpCookie cookie : cookies.getCookieStore().getCookies()) {
      if (cookie.getValue() == null || cookie.getValue().isBlank()) {
        continue;
      }
      if ("sp_dc".equals(cookie.getName()) || "sp_key".equals(cookie.getName())) {
        if (sb.length() > 0) {
          sb.append("; ");
        }
        sb.append(cookie.getName()).append('=').append(cookie.getValue());
      }
    }
    return sb.toString();
  }

  private static CookieManager newCookieJar() {
    return new CookieManager(null, CookiePolicy.ACCEPT_ALL);
  }

  private static HttpClient httpClient(CookieManager cookies) {
    return HttpClient.newBuilder()
        .cookieHandler(cookies)
        .connectTimeout(HTTP_TIMEOUT)
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();
  }

  private static boolean hasSessionCookie(CookieManager manager) {
    for (HttpCookie cookie : manager.getCookieStore().getCookies()) {
      if ("sp_dc".equals(cookie.getName())
          && cookie.getValue() != null
          && !cookie.getValue().isBlank()) {
        return true;
      }
    }
    return false;
  }

  private static Optional<String> extractCsrf(String html, CookieManager cookies) {
    Matcher m = CSRF_IN_NEXT_DATA.matcher(html);
    if (m.find()) {
      return Optional.of(m.group(1));
    }
    m = CSRF_TOKEN_FALLBACK.matcher(html);
    if (m.find()) {
      return Optional.of(m.group(1));
    }
    for (HttpCookie cookie : cookies.getCookieStore().getCookies()) {
      if ("sp_sso_csrf_token".equals(cookie.getName())
          && cookie.getValue() != null
          && !cookie.getValue().isBlank()) {
        return Optional.of(cookie.getValue());
      }
    }
    return Optional.empty();
  }

  private static Optional<String> extractFlowCtxEncoded(String html) {
    Matcher m = FLOW_CTX_IN_HTML.matcher(html);
    if (m.find()) {
      return Optional.of(m.group(1));
    }
    return Optional.empty();
  }

  private HttpResponse<String> postForm(
      HttpClient client,
      String url,
      String csrf,
      String referer,
      Map<String, String> fields)
      throws Exception {
    String body = encodeForm(fields);
    HttpRequest req =
        HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(HTTP_TIMEOUT)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Accept", "application/json")
            .header("User-Agent", userAgent())
            .header("Origin", "https://accounts.spotify.com")
            .header("Referer", referer)
            .header("X-Csrf-Token", csrf)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
    return client.send(req, HttpResponse.BodyHandlers.ofString());
  }

  private static String encodeForm(Map<String, String> fields) {
    StringBuilder sb = new StringBuilder();
    for (Map.Entry<String, String> entry : fields.entrySet()) {
      if (sb.length() > 0) {
        sb.append('&');
      }
      sb.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8));
      sb.append('=');
      sb.append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
    }
    return sb.toString();
  }

  private static String httpGet(HttpClient client, String url) throws Exception {
    return httpGet(client, url, false);
  }

  private static String httpGet(HttpClient client, String url, boolean spotifyOrigin)
      throws Exception {
    HttpRequest.Builder builder =
        HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(HTTP_TIMEOUT)
            .header("User-Agent", userAgent())
            .header("Accept", "application/json, text/html;q=0.9,*/*;q=0.8");
    if (spotifyOrigin) {
      builder.header("Origin", "https://open.spotify.com");
      builder.header("Referer", "https://open.spotify.com/");
    }
    HttpResponse<String> res =
        client.send(builder.GET().build(), HttpResponse.BodyHandlers.ofString());
    if (res.statusCode() >= 400) {
      throw new IllegalStateException("spotify_charts_login_failed");
    }
    return res.body() != null ? res.body() : "";
  }

  private static String httpGetWithCookie(
      HttpClient client,
      String url,
      String cookieHeader,
      boolean jsonOnly,
      String referer)
      throws Exception {
    HttpRequest.Builder builder =
        HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(HTTP_TIMEOUT)
            .header("User-Agent", userAgent())
            .header("Cookie", cookieHeader)
            .header("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7")
            .header("Accept", jsonOnly ? "application/json" : "application/json, text/html;q=0.9");
    if (jsonOnly) {
      builder
          .header("sec-fetch-dest", "empty")
          .header("sec-fetch-mode", "cors")
          .header("sec-fetch-site", "same-origin");
    }
    if (referer != null) {
      builder.header("Referer", referer);
      if (referer.contains("charts.spotify.com")) {
        builder.header("Origin", "https://charts.spotify.com");
      } else {
        builder.header("Origin", "https://open.spotify.com");
      }
    }
    HttpResponse<String> res =
        client.send(builder.GET().build(), HttpResponse.BodyHandlers.ofString());
    if (res.statusCode() >= 400) {
      String body = res.body() != null ? res.body() : "";
      log.warn(
          "Spotify HTTP {} for {} (jsonOnly={}) snippet={}",
          res.statusCode(),
          url,
          jsonOnly,
          truncate(body, 160));
      failTokenFetch(body);
    }
    return res.body() != null ? res.body() : "";
  }

  private static void failTokenFetch(String body) {
    if (isVarnishUrlBlocked(body)) {
      throw new IllegalStateException("spotify_charts_access_blocked");
    }
    throw new IllegalStateException("spotify_charts_login_failed");
  }

  private static boolean isVarnishUrlBlocked(String body) {
    if (body == null || body.isBlank()) {
      return false;
    }
    return body.contains("403 URL Blocked")
        || body.contains("Error 54113")
        || body.contains("Varnish cache server");
  }

  private static String userAgent() {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  }

  private static String normalize(String raw) {
    return raw != null ? raw.trim().toLowerCase() : "";
  }

  private static String truncate(String raw, int max) {
    if (raw == null) {
      return "";
    }
    String s = raw.replace('\n', ' ').trim();
    return s.length() <= max ? s : s.substring(0, max);
  }

  private record CachedToken(String accessToken, Instant expiresAt) {
    boolean isValid() {
      return accessToken != null
          && !accessToken.isBlank()
          && expiresAt.isAfter(Instant.now().plus(Duration.ofMinutes(1)));
    }
  }
}
