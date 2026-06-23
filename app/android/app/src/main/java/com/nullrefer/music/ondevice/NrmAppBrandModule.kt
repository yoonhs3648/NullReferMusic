package com.nullrefer.music.ondevice

import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.nullrefer.music.NrmBrand
import java.security.MessageDigest

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

  /** 기기 ANDROID_ID를 SHA-256으로 해싱해 hex 문자열로 반환 */
  @ReactMethod
  fun getAndroidIdSha256(promise: Promise) {
    try {
      val rawId = Settings.Secure.getString(
        reactApplicationContext.contentResolver,
        Settings.Secure.ANDROID_ID,
      ) ?: ""
      val bytes = MessageDigest.getInstance("SHA-256").digest(rawId.toByteArray(Charsets.UTF_8))
      val hex = bytes.joinToString("") { "%02x".format(it) }
      promise.resolve(hex)
    } catch (e: Exception) {
      promise.reject("E_NRM_BRAND", e.message ?: e.toString(), e)
    }
  }
}
