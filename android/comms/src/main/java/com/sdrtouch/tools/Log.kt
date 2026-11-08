package com.sdrtouch.tools

import android.util.Log as AndroidLog

/**
 * JNI Logging bridge required by librtlSdrAndroid.so during JNI_OnLoad.
 * Forwards native Osmocom and libusb driver logs directly to Android logcat.
 */
object Log {
    interface Callback {
        fun onChanged()
    }

    @JvmStatic
    fun appendLine(line: String?) {
        if (line != null) {
            AndroidLog.i("AalaapiCommsNative", line)
        }
    }

    @JvmStatic
    fun appendLine(format: String?, vararg args: Any?) {
        if (format != null) {
            val msg = try { String.format(format, *args) } catch (_: Exception) { format }
            AndroidLog.i("AalaapiCommsNative", msg)
        }
    }

    @JvmStatic
    fun clear() {}

    @JvmStatic
    fun getFullLog(): String = ""

    @JvmStatic
    fun registerCallback(callback: Callback?) {}

    @JvmStatic
    fun unregisterCallback(callback: Callback?) {}
}
