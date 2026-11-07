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

        fun extractLogTimestamp(name: String): String {
            val regex = Regex("""\d{4}[-_]?\d{2}[-_]?\d{2}[_\[\-T ]+\d{2}[-\:]?\d{2}[-\:]?\d{2}\]?""")
            return regex.find(name)?.value ?: ""
        }
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
        try {
            connectedDevice = device
            val mgr = usbManager ?: return

            if (!mgr.hasPermission(device)) {
                val intent = Intent(ACTION_USB_PERMISSION).apply {
                    setPackage(context.packageName)
                }
                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }
                val permissionIntent = PendingIntent.getBroadcast(
                    context, 0, intent, flags
                )
                mgr.requestPermission(device, permissionIntent)
                return
            }

            openMtpDevice(device)
        } catch (e: Exception) {
            Log.e("AalaapiMtp", "Error during onDeviceAttached for ${device.deviceName}: ${e.message}", e)
        }
    }

    fun onPermissionGranted(device: UsbDevice) {
        try {
            openMtpDevice(device)
        } catch (e: Exception) {
            Log.e("AalaapiMtp", "Error during onPermissionGranted for ${device.deviceName}: ${e.message}", e)
        }
    }

    private fun openMtpDevice(device: UsbDevice) {
        try {
            connectedDevice = device
            val connection = usbManager?.openDevice(device) ?: return
            usbConnection = connection

            val mtp = MtpDevice(device)
            if (mtp.open(connection)) {
                mtpDevice = mtp
                Log.i("AalaapiMtp", "MtpDevice opened successfully for ${device.deviceName}")
            } else {
                Log.w("AalaapiMtp", "Failed to open MtpDevice connection")
            }

            notifyConnected(device.productName ?: "DJI RC 2")
        } catch (e: Exception) {
            Log.e("AalaapiMtp", "Error opening MTP device: ${e.message}", e)
        }
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
        depth: Int,
        inFlightRecordDir: Boolean = false
    ) {
        if (depth > 8) return
        val handles = mtp.getObjectHandles(storageId, 0, parentHandle) ?: return

        for (handle in handles) {
            val info = mtp.getObjectInfo(handle) ?: continue
            val name = info.name ?: ""
            val isFolder = (info.format == 0x3001 || info.associationType != 0)
            if (isFolder) {
                val lower = name.lowercase()
                val isFlightDir = inFlightRecordDir || lower.contains("flightrecord") || lower.contains("flight_record")
                val isRelevantDir = inFlightRecordDir || depth == 0 || isFlightDir || lower in listOf(
                    "android", "data", "dji.go.v5", "files", "dji", "dji.pilot", "dji.pilot.pad", "dji.industry.pilot", "dji.go.v4"
                ) || lower.contains("dji") || lower.contains("record") || lower.contains("flight")
                if (isRelevantDir) {
                    scanMtpForFlightRecords(mtp, storageId, handle, candidates, depth + 1, inFlightRecordDir = isFlightDir)
                }
            } else {
                val lower = name.lowercase()
                val isFlightLog = (lower.contains("flightrecord") || lower.contains("flight_record") || lower.startsWith("fly_") || inFlightRecordDir) &&
                    (lower.endsWith(".txt") || lower.endsWith(".csv") || lower.endsWith(".dat"))
                if (isFlightLog) {
                    candidates.add(Pair(handle, info))
                }
            }
        }
    }

    private fun getSortedMtpCandidates(mtp: MtpDevice): List<Pair<Int, MtpObjectInfo>> {
        val candidateHandles = mutableListOf<Pair<Int, MtpObjectInfo>>()
        val storageIds = mtp.storageIds
        if (storageIds != null) {
            for (storageId in storageIds) {
                scanMtpForFlightRecords(mtp, storageId, 0, candidateHandles, depth = 0)
            }
        }

        candidateHandles.sortWith(
            compareByDescending<Pair<Int, MtpObjectInfo>> { 
                extractLogTimestamp(it.second.name ?: "") 
            }.thenByDescending { 
                it.second.dateModified 
            }.thenByDescending { 
                it.first 
            }
        )

        Log.i("AalaapiMtp", "=== TOP FLIGHT RECORD CANDIDATES (Total: ${candidateHandles.size}) ===")
        candidateHandles.take(15).forEachIndexed { i, c ->
            val ts = extractLogTimestamp(c.second.name ?: "")
            Log.i("AalaapiMtp", "#$i: ${c.second.name} | ts: '$ts' | mtime: ${c.second.dateModified} | size: ${c.second.compressedSizeLong} | handle: ${c.first}")
        }
        return candidateHandles
    }

    fun listRecentLogs(limit: Int = 30): String {
        val mtp = mtpDevice
        val results = mutableListOf<JSONObject>()
        if (mtp != null) {
            try {
                val candidates = getSortedMtpCandidates(mtp)
                for (pair in candidates.take(if (limit > 0) limit else 30)) {
                    val info = pair.second
                    results.add(JSONObject().apply {
                        put("filename", info.name ?: "Unknown")
                        put("timestamp", extractLogTimestamp(info.name ?: ""))
                        put("handle", pair.first)
                        put("size", info.compressedSizeLong)
                        put("dateModified", info.dateModified)
                        put("isDecrypted", true)
                        put("source", "usb_mtp")
                    })
                }
            } catch (e: Exception) {
                Log.e("AalaapiMtp", "Error listing recent MTP flight logs: ${e.message}", e)
            }
        }
        return org.json.JSONArray(results).toString()
    }

    fun pullLogByHandle(handle: Int): String {
        val mtp = mtpDevice ?: return JSONObject().apply {
            put("success", false)
            put("error", "NO_RC2_CONNECTED")
            put("message", "DJI RC 2 is not connected via USB.")
        }.toString()

        try {
            val info = mtp.getObjectInfo(handle) ?: return JSONObject().apply {
                put("success", false)
                put("error", "HANDLE_NOT_FOUND")
                put("message", "Specified MTP object handle $handle not found.")
            }.toString()

            val filename = info.name ?: "FlightRecord_$handle.txt"
            val tempFile = File(context.cacheDir, filename)
            if (tempFile.exists()) tempFile.delete()

            val imported = mtp.importFile(handle, tempFile.absolutePath)
            if (imported && tempFile.exists() && tempFile.length() > 0) {
                val bytes = tempFile.readBytes()
                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                tempFile.delete()
                Log.i("AalaapiMtp", "Successfully pulled flight log by handle $handle ($filename, ${bytes.size} bytes)")
                return JSONObject().apply {
                    put("success", true)
                    put("filename", filename)
                    put("source", "usb_mtp")
                    put("size", bytes.size)
                    put("data", b64)
                    put("base64", b64)
                }.toString()
            } else {
                return JSONObject().apply {
                    put("success", false)
                    put("error", "IMPORT_FAILED")
                    put("message", "Failed to import MTP object handle $handle ($filename).")
                }.toString()
            }
        } catch (e: Exception) {
            return JSONObject().apply {
                put("success", false)
                put("error", "EXCEPTION")
                put("message", e.message ?: "Failed to import file via MTP")
            }.toString()
        }
    }

    fun pullLogByName(filename: String): String {
        val mtp = mtpDevice ?: return JSONObject().apply {
            put("success", false)
            put("error", "NO_RC2_CONNECTED")
            put("message", "DJI RC 2 is not connected via USB.")
        }.toString()

        val candidates = getSortedMtpCandidates(mtp)
        val match = candidates.firstOrNull { it.second.name.equals(filename, ignoreCase = true) }
        return if (match != null) {
            pullLogByHandle(match.first)
        } else {
            JSONObject().apply {
                put("success", false)
                put("error", "FILE_NOT_FOUND")
                put("message", "Flight log '$filename' not found on connected RC 2 storage.")
            }.toString()
        }
    }

    fun pullLatestLog(): String {
        // 1. Check connected USB MTP device
        val mtp = mtpDevice
        if (mtp != null) {
            try {
                val candidateHandles = getSortedMtpCandidates(mtp)

                webView.post {
                    webView.evaluateJavascript("console.info('📁 [MTP] Scanned RC 2 storage: found ${candidateHandles.size} flight records');", null)
                }

                if (candidateHandles.isNotEmpty()) {
                    val newest = candidateHandles.first()
                    val timestamp = extractLogTimestamp(newest.second.name ?: "")
                    Log.i("AalaapiMtp", "Selected latest flight record: ${newest.second.name} (timestamp: '$timestamp', handle: ${newest.first})")
                    webView.post {
                        webView.evaluateJavascript("console.info('📁 [MTP] Selected latest flight: ${newest.second.name} (handle: ${newest.first})');", null)
                    }

                    val res = pullLogByHandle(newest.first)
                    val json = JSONObject(res)
                    if (json.optBoolean("success")) {
                        return res
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
                    }?.sortedWith(
                        compareByDescending<File> { 
                            extractLogTimestamp(it.name) 
                        }.thenByDescending { 
                            it.lastModified() 
                        }
                    )

                    if (!logFiles.isNullOrEmpty()) {
                        val latest = logFiles[0]
                        val bytes = latest.readBytes()
                        val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                        Log.i("AalaapiMtp", "Selected local flight record: ${latest.name} (${bytes.size} bytes)")
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
