package com.nullrefer.music.download;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** PC Whisper 모델 설치·다운로드 상태 (앱 카탈로그 5종) */
@Service
public class WhisperModelStatusService {

  private final WhisperModelDownloader downloader;

  public WhisperModelStatusService(WhisperModelDownloader downloader) {
    this.downloader = downloader;
  }

  public List<Map<String, Object>> listStatuses() {
    List<Map<String, Object>> out = new ArrayList<>();
    for (WhisperModelDownloader.ModelStatus s : downloader.listStatuses()) {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("modelId", s.modelId());
      row.put("installed", s.installed());
      row.put("downloading", s.downloading());
      row.put("progress", s.progress());
      if (s.installed()) {
        Path file = downloader.resolveInstalledModel(s.modelId());
        if (file != null) {
          row.put("fileName", file.getFileName().toString());
          try {
            row.put("bytes", Files.size(file));
          } catch (Exception ignored) {
            row.put("bytes", 0);
          }
        }
      }
      out.add(row);
    }
    return out;
  }

  public boolean isModelInstalled(String modelId) {
    return downloader.isModelInstalled(modelId);
  }

  public boolean hasAnyModelInstalled() {
    return downloader.hasAnyModelInstalled();
  }

  public Path resolveInstalledModel(String modelPreference) {
    return downloader.resolveInstalledModel(modelPreference);
  }

  public void startDownload(String modelId) {
    downloader.startDownload(modelId);
  }
}
