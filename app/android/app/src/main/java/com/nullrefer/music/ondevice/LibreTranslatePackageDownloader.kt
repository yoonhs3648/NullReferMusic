package com.nullrefer.music.ondevice

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/** Argos .argosmodel 언어 팩 다운로드 + 설치 */
object LibreTranslatePackageDownloader {
  private const val TAG = "LibreTranslateDl"

  data class PackageStatus(
      val packageId: String,
      val installed: Boolean,
      val downloading: Boolean,
      val progress: Int,
  )

  private val activeDownloads = ConcurrentHashMap<String, AtomicBoolean>()
  private val progressByPackage = ConcurrentHashMap<String, Int>()
  private val argosInstalled = ConcurrentHashMap<String, Boolean>()

  @Volatile private var eventEmitter: ((String, WritableMap) -> Unit)? = null
  @Volatile private var notifContext: Context? = null

  fun setEventEmitter(emit: ((String, WritableMap) -> Unit)?) {
    eventEmitter = emit
  }

  fun packagesDir(context: Context): File {
    val dir = File(context.filesDir, "libretranslate/packages")
    dir.mkdirs()
    return dir
  }

  fun packageFile(context: Context, entry: LibreTranslatePackageCatalog.Entry): File {
    return File(packagesDir(context), entry.fileName)
  }

  fun isPackageFileReady(context: Context, entry: LibreTranslatePackageCatalog.Entry): Boolean {
    val file = packageFile(context, entry)
    return isValidArgosmodelFile(file, entry.minBytes)
  }

  private fun isValidArgosmodelFile(file: File, minBytes: Long): Boolean {
    if (!file.isFile || file.length() < minBytes) return false
    return ArgosPackageInstaller.isValidArgosmodelArchive(file)
  }

  /** 미완료 .download 및 손상된 .argosmodel 제거 (재시도·cold start 공용) */
  fun removeStalePackages(context: Context): Int {
    val dir = packagesDir(context)
    var removed = 0
    val children = dir.listFiles() ?: return 0
    for (child in children) {
      if (!child.isFile) continue
      when {
        child.name.endsWith(".download") -> {
          if (child.delete()) {
            removed++
            NrmFileLogger.log("libretranslate", "stale_tmp_removed file=${child.name}")
          }
        }
        child.name.endsWith(".argosmodel") -> {
          val entry =
              LibreTranslatePackageCatalog.ENTRIES.firstOrNull { it.fileName == child.name }
          val minBytes = entry?.minBytes ?: 1L
          if (!isValidArgosmodelFile(child, minBytes)) {
            val bytes = child.length()
            if (child.delete()) {
              removed++
              entry?.id?.let { argosInstalled.remove(it) }
              NrmFileLogger.warn(
                  "libretranslate",
                  "stale_package_removed file=${child.name} bytes=$bytes",
              )
            }
          }
        }
      }
    }
    return removed
  }

  fun isArgosPackageRegistered(context: Context, packageId: String): Boolean {
    if (argosInstalled[packageId] == true) return true
    val entry = LibreTranslatePackageCatalog.entryFor(packageId) ?: return false
    if (!isPackageFileReady(context, entry)) return false
    val ok = ArgosPackageInstaller.installFromArgosmodel(context, packageFile(context, entry).absolutePath)
    if (ok) {
      argosInstalled[packageId] = true
    }
    return ok
  }

  fun progressFor(packageId: String): Int = progressByPackage[packageId] ?: -1

  fun hasActiveDownload(): Boolean {
    return activeDownloads.values.any { it.get() }
  }

  /** 메모리 부족 시 진행 중 .download 임시 파일을 정리해 RAM·디스크 압력을 줄인다 */
  fun trimInFlightDownloads(context: Context) {
    val dir = packagesDir(context)
    var removed = 0
    for (child in dir.listFiles().orEmpty()) {
      if (child.isFile && child.name.endsWith(".download") && child.delete()) {
        removed++
      }
    }
    if (removed > 0) {
      NrmFileLogger.warn("libretranslate", "trim_inflight_downloads removed=$removed")
    }
  }

  fun isOfflineReady(context: Context): Boolean {
    val required = LibreTranslatePackageCatalog.requiredEntries()
    val filesReady = required.all { isPackageFileReady(context, it) }
    if (!filesReady) return false
    for (entry in required) {
      if (!isArgosPackageRegistered(context, entry.id)) {
        return false
      }
    }
    return ArgosBridge.isOfflineReady(context)
  }

  fun listStatuses(context: Context): List<PackageStatus> {
    return LibreTranslatePackageCatalog.ENTRIES.map { entry ->
      val downloading = activeDownloads[entry.id]?.get() == true
      val fileReady = isPackageFileReady(context, entry)
      val registered = !downloading && fileReady && isArgosPackageRegistered(context, entry.id)
      val progress =
          when {
            downloading -> progressByPackage[entry.id] ?: 0
            registered -> 100
            else -> 0
          }
      PackageStatus(
          packageId = entry.id,
          installed = registered,
          downloading = downloading,
          progress = progress.coerceIn(0, 100),
      )
    }
  }

