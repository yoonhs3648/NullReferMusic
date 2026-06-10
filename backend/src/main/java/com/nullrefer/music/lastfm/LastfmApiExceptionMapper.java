package com.nullrefer.music.lastfm;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestClientResponseException;

/** Last.fm JSON/HTTP 오류를 앱 공통 코드(lastfm_auth_failed 등)로 변환합니다. */
public final class LastfmApiExceptionMapper {

  private static final Logger log = LoggerFactory.getLogger(LastfmApiExceptionMapper.class);

  private LastfmApiExceptionMapper() {}

  public static boolean isAuthErrorCode(int code) {
    return code == 4 || code == 9 || code == 10 || code == 26;
  }

  /**
   * HTTP 200 본문에 {@code error} 필드가 있을 때. 없으면 아무 것도 하지 않습니다.
   */
  public static void throwIfJsonError(JsonNode root) {
    if (root == null || !root.has("error")) {
      return;
    }
    int code = root.path("error").asInt(0);
    log.warn("Last.fm API error {} message={}", code, root.path("message").asText(""));
    if (isAuthErrorCode(code)) {
      throw new IllegalStateException("lastfm_auth_failed");
    }
    if (code == 6) {
      String msg = root.path("message").asText("").toLowerCase();
      if (msg.contains("country")) {
        throw new IllegalStateException("lastfm_country_invalid");
      }
      throw new IllegalStateException("lastfm_api_error");
    }
    if (code == 7) {
      throw new IllegalStateException("lastfm_api_error");
    }
    if (code == 29) {
      throw new IllegalStateException("lastfm_rate_limited");
    }
    throw new IllegalStateException("lastfm_api_error");
  }

  /** Last.fm가 401/403 등으로 응답할 때 본문의 {@code error:10} 등을 파싱합니다. */
  public static void throwFromHttpException(
      RestClientResponseException e, ObjectMapper objectMapper) {
    String body = e.getResponseBodyAsString();
    if (body != null && !body.isBlank()) {
      try {
        JsonNode root = objectMapper.readTree(body);
        if (root.has("error")) {
          throwIfJsonError(root);
        }
      } catch (IllegalStateException ex) {
        throw ex;
      } catch (JsonProcessingException ignored) {
        // fall through to status-based mapping
      }
    }
    int status = e.getStatusCode().value();
    if (status == 429) {
      throw new IllegalStateException("lastfm_rate_limited");
    }
    if (status == 401 || status == 403) {
      throw new IllegalStateException("lastfm_auth_failed");
    }
    throw new IllegalStateException("lastfm_api_error");
  }
}
