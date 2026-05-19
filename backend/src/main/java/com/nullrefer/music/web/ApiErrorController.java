package com.nullrefer.music.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.boot.web.servlet.error.ErrorAttributes;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.ServletWebRequest;

@RestController
public class ApiErrorController implements ErrorController {

  private final ErrorAttributes errorAttributes;

  public ApiErrorController(ErrorAttributes errorAttributes) {
    this.errorAttributes = errorAttributes;
  }

  @RequestMapping("/error")
  public ResponseEntity<?> handleError(HttpServletRequest req) {
    String originalPath = (String) req.getAttribute("jakarta.servlet.error.request_uri");
    String path = originalPath != null ? originalPath : req.getRequestURI();
    if (path == null || !path.startsWith("/api")) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Not Found");
    }

    Map<String, Object> attrs =
        errorAttributes.getErrorAttributes(
            new ServletWebRequest(req), ErrorAttributeOptions.of(ErrorAttributeOptions.Include.MESSAGE));
    int statusCode = (int) attrs.getOrDefault("status", 500);
    HttpStatus status = HttpStatus.resolve(statusCode);
    if (status == null) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    String message = String.valueOf(attrs.getOrDefault("message", "unexpected_error"));
    return ResponseEntity.status(status)
        .body(
            Map.of(
                "error", status == HttpStatus.NOT_FOUND ? "api_route_not_found" : "api_error",
                "path", String.valueOf(attrs.getOrDefault("path", path)),
                "status", status.value(),
                "message", message));
  }
}
