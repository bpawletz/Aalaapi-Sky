package com.aalaapi.comms

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.ServiceConnection
import android.graphics.Color
import android.graphics.Typeface
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Native Dark-Theme Aviation Scanner UI for Aalaapi Comms.
 */
class CommsMainActivity : AppCompatActivity() {

    private lateinit var usbManager: UsbManager
    private var service: SdrForegroundService? = null
    private var isBound = false

    private lateinit var statusText: TextView
    private lateinit var modeText: TextView
    private lateinit var freqInput: EditText
    private lateinit var squelchText: TextView
    private lateinit var squelchBar: SeekBar
    private lateinit var meterText: TextView
    private lateinit var meterBar: android.widget.ProgressBar
    private lateinit var clientsText: TextView
    private lateinit var logView: TextView
    private lateinit var logScroll: ScrollView
    private var lastMeterUiUpdate: Long = 0L

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            val localBinder = binder as SdrForegroundService.LocalBinder
            service = localBinder.getService()
            isBound = true
            setupEngineCallbacks()
            scanAndAttachUsb()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
            isBound = false
        }
    }

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_USB_PERMISSION -> {
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
                    }
                    if (granted && device != null) {
                        service?.startSdr(device)
                        appendLog("USB permission granted for ${device.productName}. Streaming started.")
                    } else {
                        appendLog("USB permission denied.")
                    }
                }
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    scanAndAttachUsb()
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    service?.stopSdr()
                    appendLog("USB RTL-SDR disconnected.")
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        usbManager = getSystemService(Context.USB_SERVICE) as UsbManager

        // Build UI programmatically for maximum portability without XML layout overhead
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0b1120"))
            setPadding(32, 48, 32, 32)
        }

        // Header Title
        val header = TextView(this).apply {
            text = "📡 AALAAPI COMMS • SDR DAEMON"
            setTextColor(Color.parseColor("#38bdf8"))
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER_HORIZONTAL
        }
        root.addView(header)

        // Sub-Status Banner
        statusText = TextView(this).apply {
            text = "Initializing SDR service on TCP 30003 & HTTP 8080..."
            setTextColor(Color.parseColor("#94a3b8"))
            textSize = 12f
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, 8, 0, 24)
        }
        root.addView(statusText)

        // Mode Selector Row
        val modeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 16)
        }
        val btnAdsb = createChipButton("✈️ ADS-B (1090 MHz)") {
            service?.tuneSdr(RtlSdrUsbEngine.SdrMode.ADSB_1090, 1090000000L)
            updateModeDisplay("ADS-B (1090 MHz)")
            freqInput.setText("1090.000")
        }
        val btnAm = createChipButton("📻 Airband AM") {
            val freqMhz = freqInput.text.toString().toDoubleOrNull() ?: 122.800
            service?.tuneSdr(RtlSdrUsbEngine.SdrMode.AIRBAND_AM, (freqMhz * 1e6).toLong(), squelchBar.progress - 80)
            updateModeDisplay("VHF Airband AM")
        }
        val btnAcars = createChipButton("📟 ACARS (131.550)") {
            service?.tuneSdr(RtlSdrUsbEngine.SdrMode.ACARS_VHF, 131550000L)
            updateModeDisplay("ACARS (131.550 MHz)")
            freqInput.setText("131.550")
        }
        modeRow.addView(btnAdsb)
        modeRow.addView(btnAm)
        modeRow.addView(btnAcars)
        root.addView(modeRow)

        // Frequency Input & Presets Row
        val freqRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 8, 0, 16)
        }
        val freqLabel = TextView(this).apply {
            text = "Freq (MHz): "
            setTextColor(Color.parseColor("#e2e8f0"))
            textSize = 13f
        }
        freqInput = EditText(this).apply {
            setText("1090.000")
            setTextColor(Color.parseColor("#38bdf8"))
            setBackgroundColor(Color.parseColor("#1e293b"))
            setPadding(16, 12, 16, 12)
            textSize = 14f
            typeface = Typeface.MONOSPACE
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val tuneBtn = Button(this).apply {
            text = "Tune"
            setBackgroundColor(Color.parseColor("#0284c7"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                val freqMhz = freqInput.text.toString().toDoubleOrNull() ?: 1090.0
                val mode = when {
                    freqMhz >= 1000 -> RtlSdrUsbEngine.SdrMode.ADSB_1090
                    freqMhz in 131.0..132.0 && modeText.text.contains("ACARS") -> RtlSdrUsbEngine.SdrMode.ACARS_VHF
                    else -> RtlSdrUsbEngine.SdrMode.AIRBAND_AM
                }
                service?.tuneSdr(mode, (freqMhz * 1e6).toLong(), squelchBar.progress - 80)
                updateModeDisplay(mode.name)
            }
        }
        freqRow.addView(freqLabel)
        freqRow.addView(freqInput)
        freqRow.addView(tuneBtn)
        root.addView(freqRow)

        // Airband Presets
        val presetRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 8)
        }
        presetRow.addView(createSmallPreset("122.800 CTAF") { tuneToPreset(122.800) })
        presetRow.addView(createSmallPreset("121.500 Guard") { tuneToPreset(121.500) })
        presetRow.addView(createSmallPreset("122.750 Air-Air") { tuneToPreset(122.750) })
        presetRow.addView(createSmallPreset("118.000 Tower") { tuneToPreset(118.000) })
        root.addView(presetRow)

        // 24/7 Continuous Test Channels (VOR Tone / NOAA WX / ATIS / FM & Speaker BIST)
        val testRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 16)
        }
        testRow.addView(createSmallPreset("116.700 VOR Tone") { tuneToPreset(116.700) })
        testRow.addView(createSmallPreset("162.550 NOAA WX") { tuneToPreset(162.550) })
        testRow.addView(createSmallPreset("121.150 ATIS") { tuneToPreset(121.150) })
        testRow.addView(createSmallPreset("97.100 FM") { tuneToPreset(97.100) })
        testRow.addView(createSmallPreset("🔊 Test Beep") { playSpeakerTestTone() })
        root.addView(testRow)

        // Squelch Slider
        val squelchRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 8, 0, 16)
        }
        squelchText = TextView(this).apply {
            text = "Squelch: -45 dBFS"
            setTextColor(Color.parseColor("#94a3b8"))
            textSize = 12f
            layoutParams = LinearLayout.LayoutParams(260, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        squelchBar = SeekBar(this).apply {
            max = 60 // -80 to -20 dBFS
            progress = 35 // -45 dBFS
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                    val dbfs = progress - 80
                    squelchText.text = "Squelch: $dbfs dBFS"
                    if (fromUser) {
                        val freqMhz = freqInput.text.toString().toDoubleOrNull() ?: 122.8
                        service?.tuneSdr(service?.getEngine()?.currentMode ?: RtlSdrUsbEngine.SdrMode.AIRBAND_AM, (freqMhz * 1e6).toLong(), dbfs)
                    }
                }
                override fun onStartTrackingTouch(seekBar: SeekBar?) {}
                override fun onStopTrackingTouch(seekBar: SeekBar?) {}
            })
        }
        squelchRow.addView(squelchText)
        squelchRow.addView(squelchBar)
        root.addView(squelchRow)

        // Telemetry Strip
        val telemRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(16, 12, 16, 12)
            setBackgroundColor(Color.parseColor("#1e293b"))
        }
        modeText = TextView(this).apply {
            text = "Mode: ADS-B (1090 MHz)"
            setTextColor(Color.parseColor("#34d399"))
            textSize = 12f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        meterText = TextView(this).apply {
            text = "Signal: - dBFS"
            setTextColor(Color.parseColor("#94a3b8"))
            textSize = 12f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        clientsText = TextView(this).apply {
            text = "TCP Clients: 0"
            setTextColor(Color.parseColor("#38bdf8"))
            textSize = 12f
            gravity = Gravity.END
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        telemRow.addView(modeText)
        telemRow.addView(meterText)
        telemRow.addView(clientsText)
        root.addView(telemRow)

        // Visual RF RSSI Signal Meter Bar (-90 dBFS to -20 dBFS)
        meterBar = android.widget.ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 8).apply {
                setMargins(0, 0, 0, 8)
            }
        }
        root.addView(meterBar)

        // Live Log Output
        logScroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
            setBackgroundColor(Color.parseColor("#020617"))
            setPadding(16, 16, 16, 16)
        }
        logView = TextView(this).apply {
            text = "Aalaapi Comms active. Waiting for RTL-SDR USB dongle...\n"
            setTextColor(Color.parseColor("#a5f3fc"))
            textSize = 11f
            typeface = Typeface.MONOSPACE
        }
        logScroll.addView(logView)
        root.addView(logScroll)

        setContentView(root)

        // Start Foreground Service & register USB receiver
        val intent = Intent(this, SdrForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)

        val filter = IntentFilter().apply {
            addAction(ACTION_USB_PERMISSION)
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(usbReceiver, filter)
        }
    }

    override fun onResume() {
        super.onResume()
        if (isBound) {
            scanAndAttachUsb()
        }
    }

    private fun tuneToPreset(freqMhz: Double) {
        freqInput.setText(String.format(Locale.US, "%.3f", freqMhz))
        val mode = when {
            freqMhz >= 1000.0 -> RtlSdrUsbEngine.SdrMode.ADSB_1090
            freqMhz in 131.0..132.0 && modeText.text.contains("ACARS") -> RtlSdrUsbEngine.SdrMode.ACARS_VHF
            else -> RtlSdrUsbEngine.SdrMode.AIRBAND_AM
        }
        service?.tuneSdr(mode, (freqMhz * 1e6).toLong(), squelchBar.progress - 80)
        updateModeDisplay("${mode.name} ($freqMhz MHz)")
    }

    private fun playSpeakerTestTone() {
        Thread {
            try {
                val sampleRate = 44100
                val durationMs = 500
                val numSamples = (durationMs * sampleRate) / 1000
                val buffer = ShortArray(numSamples)
                val freqHz = 1000.0
                for (i in 0 until numSamples) {
                    val angle = 2.0 * Math.PI * i / (sampleRate / freqHz)
                    buffer[i] = (Math.sin(angle) * 16000.0).toInt().toShort()
                }
                val audioTrack = android.media.AudioTrack(
                    android.media.AudioManager.STREAM_MUSIC,
                    sampleRate,
                    android.media.AudioFormat.CHANNEL_OUT_MONO,
                    android.media.AudioFormat.ENCODING_PCM_16BIT,
                    buffer.size * 2,
                    android.media.AudioTrack.MODE_STATIC
                )
                audioTrack.write(buffer, 0, buffer.size)
                audioTrack.play()
                runOnUiThread { appendLog("🔊 Speaker Test: Playing 1000 Hz test tone (500 ms)...") }
                Thread.sleep(600)
                audioTrack.release()
            } catch (e: Exception) {
                runOnUiThread { appendLog("❌ Speaker Test failed: ${e.message}") }
            }
        }.start()
    }

    private fun updateModeDisplay(name: String) {
        modeText.text = "Mode: $name"
    }

    private fun createChipButton(label: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            textSize = 11f
            setBackgroundColor(Color.parseColor("#1e293b"))
            setTextColor(Color.parseColor("#f1f5f9"))
            setPadding(16, 8, 16, 8)
            setOnClickListener { onClick() }
        }
    }

    private fun createSmallPreset(label: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            textSize = 10f
            setBackgroundColor(Color.parseColor("#0f172a"))
            setTextColor(Color.parseColor("#93c5fd"))
            setPadding(12, 4, 12, 4)
            setOnClickListener { onClick() }
        }
    }

    private fun setupEngineCallbacks() {
        val eng = service?.getEngine() ?: return
        eng.onStatusChanged = { status, details ->
            runOnUiThread {
                statusText.text = "Status: $status • $details"
                appendLog("[$status] $details")
            }
        }
        eng.onAdsbSbsLine = { line ->
            runOnUiThread {
                appendLog(line)
                clientsText.text = "TCP Clients: ${service?.getStatusJson()?.optInt("activeTcpClients") ?: 0}"
            }
        }
        eng.onAcarsMessage = { json ->
            runOnUiThread {
                val txt = json.optString("text")
                appendLog("[ACARS] $txt")
            }
        }
        eng.onAudioLevel = { dbfs, open ->
            runOnUiThread {
                val srv = service
                val msgRate = srv?.msgRate ?: 0.0
                meterText.text = "${if (open) "🔊" else "🔇"} ${dbfs.toInt()} dBFS | ${String.format(Locale.US, "%.1f", msgRate)} msg/s"
                val pct = (((dbfs + 90f) / 70f) * 100f).toInt().coerceIn(0, 100)
                meterBar.progress = pct
            }
        }
        eng.onRfSignalLevel = { dbfs, preamblesTotal ->
            val now = System.currentTimeMillis()
            if (now - lastMeterUiUpdate >= 100) {
                lastMeterUiUpdate = now
                runOnUiThread {
                    val srv = service
                    val msgRate = srv?.msgRate ?: 0.0
                    val pSec = srv?.preamblesPerSec ?: 0L
                    val rxDot = if (now % 600 < 300) "🟢" else "⚪"
                    meterText.text = "$rxDot ${dbfs.toInt()} dBFS | ${String.format(Locale.US, "%.1f", msgRate)} msg/s ($pSec p/s)"
                    val pct = (((dbfs + 90f) / 70f) * 100f).toInt().coerceIn(0, 100)
                    meterBar.progress = pct
                }
            }
        }
    }

    private fun scanAndAttachUsb() {
        val deviceList = usbManager.deviceList ?: return
        for (device in deviceList.values) {
            val vid = device.vendorId
            val pid = device.productId
            val isRtl = vid == 3034 || vid == 0x0BDA || device.productName?.contains("SDR", ignoreCase = true) == true
            if (isRtl) {
                if (!usbManager.hasPermission(device)) {
                    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                    } else {
                        PendingIntent.FLAG_UPDATE_CURRENT
                    }
                    val intent = PendingIntent.getBroadcast(this, 0, Intent(ACTION_USB_PERMISSION), flags)
                    usbManager.requestPermission(device, intent)
                } else {
                    service?.startSdr(device)
                    appendLog("Connected to ${device.productName ?: "RTL-SDR"}. Streaming started.")
                }
                break
            }
        }
    }

    private fun appendLog(msg: String) {
        val timeStr = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        logView.append("[$timeStr] $msg\n")
        logScroll.post { logScroll.fullScroll(View.FOCUS_DOWN) }
    }

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(usbReceiver) } catch (_: Exception) {}
        if (isBound) {
            unbindService(serviceConnection)
            isBound = false
        }
    }

    companion object {
        const val ACTION_USB_PERMISSION = "com.aalaapi.comms.USB_PERMISSION"
    }
}
