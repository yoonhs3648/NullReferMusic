package com.nullrefer.music.download;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 앱 `nrmWhisperCatalog.ts` 와 동일한 5종 Whisper 모델 ID */
public final class WhisperModelCatalog {

  private record Entry(String id, List<String> ggmlFiles, long minBytes) {}

  private static final Map<String, Entry> BY_ID = new LinkedHashMap<>();
  private static final Map<String, Long> MIN_BYTES_BY_FILE = new LinkedHashMap<>();

  static {
    put("whisper:large-v3-turbo", 300_000_000L, "ggml-large-v3-turbo.bin", "ggml-large-v3-turbo-q5_0.bin");
    put("whisper:large-v3", 700_000_000L, "ggml-large-v3.bin", "ggml-large-v3-q5_0.bin");
    put("whisper:medium", 300_000_000L, "ggml-medium.bin", "ggml-medium-q5_0.bin");
    put("whisper:small", 100_000_000L, "ggml-small.bin", "ggml-small-q5_1.bin");
    put("whisper:base", 50_000_000L, "ggml-base.bin", "ggml-base-q5_1.bin");
  }

  private WhisperModelCatalog() {}

  private static void put(String id, long minBytes, String... files) {
    BY_ID.put(id, new Entry(id, List.of(files), minBytes));
    for (String f : files) {
      MIN_BYTES_BY_FILE.put(f, minBytes);
    }
  }

  public static long minBytesFor(String fileName) {
    return MIN_BYTES_BY_FILE.getOrDefault(fileName, 10_000_000L);
  }

  public static List<String> ggmlOrderForPreference(String modelPreference) {
    String pref = trim(modelPreference);
    Entry entry = BY_ID.get(pref);
    if (entry == null) {
      entry = migrateLegacy(pref);
    }
    if (entry == null) {
      entry = BY_ID.get("whisper:large-v3-turbo");
    }
    return new ArrayList<>(entry.ggmlFiles());
  }

  private static Entry migrateLegacy(String pref) {
    if (pref == null || pref.isEmpty()) {
      return null;
    }
    return switch (pref) {
      case "profile:fast" -> BY_ID.get("whisper:base");
      case "profile:balanced" -> BY_ID.get("whisper:medium");
      case "profile:quality" -> BY_ID.get("whisper:large-v3");
      case "model:ggml-large-v3-turbo-q5_0.bin", "model:ggml-large-v3-turbo.bin" ->
          BY_ID.get("whisper:large-v3-turbo");
      case "model:ggml-large-v3-q5_0.bin", "model:ggml-large-v3.bin" -> BY_ID.get("whisper:large-v3");
      case "model:ggml-medium-q5_0.bin", "model:ggml-medium.bin" -> BY_ID.get("whisper:medium");
      case "model:ggml-small-q5_1.bin", "model:ggml-small.bin" -> BY_ID.get("whisper:small");
      case "model:ggml-base-q5_1.bin",
          "model:ggml-base.bin",
          "model:ggml-base.en-q5_1.bin",
          "model:ggml-base.en.bin",
          "model:ggml-tiny-q5_1.bin",
          "model:ggml-tiny.bin" ->
          BY_ID.get("whisper:base");
      default ->
          pref.startsWith("model:")
              ? BY_ID.values().stream()
                  .filter(e -> e.ggmlFiles().contains(pref.substring("model:".length()).trim()))
                  .findFirst()
                  .orElse(null)
              : null;
    };
  }

  private static String trim(String v) {
    return v == null ? "" : v.trim();
  }
}
