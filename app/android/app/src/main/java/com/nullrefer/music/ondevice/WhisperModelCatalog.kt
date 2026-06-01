package com.nullrefer.music.ondevice

/** JS `nrmWhisperCatalog.ts` 와 동일한 5종 모델 ID */
object WhisperModelCatalog {
  data class Entry(
      val id: String,
      val ggmlFiles: List<String>,
      val minBytes: Long,
  )

  val ENTRIES =
      listOf(
          Entry(
              "whisper:large-v3-turbo",
              listOf("ggml-large-v3-turbo-q5_0.bin", "ggml-large-v3-turbo.bin"),
              300_000_000L,
          ),
          Entry(
              "whisper:large-v3",
              listOf("ggml-large-v3-q5_0.bin", "ggml-large-v3.bin"),
              700_000_000L,
          ),
          Entry(
              "whisper:medium",
              listOf("ggml-medium-q5_0.bin", "ggml-medium.bin"),
              300_000_000L,
          ),
          Entry(
              "whisper:small",
              listOf("ggml-small-q5_1.bin", "ggml-small.bin"),
              100_000_000L,
          ),
          Entry("whisper:base", listOf("ggml-base-q5_1.bin", "ggml-base.bin"), 50_000_000L),
      )

  private val BY_ID = ENTRIES.associateBy { it.id }

  /** 알림·로그용 짧은 이름 (예: whisper:medium → medium) */
  fun displayLabel(modelId: String): String {
    val id = modelId.trim()
    if (id.startsWith("whisper:")) {
      return id.removePrefix("whisper:")
    }
    return entryForPreference(id)?.id?.removePrefix("whisper:") ?: id
  }

  fun entryForPreference(preference: String?): Entry? {
    val pref = (preference ?: "").trim()
    if (pref.startsWith("whisper:")) {
      return BY_ID[pref]
    }
    return migrateLegacy(pref)
  }

  fun ggmlOrderForPreference(preference: String?): List<String> {
    val entry = entryForPreference(preference) ?: BY_ID["whisper:large-v3-turbo"]!!
    return entry.ggmlFiles
  }

  fun minBytesFor(fileName: String): Long {
    for (entry in ENTRIES) {
      if (entry.ggmlFiles.contains(fileName)) return entry.minBytes
    }
    return 10_000_000L
  }

  private fun migrateLegacy(pref: String): Entry? {
    return when (pref) {
      "profile:fast" -> BY_ID["whisper:base"]
      "profile:balanced" -> BY_ID["whisper:medium"]
      "profile:quality" -> BY_ID["whisper:large-v3"]
      "model:ggml-large-v3-turbo-q5_0.bin",
      "model:ggml-large-v3-turbo.bin" -> BY_ID["whisper:large-v3-turbo"]
      "model:ggml-large-v3-q5_0.bin",
      "model:ggml-large-v3.bin" -> BY_ID["whisper:large-v3"]
      "model:ggml-medium-q5_0.bin",
      "model:ggml-medium.bin" -> BY_ID["whisper:medium"]
      "model:ggml-small-q5_1.bin",
      "model:ggml-small.bin" -> BY_ID["whisper:small"]
      "model:ggml-base-q5_1.bin",
      "model:ggml-base.bin",
      "model:ggml-base.en-q5_1.bin",
      "model:ggml-base.en.bin",
      "model:ggml-tiny-q5_1.bin",
      "model:ggml-tiny.bin" -> BY_ID["whisper:base"]
      else -> null
    }
  }
}
