package com.sdrtouch.rtlsdr.driver

import android.util.Log

/**
 * Embedded Native RTL-SDR & R820T Tuner Driver Bridge.
 * Binds directly to liblibusb.so, liblibrtlsdr.so, and librtlSdrAndroid.so
 * to control RTL2832U hardware, perform R820T PLL calibration, and stream I/Q via in-process socket.
 */
class RtlSdrDevice {

    companion object {
        init {
            try {
                System.loadLibrary("libusb")
                System.loadLibrary("librtlsdr")
                System.loadLibrary("rtlSdrAndroid")
                Log.i("AalaapiComms", "Loaded embedded native RTL-SDR libraries successfully")
            } catch (e: UnsatisfiedLinkError) {
                Log.e("AalaapiComms", "Failed to load embedded RTL-SDR native libraries: ${e.message}")
            }
        }
    }

    private var nativeHandler: Long = 0L
    private var isDisposed = false

    init {
        try {
            nativeHandler = initialize()
        } catch (e: Exception) {
            Log.e("AalaapiComms", "Failed to initialize native RTL-SDR handler: ${e.message}")
        }
    }

    fun openAsync(
        fd: Int,
        gainTenthDb: Int,
        samplingRateHz: Long,
        frequencyHz: Long,
        port: Int,
        ppm: Int = 0,
        biasT: Int = 0,
        address: String = "127.0.0.1",
        devicePath: String = ""
    ): Boolean {
        if (nativeHandler == 0L || isDisposed) return false
        return try {
            openAsync(nativeHandler, fd, gainTenthDb, samplingRateHz, frequencyHz, port, ppm, biasT, address, devicePath)
        } catch (e: Exception) {
            Log.e("AalaapiComms", "openAsync native error: ${e.message}")
            false
        }
    }

    fun close() {
        if (nativeHandler != 0L && !isDisposed) {
            try {
                close(nativeHandler)
            } catch (e: Exception) {
                Log.w("AalaapiComms", "Error closing native RTL-SDR session: ${e.message}")
            }
        }
    }

    fun dispose() {
        if (!isDisposed && nativeHandler != 0L) {
            isDisposed = true
            try {
                deInit(nativeHandler)
            } catch (e: Exception) {
                Log.w("AalaapiComms", "Error disposing native RTL-SDR session: ${e.message}")
            }
            nativeHandler = 0L
        }
    }

    var onOpenCallback: (() -> Unit)? = null
    var onClosedCallback: ((Throwable?) -> Unit)? = null

    fun announceOnOpen() {
        Log.i("AalaapiComms", "RtlSdrDevice: announceOnOpen callback received from native layer")
        onOpenCallback?.invoke()
    }

    fun announceOnClosed(t: Throwable?) {
        Log.i("AalaapiComms", "RtlSdrDevice: announceOnClosed callback received: ${t?.message}")
        onClosedCallback?.invoke(t)
    }

    protected fun finalize() {
        dispose()
    }

    private external fun initialize(): Long
    private external fun close(pointer: Long)
    private external fun deInit(pointer: Long)
    private external fun openAsync(
        pointer: Long,
        fd: Int,
        gain: Int,
        samplingrate: Long,
        frequency: Long,
        port: Int,
        ppm: Int,
        biast: Int,
        address: String,
        devicePath: String
    ): Boolean
    external fun getSupportedCommands(): IntArray
}
