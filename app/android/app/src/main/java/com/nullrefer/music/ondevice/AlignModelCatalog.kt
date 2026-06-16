package com.nullrefer.music.ondevice

/** JS `nrmAlignModelCatalog.ts` 와 동기 — Forced Alignment 엔진 */
object AlignModelCatalog {
  enum class EngineKind {
    AENEAS,
    CTC_ONNX,
  }

  data class AssetSpec(
      val fileName: String,
      val url: String,
      val minBytes: Long,
  )

  data class Entry(
      val id: String,
      val subDir: String,
      val label: String,
      val engine: EngineKind,
      val assets: List<AssetSpec>,
      /** APK assets 경로 — aeneas 등 번들 설치용 */
      val bundledAssetPaths: List<String> = emptyList(),
      /** ONNX 세션 로드 시 대략적 RAM 점유 (MB) */
      val onnxReserveMb: Long = 0L,
  )

  const val AENEAS_ID = "aeneas:sync"
  const val WAV2VEC2_KO_ID = "align:wav2vec2-ko"
  const val WAV2VEC2_EN_ID = "align:wav2vec2-en"
  /** @deprecated → WAV2VEC2_KO_ID */
  const val WAV2VEC2_BASE_ID = "align:wav2vec2-base"
  /** @deprecated */
  const val WAV2VEC2_BASE_INT8_ID = WAV2VEC2_BASE_ID

  /** 레거시 large wav2vec2 — 더 이상 사용하지 않음 */
  const val LEGACY_WAV2VEC2_LARGE_ID = "whisperx:forced-align"

  private const val BASE_KOREAN =
      "https://huggingface.co/Kkonjeong/wav2vec2-base-korean/resolve/main/"
  /** HF FinDIT-Studio 미업로드 — GitHub Release(공개·토큰 불필요) */
  private const val BASE_KO_ONNX =
      "https://github.com/yoonhs3648/NullReferMusic/releases/download/align-wav2vec2-base-v1/"

  private const val BASE_ENGLISH =
      "https://huggingface.co/facebook/wav2vec2-base-960h/resolve/main/"
  private const val BASE_EN_ONNX =
      "https://github.com/yoonhs3648/NullReferMusic/releases/download/align-wav2vec2-en-v1/"

  val ENTRIES: List<Entry> =
      listOf(
          Entry(
              id = WAV2VEC2_KO_ID,
              subDir = "wav2vec2-base",
              label = "wav2vec2-base (Korean)",
              engine = EngineKind.CTC_ONNX,
              onnxReserveMb = 220L,
              bundledAssetPaths =
                  listOf(
                      "nrm-align/wav2vec2-ko/vocab.json",
                      "nrm-align/wav2vec2-ko/config.json",
                      "nrm-align/wav2vec2-ko/preprocessor_config.json",
                  ),
              assets =
                  listOf(
                      AssetSpec("vocab.json", BASE_KOREAN + "vocab.json", 600L),
                      AssetSpec("config.json", BASE_KOREAN + "config.json", 2_000L),
                      AssetSpec(
                          "preprocessor_config.json",
                          BASE_KOREAN + "preprocessor_config.json",
                          100L,
                      ),
                      AssetSpec("model.onnx", BASE_KO_ONNX + "model.onnx", 360_000_000L),
                  ),
          ),
          Entry(
              id = WAV2VEC2_EN_ID,
              subDir = "wav2vec2-base-en",
              label = "wav2vec2-base (English)",
              engine = EngineKind.CTC_ONNX,
              onnxReserveMb = 220L,
              bundledAssetPaths =
                  listOf(
                      "nrm-align/wav2vec2-en/vocab.json",
                      "nrm-align/wav2vec2-en/config.json",
                      "nrm-align/wav2vec2-en/preprocessor_config.json",
                  ),
              assets =
                  listOf(
                      AssetSpec("vocab.json", BASE_ENGLISH + "vocab.json", 250L),
                      AssetSpec("config.json", BASE_ENGLISH + "config.json", 1_000L),
                      AssetSpec(
                          "preprocessor_config.json",
                          BASE_ENGLISH + "preprocessor_config.json",
                          100L,
                      ),
                      AssetSpec("model.onnx", BASE_EN_ONNX + "model.onnx", 360_000_000L),
                  ),
          ),
          Entry(
              id = AENEAS_ID,
              subDir = "aeneas-sync",
              label = "aeneas",
              engine = EngineKind.AENEAS,
              assets = emptyList(),
              bundledAssetPaths = listOf("nrm-aeneas/engine.json"),
          ),
      )

  private val BY_ID = ENTRIES.associateBy { it.id }

  fun entryById(modelId: String): Entry? = BY_ID[modelId.trim()]

  fun entryForPreference(preference: String?): Entry? {
    val pref = normalizePreference(preference)
    if (pref == WAV2VEC2_BASE_ID) return null
    return BY_ID[pref] ?: BY_ID[AENEAS_ID]
  }

  fun isBundleId(modelId: String): Boolean {
    return normalizePreference(modelId) == WAV2VEC2_BASE_ID
  }

  fun normalizePreference(preference: String?): String {
    val pref = (preference ?: "").trim()
    return when (pref) {
      LEGACY_WAV2VEC2_LARGE_ID,
      "align:wav2vec2-base-int8" -> WAV2VEC2_BASE_ID
      WAV2VEC2_KO_ID,
      WAV2VEC2_EN_ID -> WAV2VEC2_BASE_ID
      else -> pref
    }
  }

  /** 싱크 추론용 — KO/EN 팩 ID 그대로 반환 */
  fun normalizeAlignPackId(preference: String?): String {
    val pref = (preference ?: "").trim()
    return when (pref) {
      WAV2VEC2_KO_ID,
      WAV2VEC2_EN_ID -> pref
      LEGACY_WAV2VEC2_LARGE_ID,
      WAV2VEC2_BASE_ID,
      "align:wav2vec2-base-int8" -> WAV2VEC2_KO_ID
      else -> pref
    }
  }

  fun isWav2Vec2Id(modelId: String): Boolean {
    val id = normalizeAlignPackId(modelId)
    return id == WAV2VEC2_KO_ID || id == WAV2VEC2_EN_ID
  }

  fun displayLabel(modelId: String): String {
    return entryForPreference(modelId)?.label ?: modelId.substringAfter(':')
  }

  /** 구버전 FA 디렉터리 — cleanupLegacyArtifacts에서 전체 삭제 */
  val LEGACY_IGNORE_DIRS = setOf("whisperx-align", "wav2vec2-base-int8")
}
