package com.nullrefer.music.ondevice

/**
 * eunsour/en-ko-transliterator 온디바이스 패키지.
 *
 * HuggingFace 원본(mT5 ~2.3GB)은 기기에서 바로 받지 않는다 — Xet CDN 401·권한 이슈 회피.
 * PC에서 ONNX(+토크나이저)로 변환 후 GitHub Release에 올린 산출물만 받는다.
 * (wav2vec2-base 와 동일 패턴. 실행 바이너리는 받지 않음 → eSpeak W^X 실패 재발 방지)
 */
object EnKoTransliteratorCatalog {
  const val ID = "en-ko-transliterator:install"
  const val RELEASE_TAG = "en-ko-transliterator-v2"
  private const val BASE_URL =
      "https://github.com/yoonhs3648/NullReferMusic/releases/download/$RELEASE_TAG"

  data class AssetSpec(
      val fileName: String,
      val url: String,
      val minBytes: Long,
  )

  /** 앱 filesDir 에만 저장되는 데이터 파일 (실행권한·chmod 불필요) */
  val ASSETS: List<AssetSpec> =
      listOf(
          AssetSpec("encoder.onnx", "$BASE_URL/encoder.onnx", 50_000_000L),
          AssetSpec("decoder.onnx", "$BASE_URL/decoder.onnx", 50_000_000L),
          AssetSpec("spiece.model", "$BASE_URL/spiece.model", 1_000_000L),
          AssetSpec("unigram_pieces.tsv", "$BASE_URL/unigram_pieces.tsv", 1_000_000L),
          AssetSpec("tokenizer_meta.json", "$BASE_URL/tokenizer_meta.json", 64L),
      )
}
