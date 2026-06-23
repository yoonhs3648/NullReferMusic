package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.nullrefer.music.BuildConfig

/** GitHub data/alarm.json 등록용 PAT — `android/local.properties` 의 `nrm.github.pat` */
class NrmGithubDataModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmGithubData"

  @ReactMethod
  fun getGithubDataPat(promise: Promise) {
    try {
      promise.resolve(BuildConfig.NRM_GITHUB_DATA_PAT ?: "")
    } catch (e: Exception) {
      promise.reject("E_NRM_GITHUB", e.message ?: e.toString(), e)
    }
  }
}
