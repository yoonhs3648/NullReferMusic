package com.nullrefer.music.ondevice

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.util.zip.ZipFile

/** Argos .argosmodel 언어 팩 압축 해제 및 설치 상태 */
object ArgosPackageInstaller {
  fun packagesDir(context: Context): File {
    val dir = File(context.filesDir, "libretranslate/packages")
    dir.mkdirs()
    return dir
  }

  fun installedDir(context: Context): File {
    val dir = File(context.filesDir, "libretranslate/installed")
    dir.mkdirs()
    return dir
  }

  fun installFromArgosmodel(context: Context, argosmodelPath: String): Boolean {
    val src = File((argosmodelPath ?: "").trim())
    if (!src.isFile) return false
    return try {
      val dest = File(installedDir(context), src.nameWithoutExtension)
      if (dest.isDirectory) {
        dest.listFiles()?.forEach { child ->
          if (child.isDirectory) child.deleteRecursively() else child.delete()
        }
      } else {
        dest.mkdirs()
      }
      ZipFile(src).use { zip ->
        val entries = zip.entries()
        while (entries.hasMoreElements()) {
          val entry = entries.nextElement()
          val out = File(dest, entry.name)
          if (entry.isDirectory) {
            out.mkdirs()
            continue
          }
          out.parentFile?.mkdirs()
          zip.getInputStream(entry).use { input ->
            out.outputStream().use { output -> input.copyTo(output) }
          }
        }
      }
      val modelDir = File(dest, "model")
      val meta = File(dest, "metadata.json")
      modelDir.isDirectory && meta.isFile
    } catch (e: Exception) {
      NrmFileLogger.error("libretranslate", "installFromArgosmodel 실패 path=$argosmodelPath", e)
      false
    }
  }

  fun findInstalledModelDir(context: Context, fromCode: String, toCode: String): File? {
    val root = installedDir(context)
    if (!root.isDirectory) return null
    for (child in root.listFiles().orEmpty()) {
      if (!child.isDirectory) continue
      val meta = readMetadata(child) ?: continue
      if (meta.fromCode == fromCode && meta.toCode == toCode && File(child, "model").isDirectory) {
        return child
      }
    }
    return null
  }

  fun isEnKoReady(context: Context): Boolean {
    return findInstalledModelDir(context, "en", "ko") != null
  }

  data class ModelMeta(val fromCode: String, val toCode: String)

  fun readMetadata(modelDir: File): ModelMeta? {
    val meta = File(modelDir, "metadata.json")
    if (!meta.isFile) return null
    return try {
      val json = JSONObject(meta.readText())
      ModelMeta(
          fromCode = json.optString("from_code", "").trim(),
          toCode = json.optString("to_code", "").trim(),
      )
    } catch (_: Exception) {
      null
    }
  }
}
