package com.nullrefer.music.ondevice

import android.content.Context

/** LibreTranslate(Argos) 오프라인 번역 — Kotlin + nrm-argos-translate CLI */
object ArgosBridge {
  @Volatile private var smokeTestOk: Boolean? = null
  @Volatile private var activeComputeType: String = ""

  fun invalidateSmokeTest() {
    smokeTestOk = null
    activeComputeType = ""
  }

  fun setActiveComputeType(compute: String) {
    activeComputeType = compute.trim()
  }

  fun getActiveComputeType(): String = activeComputeType

  fun installPackage(context: Context, argosmodelPath: String): Boolean {
    val ok = ArgosPackageInstaller.installFromArgosmodel(context, argosmodelPath)
    if (ok) invalidateSmokeTest()
    return ok
  }

  fun isOfflineReady(context: Context): Boolean {
    if (!ArgosPackageInstaller.isEnKoReady(context)) return false
    if (!ArgosTranslateBootstrap.ensure(context).isReady()) return false
    smokeTestOk?.let { return it }
    val modelDir = ArgosPackageInstaller.resolveRuntimeModelDir(context) ?: return false
    val ok = ArgosTranslateExec.runSelfTest(context, modelDir)
    smokeTestOk = ok
    return ok
  }

  data class TranslateBatch(
      val texts: List<String>,
      val sourceLangs: List<String>,
  )

  fun translateTextsToKorean(context: Context, texts: List<String>): TranslateBatch? {
    if (!isOfflineReady(context)) return null
    val modelDir = ArgosPackageInstaller.resolveRuntimeModelDir(context) ?: return null

    val outTexts = ArrayList<String>(texts.size)
    val outLangs = ArrayList<String>(texts.size)
    val pendingTexts = ArrayList<String>()
    val pendingIndices = ArrayList<Int>()
    var anyNonEmptyInput = false

    for (i in texts.indices) {
      val text = texts[i].trim()
      if (text.isEmpty()) {
        outTexts.add("")
        outLangs.add("")
        continue
      }
      anyNonEmptyInput = true
      if (isMostlyHangul(text)) {
        outTexts.add("")
        outLangs.add("KO")
        continue
      }
      pendingIndices.add(i)
      pendingTexts.add(text)
      outTexts.add("")
      outLangs.add("")
    }

    if (pendingTexts.isNotEmpty()) {
      val translated =
          ArgosTranslateExec.translateBatchWithModel(context, modelDir, pendingTexts)
              ?: return null
      if (translated.size != pendingTexts.size) return null
      var anyMachineTranslated = false
      for (j in pendingIndices.indices) {
        val idx = pendingIndices[j]
        val line = translated[j].trim()
        outTexts[idx] = line
        outLangs[idx] = "EN"
        if (line.isNotBlank()) anyMachineTranslated = true
      }
      if (!anyMachineTranslated) return null
    }

    if (!anyNonEmptyInput) {
      return TranslateBatch(outTexts, outLangs)
    }

    val anyTranslated = outTexts.any { it.isNotBlank() }
    if (!anyTranslated) return null
    return TranslateBatch(outTexts, outLangs)
  }

  /** 라틴 문자 없이 한글만 있는 줄 — en→ko 모델 대상 아님 */
  private fun isMostlyHangul(text: String): Boolean {
    var hangul = 0
    var latin = 0
    for (ch in text) {
      if (ch in '\uAC00'..'\uD7A3') hangul++
      else if (ch.isLetter() && ch.code < 128) latin++
    }
    return hangul > 0 && latin == 0
  }
}
