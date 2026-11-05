package com.aalaapi.sky

import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Android Native SBS-1 BaseStation TCP Socket Client (Port 30003).
 * Connects to dump1090, readsb, or Stratux over Wi-Fi / local socket,
 * streaming CSV lines directly into the web application.
 */
class AndroidAdsbBridge(private val webView: WebView) {

    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var connectionJob: Job? = null
    private var isRunning = false

    fun start(host: String = "127.0.0.1", port: Int = 30003) {
        if (isRunning) stop()
        isRunning = true

        connectionJob = scope.launch {
            while (isActive && isRunning) {
                var socket: Socket? = null
                try {
                    socket = Socket()
                    socket.connect(InetSocketAddress(host, port), 4000)
                    val reader = BufferedReader(InputStreamReader(socket.getInputStream()))

                    while (isActive && isRunning) {
                        val line = reader.readLine() ?: break
                        if (line.startsWith("MSG,")) {
                            dispatchLine(line)
                        }
                    }
                } catch (_: Exception) {
                    delay(3000) // Backoff before reconnect
                } finally {
                    try { socket?.close() } catch (_: Exception) {}
                }
            }
        }
    }

    fun stop() {
        isRunning = false
        connectionJob?.cancel()
        connectionJob = null
    }

    private fun dispatchLine(line: String) {
        val escaped = line.replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript(
                "if (typeof window.ingestAdsbSbsLine === 'function') { window.ingestAdsbSbsLine('$escaped'); }",
                null
            )
        }
    }
}
