package com.nullrefer.music.ondevice

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS — 다운로드·Whisper 세션마다 acquire/release 로 Foreground Service 유지 */
class NrmBackgroundWorkModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmBackgroundWork"

  @ReactMethod
  fun acquire(token: String) {
    NrmBackgroundWorkCoordinator.acquire(reactApplicationContext, token)
  }

  @ReactMethod
  fun release(token: String) {
    NrmBackgroundWorkCoordinator.release(reactApplicationContext, token)
  }
}
