package com.nullrefer.music

import android.app.Application
import android.content.ComponentCallbacks2
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import com.nullrefer.music.ondevice.EnKoTransliteratorInfer
import com.nullrefer.music.ondevice.FfmpegBootstrap
import com.nullrefer.music.ondevice.ForcedAlignWorkQueue
import com.nullrefer.music.ondevice.NrmFileLogger
import com.nullrefer.music.ondevice.NrmStaleArtifactCleanup
import com.nullrefer.music.ondevice.NrmStaleWorkNotificationCleanup
import com.nullrefer.music.ondevice.NrmUncaughtExceptionHandler
import com.nullrefer.music.ondevice.OnDeviceDownloadPackage
import com.nullrefer.music.ondevice.Wav2Vec2CtcForcedAligner
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(OnDeviceDownloadPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    NrmUncaughtExceptionHandler.install()
    NrmFileLogger.init(this)
    NrmStaleWorkNotificationCleanup.reconcileOnColdStart(this)
    NrmStaleArtifactCleanup.reconcileOnColdStart(this)
    NrmFileLogger.log("MainApplication", "onCreate — React Native 로드 시작")
    FfmpegBootstrap.prefetch(this)
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

  override fun onLowMemory() {
    super.onLowMemory()
    releaseHeavyOnnxSessions("onLowMemory")
  }

  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    // 프로세스 종료 직전·백그라운드 메모리 압박 시에만 Session 해제
    if (level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE ||
        level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL) {
      releaseHeavyOnnxSessions("onTrimMemory level=$level")
    }
  }

  private fun releaseHeavyOnnxSessions(reason: String) {
    if (ForcedAlignWorkQueue.pendingCount() > 0) {
      NrmFileLogger.log(
          "MainApplication",
          "release_onnx_sessions skipped (fa_busy) reason=$reason",
      )
      return
    }
    NrmFileLogger.log("MainApplication", "release_onnx_sessions reason=$reason")
    runCatching { Wav2Vec2CtcForcedAligner.releaseOnnxSession() }
    runCatching { EnKoTransliteratorInfer.invalidate() }
  }
}
