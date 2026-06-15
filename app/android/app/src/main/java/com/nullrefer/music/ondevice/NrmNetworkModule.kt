package com.nullrefer.music.ondevice

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS: NativeModules.NrmNetwork.isConnectedViaWifi */
class NrmNetworkModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmNetwork"

  @ReactMethod
  fun isConnectedViaWifi(promise: Promise) {
    try {
      promise.resolve(isConnectedViaWifi(reactApplicationContext))
    } catch (e: Exception) {
      promise.reject("E_NETWORK", e.message ?: e.toString(), e)
    }
  }

  private fun isConnectedViaWifi(context: Context): Boolean {
    val cm =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val network = cm.activeNetwork ?: return false
      val caps = cm.getNetworkCapabilities(network) ?: return false
      val onWifi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
      val onEthernet = caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
      return onWifi || onEthernet
    }
    @Suppress("DEPRECATION")
    val info = cm.activeNetworkInfo ?: return false
    @Suppress("DEPRECATION")
    return info.isConnected && (info.type == ConnectivityManager.TYPE_WIFI || info.type == ConnectivityManager.TYPE_ETHERNET)
  }
}
