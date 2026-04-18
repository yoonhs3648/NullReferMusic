package com.nullrefer.music.web;

import com.nullrefer.music.download.YtDlpDownloadService;
import com.nullrefer.music.download.YtDlpDownloadService.DownloadOutcome;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ApiController {

  private final YtDlpDownloadService downloadService;

  public ApiController(YtDlpDownloadService downloadService) {
    this.downloadService = downloadService;
  }

  @GetMapping("/api/health")
  public Map<String, Object> health() {
    return downloadService.health();
  }

  @PostMapping("/api/download")
  public ResponseEntity<Map<String, Object>> download(@RequestBody DownloadRequest req) {
    boolean noPlaylist = req.noPlaylist == null || req.noPlaylist;
    DownloadOutcome out = downloadService.download(req.url != null ? req.url : "", noPlaylist);
    return ResponseEntity.status(out.status()).body(out.body());
  }

  public static class DownloadRequest {
    public String url;
    public Boolean noPlaylist;
  }
}
