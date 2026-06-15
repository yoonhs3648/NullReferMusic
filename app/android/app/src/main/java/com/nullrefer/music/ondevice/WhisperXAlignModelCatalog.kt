package com.nullrefer.music.ondevice

/**
 * WhisperX-style wav2vec2 CTC forced alignment 에셋 (whisperx-align/ 디렉터리).
 * APK에 포함하지 않고 Hugging Face에서 기기로만 받는다.
 */
object WhisperXAlignModelCatalog {
  const val MODEL_ID = "whisperx:forced-align"

  data class AssetSpec(
      val fileName: String,
      val url: String,
      val minBytes: Long,
  )

  private const val KOREAN_BASE =
      "https://huggingface.co/kresnik/wav2vec2-large-xlsr-korean/resolve/main/"
  private const val ONNX_BASE =
      "https://huggingface.co/FinDIT-Studio/wav2vec2-large-xlsr-53-korean-onnx/resolve/main/"

  val ASSETS: List<AssetSpec> =
      listOf(
          AssetSpec("vocab.json", KOREAN_BASE + "vocab.json", 1_000L),
          AssetSpec("config.json", KOREAN_BASE + "config.json", 500L),
          AssetSpec(
              "preprocessor_config.json",
              KOREAN_BASE + "preprocessor_config.json",
              100L,
          ),
          AssetSpec("model.onnx", ONNX_BASE + "model.onnx", 50_000_000L),
      )

  /** 레거시 ggml-small 설치는 wav2vec2 FA로 인정하지 않음 */
  val LEGACY_IGNORE_FILES = setOf("ggml-small-q5_1.bin")
}
