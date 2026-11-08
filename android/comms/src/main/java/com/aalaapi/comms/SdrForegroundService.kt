package com.aalaapi.comms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Android Foreground Service hosting the RTL-SDR USB Engine, TCP SBS-1 Server (Port 30003),
 * and HTTP Control / Telemetry Server (Port 8080).
 */
class SdrForegroundService : Service() {

    inner class LocalBinder : Binder() {
        fun getService(): SdrForegroundService = this@SdrForegroundService
    }

    private val binder = LocalBinder()
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private lateinit var usbManager: UsbManager
    private lateinit var sdrEngine: RtlSdrUsbEngine

    private var tcpServerSocket: ServerSocket? = null
    private var httpServerSocket: ServerSocket? = null
    private val tcpClients = CopyOnWriteArrayList<Socket>()
    private val trackedAircraft = ConcurrentHashMap<String, JSONObject>()
    private val recentAcarsMessages = CopyOnWriteArrayList<JSONObject>()

    var activeDevice: UsbDevice? = null
        private set
    var packetsReceived = 0L
        private set

    override fun onCreate() {
        super.onCreate()
        usbManager = getSystemService(Context.USB_SERVICE) as UsbManager
        sdrEngine = RtlSdrUsbEngine(usbManager, scope)

        sdrEngine.onAdsbSbsLine = { line ->
            packetsReceived++
            broadcastSbsLine(line)
            parseAndUpdateAircraft(line)
        }

        sdrEngine.onAcarsMessage = { acarsJson ->
            recentAcarsMessages.add(0, acarsJson)
            if (recentAcarsMessages.size > 50) recentAcarsMessages.removeAt(recentAcarsMessages.size - 1)
        }

        startForegroundNotification()
        startTcpServer(30003)
        startHttpServer(8080)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent != null) {
            val action = intent.action
            if (action == ACTION_TUNE || action == "com.aalaapi.comms.ACTION_TUNE") {
                val modeStr = intent.getStringExtra("mode") ?: "ADSB_1090"
                val freqHz = intent.getLongExtra("freqHz", 1090000000L)
                val squelch = intent.getIntExtra("squelch", -45)
                val mode = try { RtlSdrUsbEngine.SdrMode.valueOf(modeStr) } catch (_: Exception) { RtlSdrUsbEngine.SdrMode.ADSB_1090 }
                sdrEngine.tune(mode, freqHz, squelch)
            }

            val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
            }
            if (device != null) {
                startSdr(device)
            }
        }
        return START_STICKY
    }

    fun startSdr(device: UsbDevice, mode: RtlSdrUsbEngine.SdrMode = RtlSdrUsbEngine.SdrMode.ADSB_1090, freqHz: Long = 1090000000L): Boolean {
        activeDevice = device
        return sdrEngine.start(device, mode, freqHz)
    }

    fun stopSdr() {
        sdrEngine.stop()
        activeDevice = null
    }

    fun tuneSdr(mode: RtlSdrUsbEngine.SdrMode, freqHz: Long, squelchDbfs: Int = -45): Boolean {
        return sdrEngine.tune(mode, freqHz, squelchDbfs)
    }

    fun getEngine(): RtlSdrUsbEngine = sdrEngine

    fun getStatusJson(): JSONObject {
        return JSONObject().apply {
            put("running", sdrEngine.isStreaming)
            put("mode", sdrEngine.currentMode.name)
            put("freqHz", sdrEngine.currentFreqHz)
            put("freqMhz", sdrEngine.currentFreqHz / 1e6)
            put("squelchDbfs", sdrEngine.currentSquelchDbfs)
            put("packetsReceived", packetsReceived)
            put("activeTcpClients", tcpClients.size)
            put("aircraftCount", trackedAircraft.size)
            put("device", activeDevice?.productName ?: "Nooelec RTL-SDR v5")
        }
    }

    private fun startForegroundNotification() {
        val channelId = "aalaapi_comms_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Aalaapi Comms SDR Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background SDR streaming and aviation radio daemon"
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }

        val launchIntent = Intent(this, CommsMainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Aalaapi Comms SDR Active")
            .setContentText("Broadcasting ADS-B on TCP 30003 & HTTP 8080")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()

        startForeground(1090, notification)
    }

    // ─── Local TCP SBS-1 Server (Port 30003) ──────────────────────────────────
    private fun startTcpServer(port: Int) {
        scope.launch {
            try {
                tcpServerSocket = ServerSocket(port)
                while (isActive) {
                    val socket = tcpServerSocket?.accept() ?: break
                    tcpClients.add(socket)
                    Log.i("AalaapiComms", "Accepted TCP SBS client: ${socket.inetAddress.hostAddress}")
                }
            } catch (e: Exception) {
                if (isActive) Log.e("AalaapiComms", "TCP Server error: ${e.message}")
            }
        }
    }

    private fun broadcastSbsLine(line: String) {
        val deadSockets = mutableListOf<Socket>()
        for (sock in tcpClients) {
            try {
                val out = sock.getOutputStream()
                out.write((line + "\r\n").toByteArray(Charsets.UTF_8))
                out.flush()
            } catch (_: Exception) {
                deadSockets.add(sock)
            }
        }
        for (dead in deadSockets) {
            try { dead.close() } catch (_: Exception) {}
            tcpClients.remove(dead)
        }
    }

    private fun parseAndUpdateAircraft(line: String) {
        val parts = line.split(",")
        if (parts.size < 11 || parts[0] != "MSG") return
        val hex = parts[4].trim().uppercase()
        val ac = trackedAircraft.getOrPut(hex) {
            JSONObject().apply {
                put("hex", hex)
                put("callsign", hex)
                put("lastSeen", System.currentTimeMillis())
            }
        }
        val subType = parts[1].toIntOrNull() ?: 0
        if (subType == 1 && parts[10].isNotEmpty()) {
            ac.put("callsign", parts[10].trim())
        }
        if (subType == 3) {
            val alt = parts[11].toIntOrNull()
            if (alt != null) ac.put("altitude", alt)
            val lat = parts[14].toDoubleOrNull()
            val lon = parts[15].toDoubleOrNull()
            if (lat != null && lon != null) {
                ac.put("lat", lat)
                ac.put("lon", lon)
            }
        }
        if (subType == 4) {
            val spd = parts[12].toDoubleOrNull()
            if (spd != null) ac.put("speed", spd)
            val trk = parts[13].toDoubleOrNull()
            if (trk != null) ac.put("track", trk)
        }
        ac.put("lastSeen", System.currentTimeMillis())
    }

    // ─── Local HTTP Server (Port 8080) ────────────────────────────────────────
    private fun startHttpServer(port: Int) {
        scope.launch {
            try {
                httpServerSocket = ServerSocket(port)
                while (isActive) {
                    val socket = httpServerSocket?.accept() ?: break
                    launch(Dispatchers.IO) {
                        handleHttpRequest(socket)
                    }
                }
            } catch (e: Exception) {
                if (isActive) Log.e("AalaapiComms", "HTTP Server error: ${e.message}")
            }
        }
    }

    private fun handleHttpRequest(socket: Socket) {
        try {
            val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
            val reqLine = reader.readLine() ?: return
            val parts = reqLine.split(" ")
            if (parts.size < 2) return
            val path = parts[1]

            val out = PrintWriter(socket.getOutputStream(), true)
            val corsHeaders = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n"

            when {
                path.startsWith("/data/aircraft.json") || path.startsWith("/aircraft.json") -> {
                    val arr = JSONArray(trackedAircraft.values)
                    val body = JSONObject().apply {
                        put("now", System.currentTimeMillis() / 1000.0)
                        put("aircraft", arr)
                    }.toString()
                    out.print("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n$corsHeaders\r\n$body")
                }
                path.startsWith("/data/acars.json") -> {
                    val arr = JSONArray(recentAcarsMessages)
                    val body = arr.toString()
                    out.print("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n$corsHeaders\r\n$body")
                }
                path.startsWith("/api/comms/status") -> {
                    val body = getStatusJson().toString()
                    out.print("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n$corsHeaders\r\n$body")
                }
                path.startsWith("/api/comms/tune") -> {
                    // Query params: ?mode=airband&freqHz=122800000&squelch=-45
                    var mode = sdrEngine.currentMode
                    var freqHz = sdrEngine.currentFreqHz
                    var squelch = sdrEngine.currentSquelchDbfs

                    val qIdx = path.indexOf('?')
                    if (qIdx != -1) {
                        val query = path.substring(qIdx + 1)
                        query.split("&").forEach { param ->
                            val kv = param.split("=")
                            if (kv.size == 2) {
                                when (kv[0]) {
                                    "mode" -> {
                                        val mStr = kv[1].uppercase()
                                        mode = when {
                                            mStr.contains("AIRBAND") || mStr.contains("AM") -> RtlSdrUsbEngine.SdrMode.AIRBAND_AM
                                            mStr.contains("ACARS") -> RtlSdrUsbEngine.SdrMode.ACARS_VHF
                                            else -> RtlSdrUsbEngine.SdrMode.ADSB_1090
                                        }
                                    }
                                    "freqHz" -> kv[1].toLongOrNull()?.let { freqHz = it }
                                    "squelch" -> kv[1].toIntOrNull()?.let { squelch = it }
                                }
                            }
                        }
                    }
                    val ok = sdrEngine.tune(mode, freqHz, squelch)
                    val resp = JSONObject().apply {
                        put("success", ok)
                        put("mode", mode.name)
                        put("freqHz", freqHz)
                        put("squelchDbfs", squelch)
                    }.toString()
                    out.print("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n$corsHeaders\r\n$resp")
                }
                else -> {
                    out.print("HTTP/1.1 404 Not Found\r\n$corsHeaders\r\n")
                }
            }
            out.flush()
        } catch (_: Exception) {} finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        sdrEngine.stop()
        try { tcpServerSocket?.close() } catch (_: Exception) {}
        try { httpServerSocket?.close() } catch (_: Exception) {}
        for (sock in tcpClients) {
            try { sock.close() } catch (_: Exception) {}
        }
        scope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder = binder

    companion object {
        const val ACTION_TUNE = "com.aalaapi.comms.ACTION_TUNE"
    }
}
