package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File

/**
 * en-ko-transliterator 설치 — filesDir 데이터만. 실행 바이너리/W^X/linker 경로 없음.
 * installed = 파일 검증 + 실제 추론 프로브(`hello` → 한글) 성공.
 */
object EnKoTransliteratorBootstrap {
  data class Paths(
      val root: File,
      val encoder: File,
      val decoder: File,
      val spiece: File,
      val tokenizerMeta: File,
      val installMarker: File,
  ) {
    fun hasInstalledFiles(): Boolean {
      return EnKoTransliteratorCatalog.ASSETS.all { spec ->
        val f = File(root, spec.fileName)
        f.isFile && f.length() >= spec.minBytes
      } && installMarker.isFile
    }
  }

  fun modelRoot(context: Context): File {
    return File(context.applicationContext.filesDir, "en-ko-transliterator")
  }

  fun buildPaths(context: Context): Paths {
    val root = modelRoot(context)
    return Paths(
        root = root,
        encoder = File(root, "encoder.onnx"),
        decoder = File(root, "decoder.onnx"),
        spiece = File(root, "spiece.model"),
        tokenizerMeta = File(root, "tokenizer_meta.json"),
        installMarker = File(root, ".installed"),
    )
  }

  fun pathsIfReady(context: Context): Paths? {
    val paths = buildPaths(context)
    if (!paths.hasInstalledFiles()) return null
    // status/빠른 경로: 마커+용량만 확인 (매 호출마다 740MB 세션 로드하지 않음)
    // 실제 추론은 transliterate / ensure(finalize) 단계에서 실패하면 wipe
    return paths
  }

  fun ensure(context: Context, onProgress: ((Int) -> Unit)? = null): Paths? {
    pathsIfReady(context)?.let { return it }
    val paths = buildPaths(context)
    paths.root.mkdirs()
    return try {
      downloadAll(context, paths, onProgress)
      finalizeInstall(paths)
    } catch (e: Exception) {
      NrmFileLogger.error("en-ko-transliterator", "부트스트랩 실패", e)
      wipeInstall(paths)
      null
    }
  }

  private fun downloadAll(
      context: Context,
      paths: Paths,
      onProgress: ((Int) -> Unit)?,
  ) {
    val pending =
        EnKoTransliteratorCatalog.ASSETS.filter { spec ->
          val dest = File(paths.root, spec.fileName)
          !(dest.isFile && dest.length() >= spec.minBytes)
        }
    if (pending.isEmpty()) {
      onProgress?.invoke(100)
      return
    }
    var done = 0
    for (spec in pending) {
      val dest = File(paths.root, spec.fileName)
      if (dest.isFile && dest.length() >= spec.minBytes) {
        done += 1
        onProgress?.invoke(((done * 100) / EnKoTransliteratorCatalog.ASSETS.size).coerceIn(0, 99))
        continue
      }
      val tmp = File(paths.root, "${spec.fileName}.download")
      NrmFileLogger.log("en-ko-transliterator", "asset_download_start file=${spec.fileName}")
      val ok =
          NrmResilientHttpDownload.download(
              context = context,
              tag = "en-ko-transliterator",
              urlStr = spec.url,
              tmp = tmp,
              dest = dest,
              minBytes = spec.minBytes,
              onProgress = { pct, _, _ ->
                val base = (done * 100) / EnKoTransliteratorCatalog.ASSETS.size
                val span = 100 / EnKoTransliteratorCatalog.ASSETS.size
                onProgress?.invoke((base + (span * pct) / 100).coerceIn(0, 99))
              },
              isValid = { f -> f.isFile && f.length() >= spec.minBytes },
              requestHeaders =
                  mapOf(
                      "User-Agent" to "NullReferMusic-Android",
                      "Accept" to "*/*",
                  ),
              readTimeoutMs = 900_000,
          )
      NrmFileLogger.log(
          "en-ko-transliterator",
          "asset_download_done file=${spec.fileName} ok=$ok bytes=${dest.length()}",
      )
      if (!ok) {
        throw IllegalStateException("다운로드 실패: ${spec.fileName}")
      }
      done += 1
      onProgress?.invoke(((done * 100) / EnKoTransliteratorCatalog.ASSETS.size).coerceIn(0, 99))
    }
    onProgress?.invoke(100)
  }

  private fun finalizeInstall(paths: Paths): Paths? {
    for (spec in EnKoTransliteratorCatalog.ASSETS) {
      val f = File(paths.root, spec.fileName)
      if (!f.isFile || f.length() < spec.minBytes) {
        NrmFileLogger.warn(
            "en-ko-transliterator",
            "검증 실패 file=${spec.fileName} bytes=${f.length()} min=${spec.minBytes}",
        )
        wipeInstall(paths)
        return null
      }
    }
    EnKoTransliteratorInfer.invalidate()
    if (!EnKoTransliteratorInfer.probe(paths)) {
      NrmFileLogger.warn("en-ko-transliterator", "기능 프로브 실패 — 설치 무효")
      wipeInstall(paths)
      return null
    }
    try {
      paths.installMarker.writeText("ok\n${System.currentTimeMillis()}\n")
    } catch (e: Exception) {
      NrmFileLogger.error("en-ko-transliterator", "marker_write_fail", e)
      wipeInstall(paths)
      return null
    }
    NrmFileLogger.log("en-ko-transliterator", "부트스트랩 OK dir=${paths.root.absolutePath}")
    return paths
  }

  fun wipeInstall(paths: Paths) {
    EnKoTransliteratorInfer.invalidate()
    try {
      if (paths.root.isDirectory) {
        paths.root.listFiles()?.forEach { child ->
          runCatching { child.deleteRecursively() }
        }
      }
      paths.installMarker.delete()
    } catch (e: Exception) {
      NrmFileLogger.warn("en-ko-transliterator", "wipe_fail err=${e.message?.take(80)}")
    }
  }
}
