package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.nullrefer.music.NrmBrand

/** APK 빌드 시 내장된 브랜드·시리얼 메타 (버전 UI에는 노출하지 않음) */
class NrmAppBrandModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmAppBrand"

  @ReactMethod
  fun getSerialNo(promise: Promise) {
    try {
      promise.resolve(NrmBrand.SERIAL_NO)
    } catch (e: Exception) {
      promise.reject("E_NRM_BRAND", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun getUserName(promise: Promise) {
    try {
      promise.resolve(NrmBrand.USER_NAME)
    } catch (e: Exception) {
      promise.reject("E_NRM_BRAND", e.message ?: e.toString(), e)
    }
  }
}
