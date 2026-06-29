package com.nullrefer.music.ondevice

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

/** GitHub Releases APK 다운로드·설치 (PAT 불필요 공개 URL) */
class NrmApkUpdateModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmApkUpdate"

  @ReactMethod
  fun addListener(eventName: String) {
    // NativeEventEmitter 호환
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // NativeEventEmitter 호환
  }

  @ReactMethod
  fun canInstallPackages(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve(true)
        return
      }
      promise.resolve(reactContext.packageManager.canRequestPackageInstalls())
    } catch (e: Exception) {
      promise.reject("E_APK_INSTALL", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun openInstallUnknownAppsSettings(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve(null)
        return
      }
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_APK_INSTALL", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun downloadApk(url: String, fileName: String, promise: Promise) {
    Thread {
      try {
        val safeName = fileName.trim().ifEmpty { "NullReferenceMusic-update.apk" }
        val cacheDir = File(reactContext.cacheDir, "apk-update")
        cacheDir.mkdirs()
        val tmp = File(cacheDir, "$safeName.tmp")
        val dest = File(cacheDir, safeName)

        val ok = NrmResilientHttpDownload.download(
            reactContext,
            TAG,
            url.trim(),
            tmp,
            dest,
            minBytes = 512_000L,
            onProgress = { pct, _, _ -> emitProgress(pct) },
            isValid = { f -> f.isFile && f.length() >= 512_000L },
        )
        if (!ok || !dest.isFile) {
          promise.reject("E_APK_DOWNLOAD", "APK download failed")
          return@Thread
        }
        promise.resolve(dest.absolutePath)
      } catch (e: Exception) {
        promise.reject("E_APK_DOWNLOAD", e.message ?: e.toString(), e)
      }
    }.start()
  }

  @ReactMethod
  fun installApk(apkPath: String, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          !reactContext.packageManager.canRequestPackageInstalls()) {
        promise.reject("E_APK_INSTALL", "INSTALL_PACKAGES permission required")
        return
      }
      val apkFile = File(apkPath.trim())
      if (!apkFile.isFile) {
        promise.reject("E_APK_INSTALL", "APK file not found")
        return
      }
      val authority = "${reactContext.packageName}.nrm_apk_provider"
      val uri = FileProvider.getUriForFile(reactContext, authority, apkFile)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
      }
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_APK_INSTALL", e.message ?: e.toString(), e)
    }
  }

  private fun emitProgress(pct: Int) {
    val map = Arguments.createMap().apply {
      putInt("progress", pct.coerceIn(0, 100))
    }
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("NrmApkDownloadProgress", map)
  }

  companion object {
    private const val TAG = "NrmApkUpdate"
  }
}
