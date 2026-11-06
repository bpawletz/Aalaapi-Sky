package com.aalaapi.sky

import android.content.Context
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

    fun getSavedHost(): String = prefs.getString("adsb_host", "127.0.0.1") ?: "127.0.0.1"
    fun getSavedPort(): Int = prefs.getInt("adsb_port", 30003)

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
        }.toString()
    }

    private suspend fun runTcpStreamingLoop(host: String, port: Int) {
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

    private suspend fun runHttpPollingLoop(host: String, port: Int) {
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
}
