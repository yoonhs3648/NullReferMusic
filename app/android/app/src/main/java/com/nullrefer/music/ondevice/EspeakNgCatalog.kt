package com.nullrefer.music.ondevice

/** JS·AlignModelCatalog 과 동일한 에셋 스펙 패턴 — eSpeak NG (FA 전처리) */
object EspeakNgCatalog {
  const val ID = "espeak-ng:install"
  private const val BASE_URL =
      "https://github.com/yoonhs3648/NullReferMusic/releases/download/espeak-ng-v1"

  data class AssetSpec(
      val fileName: String,
      val url: String,
      val minBytes: Long,
      /** true — zip 압축 해제 후 설치 (espeak-data) */
      val extractZip: Boolean = false,
  )

  val ASSETS: List<AssetSpec> =
      listOf(
          AssetSpec("libespeak-ng.so", "$BASE_URL/libespeak-ng.so", 200_000L),
          AssetSpec("espeak-data.zip", "$BASE_URL/espeak-data.zip", 5_000_000L, extractZip = true),
          AssetSpec("espeak-ng", "$BASE_URL/espeak-ng", 50_000L),
      )
}
