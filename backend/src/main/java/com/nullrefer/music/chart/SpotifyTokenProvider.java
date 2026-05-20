package com.nullrefer.music.chart;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nullrefer.music.config.NrmSettings;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * Client Credentials 토큰을 서버 메모리에만 캐시합니다. DB·클라이언트 비밀 영구 저장 없음.
 */
@Component
public class SpotifyTokenProvider {

  private static final Logger log = LoggerFactory.getLogger(SpotifyTokenProvider.class);

  private final NrmSettings settings;
  private final ObjectMapper objectMapper;
  private final RestClient restClient = RestClient.create();
  private final ConcurrentHashMap<String, CachedToken> cacheByClientId = new ConcurrentHashMap<>();

  public SpotifyTokenProvider(NrmSettings settings, ObjectMapper objectMapper) {
    this.settings = settings;
    this.objectMapper = objectMapper;
  }

  public boolean isConfigured() {
    return isConfigured(settings.getSpotifyClientId(), settings.getSpotifyClientSecret());
  }

  public boolean isConfigured(String clientId, String clientSecret) {
    return clientId != null
        && !clientId.isBlank()
        && clientSecret != null
        && !clientSecret.isBlank();
  }

  public String bearerOrThrow() {
    return bearerOrThrow(settings.getSpotifyClientId(), settings.getSpotifyClientSecret());
  }

  public String bearerOrThrow(String clientId, String clientSecret) {
    return issueToken(clientId, clientSecret).accessToken();
  }

  public SpotifyTokenResponse issueToken(String clientId, String clientSecret) {
    if (!isConfigured(clientId, clientSecret)) {
      throw new IllegalStateException("spotify_not_configured");
    }
    CachedToken cached = cacheByClientId.get(clientId);
    if (cached != null && Instant.now().isBefore(cached.expiresAt().minusSeconds(60))) {
      return toResponse(cached);
    }
    synchronized (clientId.intern()) {
      cached = cacheByClientId.get(clientId);
      if (cached != null && Instant.now().isBefore(cached.expiresAt().minusSeconds(60))) {
        return toResponse(cached);
      }
      CachedToken fresh = requestToken(clientId, clientSecret);
      cacheByClientId.put(clientId, fresh);
      return toResponse(fresh);
    }
  }

  private static SpotifyTokenResponse toResponse(CachedToken cached) {
    long secondsLeft = Math.max(0, cached.expiresAt().getEpochSecond() - Instant.now().getEpochSecond());
    return new SpotifyTokenResponse(cached.accessToken(), (int) secondsLeft, "Bearer");
  }

  private CachedToken requestToken(String clientId, String clientSecret) {
    String basic =
        Base64.getEncoder()
            .encodeToString((clientId + ":" + clientSecret).getBytes(StandardCharsets.UTF_8));

    MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
    form.add("grant_type", "client_credentials");

    String body =
        restClient
            .post()
            .uri("https://accounts.spotify.com/api/token")
            .header("Authorization", "Basic " + basic)
            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .body(form)
            .retrieve()
            .body(String.class);

    if (body == null || body.isBlank()) {
      log.warn("Spotify token response empty");
      throw new IllegalStateException("spotify_auth_failed");
    }
    try {
      JsonNode root = objectMapper.readTree(body);
      if (root.hasNonNull("error")) {
        log.warn("Spotify token error: {}", root.get("error"));
        throw new IllegalStateException("spotify_auth_failed");
      }
      String token = root.path("access_token").asText("");
      int expiresIn = root.path("expires_in").asInt(3600);
      if (token.isBlank()) {
        throw new IllegalStateException("spotify_auth_failed");
      }
      return new CachedToken(token, Instant.now().plusSeconds(expiresIn));
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      log.warn("Spotify token parse failed", e);
      throw new IllegalStateException("spotify_auth_failed");
    }
  }

  private record CachedToken(String accessToken, Instant expiresAt) {}
}
