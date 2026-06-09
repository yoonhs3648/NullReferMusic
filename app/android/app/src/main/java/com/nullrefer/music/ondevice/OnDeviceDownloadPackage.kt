package com.nullrefer.music.ondevice

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class OnDeviceDownloadPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(
        OnDeviceDownloadModule(reactContext),
        NrmAudioMetadataModule(reactContext),
        NrmWhisperModule(reactContext),
        NrmSpotifyCookieModule(reactContext),
        NrmSiteCookieModule(reactContext),
        NrmFileLoggerModule(reactContext),
        NrmBackgroundWorkModule(reactContext),
        NrmProgressNotificationModule(reactContext),
        NrmDeepLModule(reactContext),
    )
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
