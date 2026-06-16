package com.nullrefer.music.ondevice



import android.content.Context

import org.json.JSONObject

import java.io.File

import java.util.zip.ZipEntry

import java.util.zip.ZipFile



/** Argos .argosmodel 언어 팩 압축 해제 및 설치 상태 */

object ArgosPackageInstaller {

  /**

   * .argosmodel ZIP 루트가 `metadata.json` 이거나 `en_ko/metadata.json` 처럼 하위 폴더에 있을 수 있다.

   * 반환값은 ZIP 엔트리 경로 접두사 (예: `en_ko/`). 루트에 있으면 빈 문자열.

   */

  fun resolveArgosmodelContentPrefix(zip: ZipFile): String? {

    val metaEntry =

        zip.entries().asSequence().firstOrNull { entry ->

          !entry.isDirectory &&

              entry.name.endsWith("metadata.json") &&

              !entry.name.contains("..")

        }

            ?: return null

    val prefix = metaEntry.name.removeSuffix("metadata.json")

    val modelPrefix = "${prefix}model/"

    val hasModel =

        zip.entries().asSequence().any { entry ->

          !entry.isDirectory && entry.name.startsWith(modelPrefix)

        }

    return if (hasModel) prefix else null

  }



  fun isValidArgosmodelArchive(file: File): Boolean {

    if (!file.isFile) return false

    return try {

      ZipFile(file).use { zip -> resolveArgosmodelContentPrefix(zip) != null }

    } catch (_: Exception) {

      false

    }

  }



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

    if (!isValidArgosmodelArchive(src)) return false

    val dest = File(installedDir(context), src.nameWithoutExtension)

    return try {

      if (dest.isDirectory) {

        dest.deleteRecursively()

      } else {

        dest.mkdirs()

      }

      ZipFile(src).use { zip ->

        val prefix = resolveArgosmodelContentPrefix(zip) ?: return false

        val entries = zip.entries()

        while (entries.hasMoreElements()) {

          val entry = entries.nextElement()

          if (!entry.name.startsWith(prefix)) continue

          val relative = entry.name.removePrefix(prefix)

          if (relative.isEmpty()) continue

          extractZipEntry(zip, entry, File(dest, relative))

        }

      }

      val modelDir = File(dest, "model")

      val meta = File(dest, "metadata.json")

      modelDir.isDirectory && meta.isFile && isRuntimeModelDir(dest)

    } catch (e: Exception) {

      NrmFileLogger.error("libretranslate", "installFromArgosmodel 실패 path=$argosmodelPath", e)

      false

    } finally {

      if (!dest.isDirectory ||

          !File(dest, "model").isDirectory ||

          !File(dest, "metadata.json").isFile ||

          !isRuntimeModelDir(dest)) {

        if (dest.isDirectory) {

          dest.deleteRecursively()

          NrmFileLogger.warn("libretranslate", "부분 설치 디렉터리 삭제 path=${dest.name}")

        }

      }

    }

  }



  private fun extractZipEntry(zip: ZipFile, entry: ZipEntry, out: File) {

    if (entry.isDirectory) {

      out.mkdirs()

      return

    }

    out.parentFile?.mkdirs()

    zip.getInputStream(entry).use { input ->

      out.outputStream().use { output -> input.copyTo(output) }

    }

  }



  fun findInstalledModelDir(context: Context, fromCode: String, toCode: String): File? {

    val root = installedDir(context)

    if (!root.isDirectory) return null

    for (child in root.listFiles().orEmpty()) {

      findModelDirInTree(child, fromCode, toCode)?.let {

        return it

      }

    }

    return null

  }



  private fun findModelDirInTree(dir: File, fromCode: String, toCode: String): File? {

    if (!dir.isDirectory) return null

    val meta = readMetadata(dir)

    if (meta != null &&

        meta.fromCode == fromCode &&

        meta.toCode == toCode &&

        File(dir, "model").isDirectory) {

      return dir

    }

    for (child in dir.listFiles().orEmpty()) {

      if (child.isDirectory) {

        findModelDirInTree(child, fromCode, toCode)?.let {

          return it

        }

      }

    }

    return null

  }



  fun isEnKoReady(context: Context): Boolean {

    return resolveRuntimeModelDir(context) != null

  }



  /** nrm-argos-translate CLI 런타임 디렉터리 (레거시 spm 또는 sentencepiece.model) */

  fun resolveRuntimeModelDir(context: Context): File? {

    val pkg = findInstalledModelDir(context, "en", "ko") ?: return null

    return if (isRuntimeModelDir(pkg)) pkg else null

  }



  fun isRuntimeModelDir(dir: File): Boolean {

    if (!File(dir, "model").isDirectory) return false

    val legacy = File(dir, "source.spm").isFile && File(dir, "target.spm").isFile

    val modern = File(dir, "sentencepiece.model").isFile

    return legacy || modern

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

