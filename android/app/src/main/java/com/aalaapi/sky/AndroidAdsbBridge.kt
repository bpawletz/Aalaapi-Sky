package com.aalaapi.sky

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL

/**
 * Android Native ADS-B Bridge Client.
 * Connects to dump1090, readsb, or Stratux over Wi-Fi / local socket.
 * Supports:
 * 1. Mode S SBS-1 BaseStation TCP streaming (Port 30003 / 30002)
 * 2. HTTP Web JSON Polling (Port 8080 / 80 /data/aircraft.json)
 * 3. Real-time connection status notifications to WebView UI
 */
class AndroidAdsbBridge(private val context: Context, private val webView: WebView) {

    private val prefs = context.getSharedPreferences("aalaapi_adsb_prefs", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var connectionJob: Job? = null
    private var isRunning = false

    private var currentHost: String = prefs.getString("adsb_host", "127.0.0.1") ?: "127.0.0.1"
    private var currentPort: Int = prefs.getInt("adsb_port", 30003)
    private var isConnected = false
    private var isConnecting = false
    private var messagesReceived = 0L
    private var lastError: String? = null

    // ── USB OTG RTL-SDR Hardware State (Issue #278) ──
    private val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager
    private var sdrDevice: UsbDevice? = null
    private var sdrPermissionGranted = false

    fun getSavedHost(): String = prefs.getString("adsb_host", "127.0.0.1") ?: "127.0.0.1"
    fun getSavedPort(): Int = prefs.getInt("adsb_port", 30003)

    fun onRtlSdrDeviceAttached(device: UsbDevice) {
        try {
            sdrDevice = device
            val mgr = usbManager ?: return
            if (!mgr.hasPermission(device)) {
                val intent = Intent(AndroidMtpBridge.ACTION_USB_PERMISSION).apply {
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
                sdrPermissionGranted = false
            } else {
                sdrPermissionGranted = true
            }
            notifyHardwareChanged()
        } catch (e: Exception) {
            Log.e("AalaapiAdsb", "Error in onRtlSdrDeviceAttached: ${e.message}", e)
        }
    }

    fun onRtlSdrDeviceDetached(device: UsbDevice? = null) {
        if (device == null || sdrDevice?.deviceName == device.deviceName) {
            sdrDevice = null
            sdrPermissionGranted = false
            notifyHardwareChanged()
        }
    }

    fun onRtlSdrPermissionGranted(device: UsbDevice) {
        sdrDevice = device
        sdrPermissionGranted = true
        notifyHardwareChanged()
    }

    fun getHardwareStatusJson(): JSONObject {
        val dev = sdrDevice
        val obj = JSONObject()
        if (dev != null) {
            obj.put("detected", true)
            val rawName = dev.productName?.trim()
            val cleanName = if (!rawName.isNullOrEmpty()) rawName else "Nooelec RTL-SDR v5"
            obj.put("deviceName", cleanName)
            obj.put("vendorId", dev.vendorId)
            obj.put("productId", dev.productId)
            obj.put("platform", "android")
            obj.put("driverStatus", if (sdrPermissionGranted) "ready" else "needs_permission")
            obj.put("details", "RTL-SDR USB dongle connected via USB OTG.")
        } else {
            obj.put("detected", false)
            obj.put("driverStatus", "not_found")
            obj.put("deviceName", JSONObject.NULL)
            obj.put("platform", "android")
            obj.put("details", "No RTL-SDR USB dongle detected.")
        }
        return obj
    }

    fun notifyHardwareChanged() {
        val hwJson = getHardwareStatusJson().toString()
        webView.post {
            webView.evaluateJavascript(
                "if (typeof window.onAdsbHardwareChanged === 'function') { window.onAdsbHardwareChanged($hwJson); }",
                null
            )
        }
    }

    fun start(host: String = getSavedHost(), port: Int = getSavedPort()) {
        if (isRunning) stop()
        isRunning = true
        currentHost = host.trim().ifEmpty { "127.0.0.1" }
        currentPort = if (port > 0) port else 30003

        // Save to SharedPreferences
        prefs.edit()
            .putString("adsb_host", currentHost)
            .putInt("adsb_port", currentPort)
            .apply()

        isConnecting = true
        isConnected = false
        lastError = null
        notifyStatusChanged("connecting")

        connectionJob = scope.launch {
            if (currentPort == 8080 || currentPort == 80) {
                runHttpPollingLoop(currentHost, currentPort)
            } else {
                runTcpStreamingLoop(currentHost, currentPort)
            }
        }
    }

    fun stop() {
        isRunning = false
        isConnecting = false
        isConnected = false
        connectionJob?.cancel()
        connectionJob = null
        notifyStatusChanged("disconnected")
    }

    fun getStatusJson(): String {
        return JSONObject().apply {
            put("connected", isConnected)
            put("connecting", isConnecting)
            put("host", currentHost)
            put("port", currentPort)
            put("mode", if (currentPort == 8080 || currentPort == 80) "http-json" else "tcp-sbs")
            put("messagesReceived", messagesReceived)
            put("lastError", lastError ?: JSONObject.NULL)
            put("hardware", getHardwareStatusJson())
        }.toString()
    }

    private suspend fun CoroutineScope.runTcpStreamingLoop(host: String, port: Int) {
        while (isActive && isRunning) {
            var socket: Socket? = null
            try {
                isConnecting = true
                notifyStatusChanged("connecting")

                socket = Socket()
                socket.connect(InetSocketAddress(host, port), 4000)

                isConnecting = false
                isConnected = true
                lastError = null
                notifyStatusChanged("connected")

                val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
                while (isActive && isRunning) {
                    val line = reader.readLine() ?: break
                    if (line.startsWith("MSG,") || line.startsWith("*")) {
                        messagesReceived++
                        dispatchLine(line)
                    }
                }
            } catch (e: Exception) {
                isConnecting = false
                isConnected = false
                lastError = e.message ?: "Connection failed"
                notifyStatusChanged("error", lastError)
                delay(3000) // Backoff before reconnect
            } finally {
                try { socket?.close() } catch (_: Exception) {}
            }
        }
    }

    private suspend fun CoroutineScope.runHttpPollingLoop(host: String, port: Int) {
        val paths = listOf("/data/aircraft.json", "/tar1090/data/aircraft.json", "/aircraft.json")
        var workingPath = paths[0]

        while (isActive && isRunning) {
            var success = false
            for (path in listOf(workingPath) + paths) {
                try {
                    val url = URL("http://$host:$port$path")
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 3000
                        readTimeout = 3000
                        requestMethod = "GET"
                        setRequestProperty("User-Agent", "AalaapiSky-Android/1.0")
                    }
                    val code = conn.responseCode
                    if (code in 200..299) {
                        val jsonText = conn.inputStream.bufferedReader().use { it.readText() }
                        workingPath = path
                        success = true
                        isConnecting = false
                        isConnected = true
                        lastError = null
                        messagesReceived++
                        notifyStatusChanged("connected")
                        dispatchJson(jsonText)
                        conn.disconnect()
                        break
                    }
                    conn.disconnect()
                } catch (_: Exception) {}
            }

            if (!success) {
                isConnected = false
                lastError = "HTTP poll failed on $host:$port"
                notifyStatusChanged("error", lastError)
            }

            delay(2000) // Poll every 2 seconds
        }
    }

    private fun dispatchLine(line: String) {
        val escaped = line.replace("\\", "\\\\").replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript(
                "if (typeof window.ingestAdsbSbsLine === 'function') { window.ingestAdsbSbsLine('$escaped'); }",
                null
            )
        }
    }

