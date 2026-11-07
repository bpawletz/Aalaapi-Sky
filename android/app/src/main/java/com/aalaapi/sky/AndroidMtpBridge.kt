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
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Android Native MTP Host Bridge for DJI RC 2 Controllers (Vendor ID 0x2CA3).
 * Detects device attachment, enumerates waypoint slots, writes KMZ missions,
 * pulls flight logs over USB MTP, and natively decrypts DJI v13/v14 flight records.
 */
class AndroidMtpBridge(private val context: Context, private val webView: WebView) {

    private val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager
    private var connectedDevice: UsbDevice? = null
    private var mtpDevice: MtpDevice? = null
    private var usbConnection: UsbDeviceConnection? = null

    private var cachedCandidates: List<Pair<Int, MtpObjectInfo>>? = null
    private var cachedCandidatesTimeMs: Long = 0L

    companion object {
        const val DJI_VENDOR_ID = 0x2CA3 // 11427
        const val ACTION_USB_PERMISSION = "com.aalaapi.sky.USB_PERMISSION"

        @Volatile
        private var relayServerStarted = false
        private val relayLock = Any()

        fun extractLogTimestamp(name: String): String {
            val regex = Regex("""\d{4}[-_]?\d{2}[-_]?\d{2}[_\[\-T ]+\d{2}[-\:]?\d{2}[-\:]?\d{2}\]?""")
            return regex.find(name)?.value ?: ""
        }

        fun formatLogDate(name: String, dateModified: Long): String {
            val ts = extractLogTimestamp(name)
            val m = Regex("""(\d{4})[-_]?(\d{2})[-_]?(\d{2})[_\[\-T ]+(\d{2})[-\:]?(\d{2})[-\:]?(\d{2})""").find(ts)
            if (m != null) {
                val (yr, mo, dy, hr, mn, sc) = m.destructured
                return "$yr-$mo-$dy $hr:$mn:$sc"
            }
            if (dateModified > 0) {
                val ms = if (dateModified < 10000000000L) dateModified * 1000L else dateModified
                return SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date(ms))
            }
            return "—"
        }