  fun startDownload(context: Context, packageId: String) {
    val entry = LibreTranslatePackageCatalog.entryFor(packageId) ?: return
    NrmFileLogger.log("libretranslate", "startDownload packageId=$packageId")
    removeStalePackages(context)
    val dest = packageFile(context, entry)
    if (dest.isFile && !isValidArgosmodelFile(dest, entry.minBytes)) {
      NrmFileLogger.warn(
          "libretranslate",
          "손상된 언어 팩 삭제 file=${entry.fileName} bytes=${dest.length()}",
      )
      dest.delete()
      argosInstalled.remove(packageId)
    }
    if (isArgosPackageRegistered(context, entry.id)) {
      emitComplete(packageId, true)
      return
    }
    val flag = activeDownloads.computeIfAbsent(packageId) { AtomicBoolean(false) }
    if (!flag.compareAndSet(false, true)) {
      return
    }
    progressByPackage[packageId] = 0
    emitProgress(packageId, 0)
    val appContext = context.applicationContext
    val jobId = "libretranslate-pack:$packageId"
    val queued =
        NrmModelInstallQueue.enqueue(appContext, jobId, "오프라인 번역기 ${entry.label}") {
          notifContext = appContext
          NrmBackgroundWorkCoordinator.acquire(appContext, jobId)
          var ok = false
          try {
            val destFile = packageFile(appContext, entry)
            ok = downloadPackage(appContext, entry, destFile)
            if (ok) {
              emitProgress(entry.id, 100, "installing")
              ok = ArgosPackageInstaller.installFromArgosmodel(appContext, destFile.absolutePath)
              if (ok) {
                argosInstalled[packageId] = true
              } else {
                NrmFileLogger.warn(
                    "libretranslate",
                    "언어 팩 설치 실패 — 파일 삭제 후 재시도 필요 file=${entry.fileName}",
                )
                destFile.delete()
                argosInstalled.remove(packageId)
              }
            } else {
              NrmFileLogger.warn("libretranslate", "언어 팩 다운로드 실패 packageId=$packageId")
            }
          } catch (e: Exception) {
            Log.w(TAG, "startDownload failed $packageId: ${e.message}")
            NrmFileLogger.error("libretranslate", "startDownload 실패 packageId=$packageId", e)
          } finally {
            flag.set(false)
            activeDownloads.remove(packageId)
            progressByPackage.remove(packageId)
            NrmBackgroundWorkCoordinator.release(appContext, jobId)
            if (activeDownloads.isEmpty()) {
              notifContext = null
            }
            emitComplete(packageId, ok)
          }
        }
    if (!queued) {
      flag.set(false)
      activeDownloads.remove(packageId)
      progressByPackage.remove(packageId)
    }
  }

  private fun downloadPackage(
      context: Context,
      entry: LibreTranslatePackageCatalog.Entry,
      dest: File,
  ): Boolean {
    val tmp = File(dest.parentFile, "${entry.fileName}.download")
    if (isValidArgosmodelFile(dest, entry.minBytes)) {
      emitProgress(entry.id, 100)
      return true
    }
    if (dest.isFile) dest.delete()
    if (tmp.isFile) tmp.delete()
    val urlCount = entry.downloadUrls.size
    for ((urlIndex, urlStr) in entry.downloadUrls.withIndex()) {
      if (downloadPackageFromUrl(context, entry, dest, tmp, urlStr, urlIndex + 1, urlCount)) {
        return true
      }
      if (tmp.isFile) tmp.delete()
    }
    return false
  }

  private fun downloadPackageFromUrl(
      context: Context,
      entry: LibreTranslatePackageCatalog.Entry,
      dest: File,
      tmp: File,
      urlStr: String,
      urlIndex: Int,
      urlCount: Int,
  ): Boolean {
    NrmFileLogger.log(
        "libretranslate",
        "언어 팩 다운로드 시작 file=${entry.fileName} url=$urlStr mirror=$urlIndex/$urlCount",
    )
    val ok =
        NrmResilientHttpDownload.download(
            context = context,
            tag = "libretranslate",
            urlStr = urlStr,
            tmp = tmp,
            dest = dest,
            minBytes = entry.minBytes,
            onProgress = { pct, _, _ ->
              progressByPackage[entry.id] = pct
              emitProgress(entry.id, pct, "downloading")
            },
            isValid = { file -> isValidArgosmodelFile(file, entry.minBytes) },
            requestHeaders =
                mapOf(
                    "User-Agent" to "NullReferenceMusic/1.0",
                    "Accept" to "*/*",
                ),
            readTimeoutMs = 900_000,
            expectedBytes = entry.expectedBytes,
        )
    if (ok) {
      NrmFileLogger.log(
          "libretranslate",
          "언어 팩 다운로드 완료 file=${entry.fileName} bytes=${dest.length()} url=$urlStr",
      )
    } else {
      NrmFileLogger.warn(
          "libretranslate",
          "언어 팩 다운로드 실패 file=${entry.fileName} url=$urlStr",
      )
    }
    return ok
  }

  private fun emitProgress(
      packageId: String,
      progress: Int,
      step: String = "downloading",
  ) {
    val body =
        Arguments.createMap().apply {
          putString("packageId", packageId)
          putString("phase", "progress")
          putString("step", step)
          putInt("progress", progress.coerceIn(0, 100))
        }
    eventEmitter?.invoke("LibreTranslatePackageDownload", body)
    notifContext?.let { NrmBackgroundWorkService.refreshNotification(it) }
  }

  private fun emitComplete(packageId: String, ok: Boolean) {
    val body =
        Arguments.createMap().apply {
          putString("packageId", packageId)
          putString("phase", if (ok) "complete" else "failed")
          putInt("progress", if (ok) 100 else 0)
        }
    eventEmitter?.invoke("LibreTranslatePackageDownload", body)
  }
}
