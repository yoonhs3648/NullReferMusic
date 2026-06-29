package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap

/** JS: NativeModules.NrmGtx.translateTexts */
class NrmGtxModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NrmGtx"

    /**
     * @param texts      번역할 줄 배열
     * @param lineDelayMs 줄 사이 대기 (ms) — JS resolveGtxRuntimeLimits 결과
     */
    @ReactMethod
    fun translateTexts(texts: ReadableArray, lineDelayMs: Double, promise: Promise) {
        Thread {
            try {
                val list = ArrayList<String>(texts.size())
                for (i in 0 until texts.size()) {
                    list.add(texts.getString(i)?.trim() ?: "")
                }
                val result = NrmGtxClient.translateAll(list, lineDelayMs.toLong())

                val outTexts = WritableNativeArray()
                for (t in result.texts) outTexts.pushString(t)
                val outSourceLangs = WritableNativeArray()
                for (l in result.sourceLangs) outSourceLangs.pushString(l)

                val map = WritableNativeMap()
                map.putArray("texts", outTexts)
                map.putArray("sourceLangs", outSourceLangs)
                promise.resolve(map)
            } catch (e: NrmGtxClient.GtxTimeoutException) {
                NrmFileLogger.warn("gtx", "translateTexts TIMEOUT ${e.message}")
                promise.reject("E_GTX_TIMEOUT", e.message ?: "fetch timeout", e)
            } catch (e: NrmGtxClient.GtxRateLimitException) {
                NrmFileLogger.warn("gtx", "translateTexts RATE_LIMIT ${e.message}")
                promise.reject("E_GTX_RATE_LIMIT", e.message ?: "rate limited", e)
            } catch (e: NrmGtxClient.GtxHttpException) {
                NrmFileLogger.warn("gtx", "translateTexts HTTP_ERR status=${e.status} ${e.message}")
                promise.reject("E_GTX_HTTP", e.message ?: "HTTP error", e)
            } catch (t: Throwable) {
                NrmFileLogger.error("gtx", "translateTexts fatal ${t.message}", t)
                promise.reject("E_GTX", t.message ?: t.toString(), t as? Exception)
            }
        }.start()
    }
}