        fun formatFileSize(bytes: Long): String {
            if (bytes <= 0) return "0 B"
            if (bytes < 1024) return "$bytes B"
            val kb = bytes / 1024.0
            if (kb < 1024) return String.format(Locale.US, "%.1f KB", kb)
            val mb = kb / 1024.0
            return String.format(Locale.US, "%.2f MB", mb)
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
            cachedCandidates = null
            cachedCandidatesTimeMs = 0L
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
        cachedCandidates = null
        cachedCandidatesTimeMs = 0L

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

    private fun ensureKeychainRelayRunning() {
        synchronized(relayLock) {
            if (relayServerStarted) return
            relayServerStarted = true
            Thread {
                try {
                    val server = ServerSocket(18765, 50, InetAddress.getByName("127.0.0.1"))
                    Log.i("AalaapiMtp", "Started DJI keychain loopback relay on 127.0.0.1:18765")
                    while (true) {
                        val client = server.accept()
                        Thread {
                            try {
                                client.soTimeout = 15000
                                val inp = client.getInputStream()
                                val out = client.getOutputStream()
                                val reader = BufferedReader(InputStreamReader(inp, Charsets.UTF_8))
                                val requestLine = reader.readLine()
                                if (requestLine == null) {
                                    client.close()
                                    return@Thread
                                }
                                var contentLength = 0
                                var apiKey = ""
                                var line = reader.readLine()
                                while (!line.isNullOrEmpty()) {
                                    val lower = line.lowercase()
                                    if (lower.startsWith("content-length:")) {
                                        contentLength = line.substringAfter(":").trim().toIntOrNull() ?: 0
                                    } else if (lower.startsWith("api-key:")) {
                                        apiKey = line.substringAfter(":").trim()
                                    }
                                    line = reader.readLine()
                                }
                                val bodyChars = CharArray(contentLength)
                                var readTotal = 0
                                while (readTotal < contentLength) {
                                    val r = reader.read(bodyChars, readTotal, contentLength - readTotal)
                                    if (r <= 0) break
                                    readTotal += r
                                }
                                val bodyStr = String(bodyChars, 0, readTotal)

                                val url = URL("https://dev.dji.com/openapi/v1/flight-records/keychains")
                                val conn = (url.openConnection() as HttpURLConnection).apply {
                                    connectTimeout = 10000
                                    readTimeout = 10000
                                    requestMethod = "POST"
                                    doOutput = true
                                    setRequestProperty("Content-Type", "application/json")
                                    if (apiKey.isNotEmpty()) {
                                        setRequestProperty("Api-Key", apiKey)
                                    }
                                }
                                conn.outputStream.use { it.write(bodyStr.toByteArray(Charsets.UTF_8)) }
                                val code = conn.responseCode
                                val respBytes = if (code in 200..299) {
                                    conn.inputStream.use { it.readBytes() }
                                } else {
                                    conn.errorStream?.use { it.readBytes() } ?: ByteArray(0)
                                }

                                val header = "HTTP/1.1 $code OK\r\nContent-Type: application/json\r\nContent-Length: ${respBytes.size}\r\nConnection: close\r\n\r\n"
                                out.write(header.toByteArray(Charsets.UTF_8))
                                out.write(respBytes)
                                out.flush()
                            } catch (e: Exception) {
                                Log.e("AalaapiMtp", "Keychain relay request error: ${e.message}")
                            } finally {
                                try { client.close() } catch (_: Exception) {}
                            }
                        }.start()
                    }
                } catch (e: Exception) {
                    Log.e("AalaapiMtp", "Failed to start keychain relay server: ${e.message}")
                    relayServerStarted = false
                }
            }.apply { isDaemon = true }.start()
        }
    }

    private data class DecryptResult(
        val success: Boolean,
        val csvFile: File? = null,
        val jsonFile: File? = null,
        val aircraftName: String = "",
        val error: String = ""
    )

    private fun decryptFlightLogIfPossible(rawFile: File, originalFilename: String): DecryptResult {
        val lower = originalFilename.lowercase()
        if (lower.endsWith(".csv")) {
            return DecryptResult(true, csvFile = rawFile)
        }
        val cacheDir = File(context.cacheDir, "decrypted_logs").apply { mkdirs() }
        val safeBase = originalFilename.replace(Regex("""[^a-zA-Z0-9._\-\[\]]"""), "_")
        val outCsv = File(cacheDir, "${safeBase}_decrypted.csv")
        val outJson = File(cacheDir, "${safeBase}_decrypted.json")

        if (outCsv.exists() && outCsv.length() > 100 && outCsv.lastModified() >= rawFile.lastModified()) {
            Log.i("AalaapiMtp", "Using cached decrypted CSV for $originalFilename (${outCsv.length()} bytes)")
            return DecryptResult(true, csvFile = outCsv, jsonFile = if (outJson.exists()) outJson else null)
        }

        val nativeLibDir = context.applicationInfo.nativeLibraryDir
        val djiLogBin = File(nativeLibDir, "libdjilog.so")
        if (!djiLogBin.exists()) {
            Log.w("AalaapiMtp", "libdjilog.so not found in $nativeLibDir")
            return DecryptResult(false, error = "Native decryptor binary (libdjilog.so) not bundled")
        }

        val prefs = context.getSharedPreferences("aalaapi_prefs", Context.MODE_PRIVATE)
        val apiKey = (prefs.getString("dji_developer_key", "") ?: "").trim()

        ensureKeychainRelayRunning()

        return try {
            if (outCsv.exists()) outCsv.delete()
            if (outJson.exists()) outJson.delete()

            val cmd = mutableListOf(
                djiLogBin.absolutePath,
                rawFile.absolutePath,
                "-o", outJson.absolutePath,
                "--csv", outCsv.absolutePath
            )
            if (apiKey.isNotEmpty()) {
                cmd.add("--api-key")
                cmd.add(apiKey)
            }

            Log.i("AalaapiMtp", "Running native dji-log decryptor on $originalFilename (apiKey configured: ${apiKey.isNotEmpty()})...")
            val pb = ProcessBuilder(cmd)
                .directory(cacheDir)
                .redirectErrorStream(true)
            val proc = pb.start()
            val output = proc.inputStream.bufferedReader().use { it.readText() }
            val finished = proc.waitFor(30, TimeUnit.SECONDS)
            if (!finished) {
                proc.destroyForcibly()
                return DecryptResult(false, error = "Decryption timed out after 30s")
            }

            if (proc.exitValue() == 0 && outCsv.exists() && outCsv.length() > 100) {
                var aircraft = ""
                if (outJson.exists() && outJson.length() > 0) {
                    try {
                        val head = outJson.inputStream().bufferedReader().use {
                            val buf = CharArray(2048)
                            val n = it.read(buf)
                            if (n > 0) String(buf, 0, n) else ""
                        }
                        val m = Regex(""""aircraftName"\s*:\s*"([^"]+)"""").find(head)
                        if (m != null) aircraft = m.groupValues[1]
                    } catch (_: Exception) {}
                }
                Log.i("AalaapiMtp", "Successfully decrypted $originalFilename -> ${outCsv.length()} bytes CSV (aircraft: $aircraft)")
                DecryptResult(true, csvFile = outCsv, jsonFile = if (outJson.exists()) outJson else null, aircraftName = aircraft)
            } else {
                Log.w("AalaapiMtp", "dji-log exited with ${proc.exitValue()}: ${output.take(400)}")
                DecryptResult(false, error = output.trim().ifEmpty { "Exit code ${proc.exitValue()}" })
            }
        } catch (e: Exception) {
            Log.e("AalaapiMtp", "Error running native dji-log: ${e.message}", e)
            DecryptResult(false, error = e.message ?: "Decryption exception")
        }
    }

    private fun scanMtpForFlightRecords(
        mtp: MtpDevice,
        storageId: Int,
        parentHandle: Int,
        candidates: MutableList<Pair<Int, MtpObjectInfo>>,
        seenHandles: MutableSet<Int>,
        depth: Int,
        inFlightRecordDir: Boolean = false
    ) {
        if (depth > 8) return
        val handles = mtp.getObjectHandles(storageId, 0, parentHandle) ?: return

        for (handle in handles) {
            if (!seenHandles.add(handle)) continue
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
                    scanMtpForFlightRecords(mtp, storageId, handle, candidates, seenHandles, depth + 1, inFlightRecordDir = isFlightDir)
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

    private fun getSortedMtpCandidates(mtp: MtpDevice, forceRefresh: Boolean = false): List<Pair<Int, MtpObjectInfo>> {
        val now = System.currentTimeMillis()
        val cached = cachedCandidates
        if (!forceRefresh && cached != null && cached.isNotEmpty() && (now - cachedCandidatesTimeMs) < 30_000L) {
            return cached
        }

        val rawCandidates = mutableListOf<Pair<Int, MtpObjectInfo>>()
        val seenHandles = HashSet<Int>()
        val storageIds = mtp.storageIds
        if (storageIds != null) {
            for (storageId in storageIds) {
                scanMtpForFlightRecords(mtp, storageId, 0, rawCandidates, seenHandles, depth = 0)
                if (rawCandidates.isEmpty()) {
                    scanMtpForFlightRecords(mtp, storageId, -1, rawCandidates, seenHandles, depth = 0)
                }
            }
        }

        val deduplicated = rawCandidates
            .distinctBy { it.first }
            .distinctBy { (it.second.name ?: "").lowercase() }
            .sortedWith(
                compareByDescending<Pair<Int, MtpObjectInfo>> {
                    extractLogTimestamp(it.second.name ?: "")
                }.thenByDescending {
                    it.second.dateModified
                }.thenByDescending {
                    it.first
                }
            )

        cachedCandidates = deduplicated
        cachedCandidatesTimeMs = now

        Log.i("AalaapiMtp", "=== TOP FLIGHT RECORD CANDIDATES (Unique: ${deduplicated.size}, Raw: ${rawCandidates.size}) ===")
        deduplicated.take(15).forEachIndexed { i, c ->
            val ts = extractLogTimestamp(c.second.name ?: "")
            Log.i("AalaapiMtp", "#$i: ${c.second.name} | ts: '$ts' | mtime: ${c.second.dateModified} | size: ${c.second.compressedSizeLong} | handle: ${c.first}")
        }
        return deduplicated
    }

    fun listRecentLogs(limit: Int = 30): String {
        val mtp = mtpDevice
        val results = mutableListOf<JSONObject>()
        val cacheDir = File(context.cacheDir, "decrypted_logs")
        if (mtp != null) {
            try {
                val candidates = getSortedMtpCandidates(mtp)
                for (pair in candidates.take(if (limit > 0) limit else 30)) {
                    val info = pair.second
                    val name = info.name ?: "Unknown"
                    val size = info.compressedSizeLong
                    val mtime = info.dateModified
                    val formattedDate = formatLogDate(name, mtime)
                    val safeBase = name.replace(Regex("""[^a-zA-Z0-9._\-\[\]]"""), "_")
                    val cachedCsv = File(cacheDir, "${safeBase}_decrypted.csv")
                    val isAlreadyDecrypted = name.lowercase().endsWith(".csv") || (cachedCsv.exists() && cachedCsv.length() > 100)

                    results.add(JSONObject().apply {
                        put("filename", name)
                        put("timestamp", extractLogTimestamp(name))
                        put("flightDate", formattedDate)
                        put("mtimeFormatted", formattedDate)
                        put("handle", pair.first)
                        put("size", size)
                        put("sizeFormatted", formatFileSize(size))
                        put("dateModified", mtime)
                        put("isDecrypted", isAlreadyDecrypted)
                        put("isDownloaded", isAlreadyDecrypted)
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
                val decResult = decryptFlightLogIfPossible(tempFile, filename)
                val payloadBytes: ByteArray
                val isDecrypted: Boolean
                if (decResult.success && decResult.csvFile != null && decResult.csvFile.exists()) {
                    payloadBytes = decResult.csvFile.readBytes()
                    isDecrypted = true
                } else {
                    payloadBytes = tempFile.readBytes()
                    isDecrypted = false
                }
                val rawSize = tempFile.length()
                tempFile.delete()

                val b64 = Base64.encodeToString(payloadBytes, Base64.NO_WRAP)
                Log.i("AalaapiMtp", "Successfully pulled flight log by handle $handle ($filename, raw: $rawSize bytes, payload: ${payloadBytes.size} bytes, decrypted: $isDecrypted)")
                return JSONObject().apply {
                    put("success", true)
                    put("filename", filename)
                    put("source", "usb_mtp")
                    put("size", rawSize)
                    put("payloadSize", payloadBytes.size)
                    put("isDecrypted", isDecrypted)
                    if (decResult.aircraftName.isNotEmpty()) {
                        put("aircraftName", decResult.aircraftName)
                    }
                    if (!isDecrypted && decResult.error.isNotEmpty()) {
                        put("decryptWarning", decResult.error)
                    }
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
                    webView.evaluateJavascript("console.info('📁 [MTP] Scanned RC 2 storage: found ${candidateHandles.size} unique flight records');", null)
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
                        val decResult = decryptFlightLogIfPossible(latest, latest.name)
                        val payloadBytes = if (decResult.success && decResult.csvFile != null && decResult.csvFile.exists()) {
                            decResult.csvFile.readBytes()
                        } else {
                            latest.readBytes()
                        }
                        val b64 = Base64.encodeToString(payloadBytes, Base64.NO_WRAP)
                        Log.i("AalaapiMtp", "Selected local flight record: ${latest.name} (${payloadBytes.size} bytes, decrypted: ${decResult.success})")
                        return JSONObject().apply {
                            put("success", true)
                            put("filename", latest.name)
                            put("source", "local_storage")
                            put("path", latest.absolutePath)
                            put("size", latest.length())
                            put("payloadSize", payloadBytes.size)
                            put("isDecrypted", decResult.success)
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
