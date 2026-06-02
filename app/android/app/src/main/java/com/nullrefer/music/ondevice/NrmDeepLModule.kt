package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap

/** JS: NativeModules.NrmDeepL.translateTexts */
class NrmDeepLModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmDeepL"

  @ReactMethod
  fun translateTexts(apiKey: String, texts: ReadableArray, promise: Promise) {
    Thread {
          try {
            val list = ArrayList<String>(texts.size())
            for (i in 0 until texts.size()) {
              list.add(texts.getString(i)?.trim() ?: "")
            }
            NrmFileLogger.log(
                "deepl",
                "native translateTexts count=${list.size} keyLen=${apiKey.trim().length}",
            )
            val result = NrmDeepLClient.translateAll(apiKey, list)
            val outTexts = WritableNativeArray()
            for (t in result.texts) {
              outTexts.pushString(t)
            }
            val map = WritableNativeMap()
            map.putArray("texts", outTexts)
            map.putString("apiUsed", result.apiUsed)
            NrmFileLogger.log(
                "deepl",
                "native translateTexts OK api=${result.apiUsed} out=${result.texts.size}",
            )
            promise.resolve(map)
          } catch (e: NrmDeepLClient.DeepLException) {
            NrmFileLogger.warn("deepl", "native translateTexts FAIL ${e.message}")
            promise.reject("E_DEEPL_HTTP", e.message, e)
          } catch (e: Exception) {
            NrmFileLogger.error("deepl", "native translateTexts ${e.message}")
            promise.reject("E_DEEPL", e.message ?: e.toString(), e)
          }
        }
        .start()
  }
}
