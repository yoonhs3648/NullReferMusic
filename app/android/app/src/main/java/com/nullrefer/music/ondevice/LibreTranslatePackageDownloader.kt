package com.nullrefer.music.ondevice

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
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

  private val executor = Executors.newCachedThreadPool()
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
    return file.isFile && file.length() >= entry.minBytes
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
    notifContext = appContext
    NrmBackgroundWorkCoordinator.acquire(appContext, "libretranslate-pack:$packageId")
    executor.execute {
      var ok = false
      try {
        val dest = packageFile(appContext, entry)
        ok = downloadPackage(appContext, entry, dest)
        if (ok) {
          ok = ArgosPackageInstaller.installFromArgosmodel(appContext, dest.absolutePath)
          if (ok) {
            argosInstalled[packageId] = true
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "startDownload failed $packageId: ${e.message}")
        NrmFileLogger.error("libretranslate", "startDownload 실패 packageId=$packageId", e)
      } finally {
        flag.set(false)
        activeDownloads.remove(packageId)
        progressByPackage.remove(packageId)
        NrmBackgroundWorkCoordinator.release(appContext, "libretranslate-pack:$packageId")
        if (activeDownloads.isEmpty()) {
          notifContext = null
        }
        emitComplete(packageId, ok)
      }
    }
  }

  private fun downloadPackage(
      context: Context,
      entry: LibreTranslatePackageCatalog.Entry,
      dest: File,
  ): Boolean {
    val tmp = File(dest.parentFile, "${entry.fileName}.download")
    if (dest.isFile && dest.length() >= entry.minBytes) {
      emitProgress(entry.id, 100)
      return true
    }
    if (tmp.isFile) tmp.delete()
    for (urlStr in entry.downloadUrls) {
      if (downloadPackageFromUrl(entry, dest, tmp, urlStr)) {
        return true
      }
      if (tmp.isFile) tmp.delete()
    }
    return false
  }

  private fun downloadPackageFromUrl(
      entry: LibreTranslatePackageCatalog.Entry,
      dest: File,
      tmp: File,
      urlStr: String,
  ): Boolean {
    return try {
      Log.i(TAG, "download start: ${entry.fileName} url=$urlStr")
      NrmFileLogger.log("libretranslate", "언어 팩 다운로드 시작 file=${entry.fileName} url=$urlStr")
      val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
        connectTimeout = 30_000
        readTimeout = 900_000
        instanceFollowRedirects = true
        requestMethod = "GET"
        setRequestProperty("User-Agent", "NullReferenceMusic/1.0")
        setRequestProperty("Accept", "*/*")
      }
      conn.connect()
      if (conn.responseCode !in 200..299) {
        NrmFileLogger.warn(
            "libretranslate",
            "언어 팩 HTTP ${conn.responseCode} file=${entry.fileName} url=$urlStr",
        )
        conn.disconnect()
        return false
      }
      val total = conn.contentLengthLong.coerceAtLeast(0L)
      var copied = 0L
      var lastPct = -1
      BufferedInputStream(conn.inputStream).use { input ->
        FileOutputStream(tmp).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            output.write(buffer, 0, read)
            copied += read
            if (total > 0) {
              val pct = ((copied * 100) / total).toInt().coerceIn(0, 99)
              if (pct != lastPct) {
                lastPct = pct
                progressByPackage[entry.id] = pct
                emitProgress(entry.id, pct)
              }
            }
          }
        }
      }
      conn.disconnect()
      if (!tmp.isFile || tmp.length() < entry.minBytes) {
        NrmFileLogger.warn(
            "libretranslate",
            "언어 팩 파일 너무 작음 file=${entry.fileName} bytes=${tmp.length()} url=$urlStr",
        )
        return false
      }
      if (dest.isFile) dest.delete()
      if (!tmp.renameTo(dest)) {
        tmp.copyTo(dest, overwrite = true)
        tmp.delete()
      }
      emitProgress(entry.id, 100)
      NrmFileLogger.log(
          "libretranslate",
          "언어 팩 다운로드 완료 file=${entry.fileName} bytes=${dest.length()} url=$urlStr",
      )
      true
    } catch (e: Exception) {
      NrmFileLogger.error(
          "libretranslate",
          "언어 팩 다운로드 실패 file=${entry.fileName} url=$urlStr",
          e,
      )
      false
    }
  }

  private fun emitProgress(packageId: String, progress: Int) {
    val body =
        Arguments.createMap().apply {
          putString("packageId", packageId)
          putString("phase", "progress")
          putInt("progress", progress)
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