    private fun dispatchJson(jsonStr: String) {
        val escaped = jsonStr.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "").replace("\r", "")
        webView.post {
            webView.evaluateJavascript(
                "if (typeof window.ingestAdsbJson === 'function') { window.ingestAdsbJson('$escaped'); }",
                null
            )
        }
    }

    private fun notifyStatusChanged(status: String, errorMsg: String? = null) {
        val err = errorMsg?.replace("'", "\\'") ?: ""
        webView.post {
            webView.evaluateJavascript(
                "if (typeof window.onAdsbStatusChanged === 'function') { window.onAdsbStatusChanged('$status', '$currentHost', $currentPort, '$err'); }",
                null
            )
        }
    }

    fun tuneCommsDaemon(mode: String, freqHz: Long, squelch: Int): String {
        return try {
            val intent = Intent("com.aalaapi.comms.ACTION_TUNE").apply {
                setPackage("com.aalaapi.comms")
                putExtra("mode", mode)
                putExtra("freqHz", freqHz)
                putExtra("squelch", squelch)
            }
            context.sendBroadcast(intent)
            JSONObject().apply {
                put("success", true)
                put("mode", mode)
                put("freqHz", freqHz)
                put("squelch", squelch)
            }.toString()
        } catch (e: Exception) {
            JSONObject().apply {
                put("success", false)
                put("error", e.message)
            }.toString()
        }
    }

    fun launchCommsApp(): Boolean {
        return try {
            val pm = context.packageManager
            val intent = pm.getLaunchIntentForPackage("com.aalaapi.comms")
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                true
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
    }
}
