package com.nullrefer.music.download;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** PC align 모델 상태 — aeneas는 항상 사용 가능, wav2vec2는 library 폴더 기준. */
@Service
public class AlignModelStatusService {

  private static final String AENEAS_ID = "aeneas:sync";
  private static final String WAV2VEC2_BASE_ID = "align:wav2vec2-base";
  private static final String WAV2VEC2_KO_ID = "align:wav2vec2-ko";
  private static final String WAV2VEC2_EN_ID = "align:wav2vec2-en";

  private final com.nullrefer.music.config.NrmPaths paths;

  public AlignModelStatusService(com.nullrefer.music.config.NrmPaths paths) {
    this.paths = paths;
  }

  public List<Map<String, Object>> listStatuses() {
    List<Map<String, Object>> out = new ArrayList<>();
    out.add(statusRow(AENEAS_ID, true, false, 100));
    boolean koOk = isPackInstalled(WAV2VEC2_KO_ID);
    boolean enOk = isPackInstalled(WAV2VEC2_EN_ID);
    Map<String, Object> bundle = new LinkedHashMap<>();
    bundle.put("modelId", WAV2VEC2_BASE_ID);
    bundle.put("installed", koOk && enOk);
    bundle.put("downloading", false);
    bundle.put("progress", koOk && enOk ? 100 : 0);
    out.add(bundle);
    out.add(statusRow(WAV2VEC2_KO_ID, koOk, false, koOk ? 100 : 0));
    out.add(statusRow(WAV2VEC2_EN_ID, enOk, false, enOk ? 100 : 0));
    return out;
  }

  public boolean isAnyModelInstalled() {
    return true;
  }

  public boolean isModelInstalled(String modelId) {
    if (modelId == null) return false;
    String id = modelId.trim();
    if (AENEAS_ID.equals(id)) return true;
    if (WAV2VEC2_BASE_ID.equals(id)) {
      return isPackInstalled(WAV2VEC2_KO_ID) && isPackInstalled(WAV2VEC2_EN_ID);
    }
    if (WAV2VEC2_KO_ID.equals(id)) return isPackInstalled(WAV2VEC2_KO_ID);
    if (WAV2VEC2_EN_ID.equals(id)) return isPackInstalled(WAV2VEC2_EN_ID);
    return false;
  }

  private boolean isPackInstalled(String packId) {
    Path dir = alignPackDir(packId);
    Path model = dir.resolve("model.onnx");
    Path vocab = dir.resolve("vocab.json");
    return Files.isRegularFile(model) && Files.isRegularFile(vocab);
  }

  private Path alignPackDir(String packId) {
    String folder =
        WAV2VEC2_KO_ID.equals(packId)
            ? "wav2vec2-ko"
            : WAV2VEC2_EN_ID.equals(packId) ? "wav2vec2-en" : packId;
    return paths.getRepoRoot().resolve("library/wav2vec2-align").resolve(folder);
  }

  private static Map<String, Object> statusRow(
      String modelId, boolean installed, boolean downloading, int progress) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("modelId", modelId);
    row.put("installed", installed);
    row.put("downloading", downloading);
    row.put("progress", progress);
    return row;
  }
}
