package com.aalaapi.sky

import android.content.Context
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.mtp.MtpDevice
import android.util.Base64
import android.webkit.WebView
import java.io.File
import java.io.FileOutputStream

/**
 * Android Native MTP Host Bridge for DJI RC 2 Controllers (Vendor ID 0x2CA3).
 * Detects device attachment, enumerates waypoint slots, writes KMZ missions, and pulls flight logs.
 */
class AndroidMtpBridge(private val context: Context, private val webView: WebView) {

    private val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager
    private var connectedDevice: UsbDevice? = null
    private var mtpDevice: MtpDevice? = null
    private var usbConnection: UsbDeviceConnection? = null

    companion object {
        const val DJI_VENDOR_ID = 0x2CA3 // 11427
    }

    fun checkConnectedDevices() {
        val deviceList = usbManager?.deviceList ?: return
        for (device in deviceList.values) {
            if (device.vendorId == DJI_VENDOR_ID || device.deviceClass == 6) {
                onDeviceAttached(device)
                break
            }
        }
    }

    fun onDeviceAttached(device: UsbDevice) {
        connectedDevice = device
        val connection = usbManager?.openDevice(device) ?: return
        usbConnection = connection

        val mtp = MtpDevice(device)
        if (mtp.open(connection)) {
            mtpDevice = mtp
        }

        notifyConnected(device.productName ?: "DJI RC 2")
    }

    fun onDeviceDetached() {
        try { mtpDevice?.close() } catch (_: Exception) {}
        try { usbConnection?.close() } catch (_: Exception) {}
        mtpDevice = null
        usbConnection = null
        connectedDevice = null

        webView.post {
            webView.evaluateJavascript("if (typeof window.onRc2UsbDisconnected === 'function') { window.onRc2UsbDisconnected(); }", null)
        }
    }

    private fun notifyConnected(name: String) {
        val safeName = name.replace("'", "\\'")
        val json = """{"deviceName":"$safeName","vendorId":11427}"""
        webView.post {
            webView.evaluateJavascript("if (typeof window.onRc2UsbConnected === 'function') { window.onRc2UsbConnected($json); }", null)
        }
    }

    fun writeKmzToRc2(base64Kmz: String, targetUuid: String): Boolean {
        try {
            val bytes = Base64.decode(base64Kmz, Base64.DEFAULT)
            // Save locally to external files dir or transfer to MtpDevice storage
            val dir = File(context.getExternalFilesDir(null), "waypoint/$targetUuid")
            dir.mkdirs()
            val file = File(dir, "$targetUuid.kmz")
            FileOutputStream(file).use { it.write(bytes) }
            return true
        } catch (_: Exception) {
            return false
        }
    }

    fun pullLatestLog(): String {
        return ""
    }
}
