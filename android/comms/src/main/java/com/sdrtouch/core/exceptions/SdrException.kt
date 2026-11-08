package com.sdrtouch.core.exceptions

/**
 * JNI Exception class required by librtlSdrAndroid.so during JNI_OnLoad.
 */
open class SdrException(private val id: Int = 0) : Exception("SDR native exception code: $id") {

    enum class err_info {
        UNKNOWN,
        SUCCESS,
        NOT_FOUND,
        BUSY,
        IO_ERROR,
        PERMISSION_DENIED
    }

    fun getId(): Int = id

    fun getReason(): err_info = err_info.UNKNOWN

    companion object {
        @JvmStatic
        fun translateToString(code: Int): String = "SDR error $code"

        @JvmStatic
        fun toReason(code: Int): err_info = err_info.UNKNOWN
    }
}
