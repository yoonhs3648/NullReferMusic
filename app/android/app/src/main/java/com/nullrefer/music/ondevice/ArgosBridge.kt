package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File

/** LibreTranslate(Argos) 오프라인 번역 — Kotlin + nrm-argos-translate CLI */
object ArgosBridge {
  fun installPackage(context: Context, argosmodelPath: String): Boolean {
    return ArgosPackageInstaller.installFromArgosmodel(context, argosmodelPath)
  }

  fun isOfflineReady(context: Context): Boolean {
    if (!ArgosPackageInstaller.isEnKoReady(context)) return false
    return ArgosTranslateBootstrap.ensure(context).isReady()
  }

  data class TranslateBatch(
      val texts: List<String>,
      val sourceLangs: List<String>,
  )

  fun translateTextsToKorean(context: Context, texts: List<String>): TranslateBatch? {
    if (!isOfflineReady(context)) return null
    val outTexts = ArrayList<String>(texts.size)
    val outLangs = ArrayList<String>(texts.size)
    for (raw in texts) {
      val text = raw.trim()
      if (text.isEmpty()) {
        outTexts.add("")
        outLangs.add("")
        continue
      }
      val (translated, src) = translateOneToKorean(context, text)
      outTexts.add(translated)
      outLangs.add(src)
    }
    return TranslateBatch(outTexts, outLangs)
  }

  private fun translateOneToKorean(context: Context, text: String): Pair<String, String> {
    val enKo = ArgosPackageInstaller.findInstalledModelDir(context, "en", "ko")
    if (enKo != null) {
      val out = ArgosTranslateExec.translateWithModel(context, enKo, text)
      if (!out.isNullOrBlank()) return out to "EN"
    }
    return text to ""
  }
}
