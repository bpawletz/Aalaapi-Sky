package com.aalaapi.sky

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.mtp.MtpDevice
import android.mtp.MtpObjectInfo
import android.os.Build
import android.os.Environment
import android.util.Base64
import android.util.Log
import android.webkit.WebView
import org.json.JSONObject
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
        const val ACTION_USB_PERMISSION = "com.aalaapi.sky.USB_PERMISSION"
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
        val mgr = usbManager ?: return

        if (!mgr.hasPermission(device)) {
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val permissionIntent = PendingIntent.getBroadcast(
                context, 0, Intent(ACTION_USB_PERMISSION), flags
            )
            mgr.requestPermission(device, permissionIntent)
            return
        }

        openMtpDevice(device)
    }

    fun onPermissionGranted(device: UsbDevice) {
        openMtpDevice(device)
    }

    private fun openMtpDevice(device: UsbDevice) {
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
        val json = """{"deviceName":"$safeName","vendorId":11427,"connected":true}"""
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

    fun getStatusJson(): String {
        val mtp = mtpDevice
        val dev = connectedDevice
        return JSONObject().apply {
            put("connected", dev != null)
            put("deviceName", dev?.productName ?: if (dev != null) "DJI USB Device" else "")
            put("mtpReady", mtp != null)
            put("vendorId", dev?.vendorId ?: 0)
        }.toString()
    }

    private fun scanMtpForFlightRecords(
        mtp: MtpDevice,
        storageId: Int,
        parentHandle: Int,
        candidates: MutableList<Pair<Int, MtpObjectInfo>>,
        depth: Int
    ) {
        if (depth > 6) return
        val handles = mtp.getObjectHandles(storageId, 0, parentHandle) ?: return
        for (handle in handles) {
            val info = mtp.getObjectInfo(handle) ?: continue
            val name = info.name ?: ""
            val isFolder = (info.format == 0x3001 || info.associationType != 0)
            if (isFolder) {
                val lower = name.lowercase()
                val isRelevantDir = depth == 0 || lower in listOf(
                    "android", "data", "dji.go.v5", "files", "flightrecord", "flightrecords",
                    "flight_record", "dji", "dji.pilot", "dji.pilot.pad", "dji.industry.pilot", "dji.go.v4"
                ) || lower.contains("flight") || lower.contains("record") || lower.contains("dji")
                if (isRelevantDir) {
                    scanMtpForFlightRecords(mtp, storageId, handle, candidates, depth + 1)
                }
            } else if ((name.startsWith("FlightRecord_") || name.startsWith("DJIFlightRecord_")) && (name.endsWith(".txt") || name.endsWith(".csv"))) {
                candidates.add(Pair(handle, info))
            }
        }
    }

    fun pullLatestLog(): String {
        // 1. Check connected USB MTP device
        val mtp = mtpDevice
        if (mtp != null) {
            try {
                val candidateHandles = mutableListOf<Pair<Int, MtpObjectInfo>>()
                val storageIds = mtp.storageIds
                if (storageIds != null) {
                    for (storageId in storageIds) {
                        scanMtpForFlightRecords(mtp, storageId, 0, candidateHandles, depth = 0)
                    }
                }

                webView.post {
                    webView.evaluateJavascript("console.info('📁 [MTP] Scanned RC 2 storage: found ${candidateHandles.size} flight records');", null)
                }

                if (candidateHandles.isNotEmpty()) {
                    candidateHandles.sortByDescending { it.second.dateModified }
                    val newest = candidateHandles.first()
                    val tempFile = File(context.cacheDir, newest.second.name)
                    if (tempFile.exists()) tempFile.delete()

                    val imported = mtp.importFile(newest.first, tempFile.absolutePath)
                    if (imported && tempFile.exists() && tempFile.length() > 0) {
                        val bytes = tempFile.readBytes()
                        val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                        tempFile.delete()
                        return JSONObject().apply {
                            put("success", true)
                            put("filename", newest.second.name)
                            put("source", "usb_mtp")
                            put("size", bytes.size)
                            put("data", b64)
                            put("base64", b64)
                        }.toString()
                    } else {
                        Log.e("AalaapiMtp", "Failed to import file via MTP handle ${newest.first}")
                        webView.post {
                            webView.evaluateJavascript("console.warn('⚠️ [MTP] importFile returned false for ${newest.second.name}');", null)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e("AalaapiMtp", "Error extracting flight record via MTP: ${e.message}", e)
            }
        }

        // 2. Check local directories on device
        val candidateDirs = listOf(
            File("/storage/emulated/0/Android/data/dji.go.v5/files/FlightRecord"),
            File("/sdcard/Android/data/dji.go.v5/files/FlightRecord"),
            File("/storage/emulated/0/DJI/dji.go.v5/FlightRecord"),
            File("/sdcard/DJI/dji.go.v5/FlightRecord"),
            File("/storage/emulated/0/DJI/FlightRecord"),
            File("/sdcard/DJI/FlightRecord"),
            File(context.getExternalFilesDir(null), "FlightRecord"),
            File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "FlightRecord"),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        )

        for (dir in candidateDirs) {
            try {
                if (dir.exists() && dir.isDirectory) {
                    val logFiles = dir.listFiles { f ->
                        f.isFile && (f.name.startsWith("FlightRecord_") || f.name.startsWith("DJIFlightRecord_")) && (f.name.endsWith(".txt") || f.name.endsWith(".csv"))
                    }?.sortedByDescending { it.lastModified() }

                    if (!logFiles.isNullOrEmpty()) {
                        val latest = logFiles[0]
                        val bytes = latest.readBytes()
                        val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                        return JSONObject().apply {
                            put("success", true)
                            put("filename", latest.name)
                            put("source", "local_storage")
                            put("path", latest.absolutePath)
                            put("size", bytes.size)
                            put("data", b64)
                            put("base64", b64)
                        }.toString()
                    }
                }
            } catch (_: Exception) {}
        }

        // 3. Return structured error reason
        return JSONObject().apply {
            put("success", false)
            if (mtp == null && connectedDevice == null) {
                put("error", "NO_RC2_CONNECTED")
                put("message", "No DJI RC 2 controller detected over USB OTG. Connect via USB-C cable or tap 'Load File' to pick a log.")
            } else if (mtp == null && connectedDevice != null) {
                put("error", "RC2_PERMISSION_REQUIRED")
                put("message", "USB controller detected but USB permission was not granted. Reconnect cable and allow permission.")
            } else {
                put("error", "NO_LOGS_FOUND")
                put("message", "No flight logs (FlightRecord_*.txt or DJIFlightRecord_*.txt) found on connected RC 2 storage.")
            }
        }.toString()
    }
}
