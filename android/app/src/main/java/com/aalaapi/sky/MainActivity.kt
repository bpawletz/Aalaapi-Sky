package com.aalaapi.sky

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Looper
import android.provider.MediaStore
import android.speech.tts.TextToSpeech
import android.util.Base64
import android.util.Log
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var rootLayout: FrameLayout
    private lateinit var webView: WebView
    private lateinit var remoteIdScanner: AndroidRemoteIdScanner
    private lateinit var adsbBridge: AndroidAdsbBridge
    private lateinit var mdnsDiscovery: AndroidMdnsDiscovery
    private lateinit var mtpBridge: AndroidMtpBridge

    // ── Location & Hardware Permissions (Issue #249, #251) ──
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var pendingGeoOrigin: String? = null
    private var pendingNativeLocation = false

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
        pendingGeoCallback = null
        pendingGeoOrigin = null
        if (result[Manifest.permission.BLUETOOTH_SCAN] == true) {
            remoteIdScanner.startScan()
        }
        if (pendingNativeLocation) {
            pendingNativeLocation = false
            if (granted) fetchNativeLocation() else notifyLocationError("Location permission denied")
        }
    }

    // ── File Chooser for <input type="file"> (Issue #251) ──
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val intent = result.data
            val uris = when {
                intent?.clipData != null -> {
                    val clip = intent.clipData!!
                    Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                }
                intent?.data != null -> arrayOf(intent.data!!)
                else -> null
            }
            fileChooserCallback?.onReceiveValue(uris)
        } else {
            fileChooserCallback?.onReceiveValue(null)
        }
        fileChooserCallback = null
    }

    // ── Text-to-speech (Issue #249) ──
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeech: Triple<String, Float, Float>? = null

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            try {
                when (intent?.action) {
                    UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
                        }
                        device?.let { mtpBridge.onDeviceAttached(it) }
                    }
                    UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                        mtpBridge.onDeviceDetached()
                    }
                    AndroidMtpBridge.ACTION_USB_PERMISSION -> {
                        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
                        }
                        val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                        if (granted && device != null) {
                            mtpBridge.onPermissionGranted(device)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e("AalaapiUsb", "Error handling USB broadcast ${intent?.action}: ${e.message}", e)
            }
        }
    }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun requestLocationPermissions() {
        val perms = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            perms.add(Manifest.permission.BLUETOOTH_SCAN)
            perms.add(Manifest.permission.BLUETOOTH_CONNECT)
        }
        locationPermissionLauncher.launch(perms.toTypedArray())
    }

    private fun notifyLocation(loc: Location) {
        val js = "if (window.onNativeLocation) { window.onNativeLocation(${loc.latitude}, ${loc.longitude}, ${loc.accuracy}); }"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun notifyLocationError(message: String) {
        val js = "if (window.onNativeLocationError) { window.onNativeLocationError(${JSONObject.quote(message)}); }"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    @SuppressLint("MissingPermission")
    private fun fetchNativeLocation() {
        val lm = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        if (lm == null) {
            notifyLocationError("Location service unavailable on this device")
            return
        }
        val provider = when {
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> null
        }
        if (provider == null) {
            val last = try { lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER) } catch (_: Exception) { null }
            if (last != null) notifyLocation(last) else notifyLocationError("Location services are turned off")
            return
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                lm.getCurrentLocation(provider, null, mainExecutor) { loc ->
                    if (loc != null) notifyLocation(loc)
                    else notifyLocationError("Could not determine location (no GPS fix)")
                }
            } else {
                @Suppress("DEPRECATION")
                lm.requestSingleUpdate(provider, object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        notifyLocation(location)
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onStatusChanged(p: String?, status: Int, extras: Bundle?) {}
                    override fun onProviderEnabled(p: String) {}
                    override fun onProviderDisabled(p: String) {}
                }, Looper.getMainLooper())
            }
        } catch (e: Exception) {
            notifyLocationError(e.message ?: "Location request failed")
        }
    }

    private fun notifyTtsError(message: String) {
        val js = "if (window.onNativeTtsError) { window.onNativeTtsError(${JSONObject.quote(message)}); }"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun doSpeak(text: String, rate: Float, pitch: Float) {
        val engine = tts ?: return
        engine.setSpeechRate(rate)
        engine.setPitch(pitch)
        engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "aalaapi-advisory")
    }

    private fun speakText(text: String, rate: Float, pitch: Float) {
        runOnUiThread {
            if (tts == null) {
                pendingSpeech = Triple(text, rate, pitch)
                tts = TextToSpeech(this) { status ->
                    if (status == TextToSpeech.SUCCESS) {
                        ttsReady = true
                        tts?.language = Locale.getDefault()
                        tts?.setAudioAttributes(
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build()
                        )
                        pendingSpeech?.let { doSpeak(it.first, it.second, it.third) }
                        pendingSpeech = null
                    } else {
                        tts = null
                        pendingSpeech = null
                        notifyTtsError("No text-to-speech engine available (check Settings > Text-to-speech)")
                    }
                }
            } else if (ttsReady) {
                doSpeak(text, rate, pitch)
            } else {
                pendingSpeech = Triple(text, rate, pitch)
            }
        }
    }

    private fun getStatusBarHeightFallback(): Int {
        val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
        val dimenPx = if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 0
        val minFallbackPx = (28 * resources.displayMetrics.density).toInt()
        return maxOf(dimenPx, minFallbackPx)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Android 15 Edge-to-Edge & System Bar Styling
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.parseColor("#0f172a")
        window.navigationBarColor = Color.parseColor("#0f172a")
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false

        // Wrap WebView inside a FrameLayout container because android.webkit.WebView
        // ignores View.setPadding() when drawing its native Chromium canvas.
        val initialTopInset = getStatusBarHeightFallback()
        rootLayout = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0f172a"))
            setPadding(0, initialTopInset, 0, 0)
        }
        webView = WebView(this)
        rootLayout.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(rootLayout)

        // Apply window insets to rootLayout so FrameLayout physically positions webView
        // below the status bar / camera cutout and above the navigation bar / taskbar.
        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { view, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or
                    WindowInsetsCompat.Type.displayCutout() or
                    WindowInsetsCompat.Type.ime()
            )
            val topInset = maxOf(insets.top, getStatusBarHeightFallback())
            view.setPadding(insets.left, topInset, insets.right, insets.bottom)
            WindowInsetsCompat.CONSUMED
        }
        ViewCompat.requestApplyInsets(rootLayout)

        remoteIdScanner = AndroidRemoteIdScanner(this, webView)
        adsbBridge = AndroidAdsbBridge(this, webView)
        mdnsDiscovery = AndroidMdnsDiscovery(this)
        mtpBridge = AndroidMtpBridge(this, webView)

        setupWebView()

        val filter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
            addAction(AndroidMtpBridge.ACTION_USB_PERMISSION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(usbReceiver, filter)
        }

        webView.loadUrl("file:///android_asset/www/index.html")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == UsbManager.ACTION_USB_DEVICE_ATTACHED) {
            val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
            }
            if (device != null) {
                mtpBridge.onDeviceAttached(device)
            } else {
                mtpBridge.checkConnectedDevices()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            databaseEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            setGeolocationEnabled(true)
            // Allow ADS-B chimes (Web Audio) to play without a prior user tap (Issue #249)
            mediaPlaybackRequiresUserGesture = false
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                remoteIdScanner.startScan()
                adsbBridge.start(adsbBridge.getSavedHost(), adsbBridge.getSavedPort())
                mtpBridge.checkConnectedDevices()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                if (hasLocationPermission()) {
                    callback?.invoke(origin, true, false)
                } else {
                    pendingGeoCallback = callback
                    pendingGeoOrigin = origin
                    requestLocationPermissions()
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                }
                return try {
                    fileChooserLauncher.launch(intent)
                    true
                } catch (e: Exception) {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    false
                }
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                val msg = consoleMessage?.message() ?: ""
                val level = consoleMessage?.messageLevel()
                val tag = "AalaapiWeb"
                when (level) {
                    ConsoleMessage.MessageLevel.ERROR -> Log.e(tag, "[$level] $msg (${consoleMessage?.sourceId()}:${consoleMessage?.lineNumber()})")
                    ConsoleMessage.MessageLevel.WARNING -> Log.w(tag, "[$level] $msg")
                    else -> Log.d(tag, "[$level] $msg")
                }
                return super.onConsoleMessage(consoleMessage)
            }
        }

        // Register Javascript Interface: window.AalaapiAndroid
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun getMtpStatus(): String {
                return mtpBridge.getStatusJson()
            }

            @JavascriptInterface
            fun getDjiApiKey(): String {
                val prefs = getSharedPreferences("aalaapi_prefs", Context.MODE_PRIVATE)
                return prefs.getString("dji_developer_key", "") ?: ""
            }

            @JavascriptInterface
            fun setDjiApiKey(key: String): Boolean {
                val prefs = getSharedPreferences("aalaapi_prefs", Context.MODE_PRIVATE)
                prefs.edit().putString("dji_developer_key", key.trim()).apply()
                return true
            }

            @JavascriptInterface
            fun setKeepScreenOn(enabled: Boolean): Boolean {
                runOnUiThread {
                    if (enabled) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    }
                }
                return true
            }

            @JavascriptInterface
            fun readAsset(path: String): String {
                return try {
                    val clean = path.removePrefix("./").removePrefix("/")
                    assets.open("www/$clean").bufferedReader().use { it.readText() }
                } catch (e: Exception) {
                    try {
                        val clean = path.removePrefix("./").removePrefix("/")
                        assets.open(clean).bufferedReader().use { it.readText() }
                    } catch (_: Exception) {
                        ""
                    }
                }
            }

            @JavascriptInterface
            fun saveFile(base64Data: String, filename: String, mimeType: String): String {
                return try {
                    val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                    val cleanName = filename.replace("[^a-zA-Z0-9._-]".toRegex(), "_")
                    val mime = if (mimeType.isBlank()) "application/octet-stream" else mimeType

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        val values = ContentValues().apply {
                            put(MediaStore.MediaColumns.DISPLAY_NAME, cleanName)
                            put(MediaStore.MediaColumns.MIME_TYPE, mime)
                            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                        }
                        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                            ?: return JSONObject().apply {
                                put("success", false)
                                put("error", "Failed to create MediaStore entry")
                            }.toString()
                        contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "Saved to Downloads: $cleanName", Toast.LENGTH_LONG).show()
                        }
                        JSONObject().apply {
                            put("success", true)
                            put("filename", cleanName)
                            put("path", "Downloads/$cleanName")
                        }.toString()
                    } else {
                        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                        dir.mkdirs()
                        val file = File(dir, cleanName)
                        FileOutputStream(file).use { it.write(bytes) }
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "Saved to Downloads: $cleanName", Toast.LENGTH_LONG).show()
                        }
                        JSONObject().apply {
                            put("success", true)
                            put("filename", cleanName)
                            put("path", file.absolutePath)
                        }.toString()
                    }
                } catch (e: Exception) {
                    JSONObject().apply {
                        put("success", false)
                        put("error", e.message ?: "Failed to save file")
                    }.toString()
                }
            }

            @JavascriptInterface
            fun pushKmzToRc2(base64Kmz: String, targetUuid: String): Boolean {
                return mtpBridge.writeKmzToRc2(base64Kmz, targetUuid)
            }

            @JavascriptInterface
            fun pullKmzFromRc2(targetUuid: String): String {
                return mtpBridge.pullKmzFromRc2(targetUuid)
            }

            @JavascriptInterface
            fun getRc2WaypointSlots(): String {
                return mtpBridge.getRc2WaypointSlots()
            }

            @JavascriptInterface
            fun pullLatestLogFromRc2(): String {
                return mtpBridge.pullLatestLog()
            }

            @JavascriptInterface
            fun listFlightRecordsFromRc2(limit: Int): String {
                return mtpBridge.listRecentLogs(if (limit > 0) limit else 30, forceRefresh = false)
            }

            @JavascriptInterface
            fun listFlightRecordsFromRc2WithRefresh(limit: Int, forceRefresh: Boolean): String {
                return mtpBridge.listRecentLogs(if (limit > 0) limit else 30, forceRefresh = forceRefresh)
            }

            @JavascriptInterface
            fun listSavedFlights(): String {
                return mtpBridge.listSavedFlights()
            }

            @JavascriptInterface
            fun getSavedFlightTelemetry(filename: String): String {
                return mtpBridge.getSavedFlightTelemetry(filename)
            }

            @JavascriptInterface
            fun pullLogByHandleFromRc2(handle: Int): String {
                return mtpBridge.pullLogByHandle(handle)
            }

            @JavascriptInterface
            fun pullLogByNameFromRc2(filename: String): String {
                return mtpBridge.pullLogByName(filename)
            }

            @JavascriptInterface
            fun setAdsbServer(host: String, port: Int): Boolean {
                adsbBridge.start(host, port)
                return true
            }

            @JavascriptInterface
            fun getAdsbStatus(): String {
                return adsbBridge.getStatusJson()
            }

            @JavascriptInterface
            fun getNativeLocation() {
                runOnUiThread {
                    if (hasLocationPermission()) {
                        fetchNativeLocation()
                    } else {
                        pendingNativeLocation = true
                        requestLocationPermissions()
                    }
                }
            }

            @JavascriptInterface
            fun speak(text: String, rate: Double, pitch: Double): Boolean {
                speakText(text, rate.toFloat(), pitch.toFloat())
                return true
            }

            @JavascriptInterface
            fun stopSpeaking() {
                runOnUiThread { tts?.stop() }
            }

            @JavascriptInterface
            fun probeAdsbHost(host: String): String {
                return runBlocking {
                    mdnsDiscovery.probeHost(host)
                }
            }

            @JavascriptInterface
            fun discoverMdnsServers(timeoutMs: Long): String {
                return runBlocking {
                    mdnsDiscovery.discoverAdsb(if (timeoutMs > 0) timeoutMs else 2000L)
                }
            }

            @JavascriptInterface
            fun fetchHttp(urlStr: String): String {
                return runBlocking(Dispatchers.IO) {
                    try {
                        val url = URL(urlStr)
                        val conn = (url.openConnection() as HttpURLConnection).apply {
                            connectTimeout = 6000
                            readTimeout = 6000
                            requestMethod = "GET"
                            setRequestProperty("User-Agent", "Mozilla/5.0 (Android; AalaapiSky/1.0)")
                        }
                        val code = conn.responseCode
                        if (code in 200..299) {
                            conn.inputStream.bufferedReader().use { it.readText() }
                        } else {
                            val err = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "HTTP $code"
                            JSONObject().apply {
                                put("error", err)
                                put("status", code)
                            }.toString()
                        }
                    } catch (e: Exception) {
                        JSONObject().apply {
                            put("error", e.message ?: "Network error")
                        }.toString()
                    }
                }
            }

            @JavascriptInterface
            fun postHttp(urlStr: String, bodyStr: String, headersJson: String): String {
                return runBlocking(Dispatchers.IO) {
                    try {
                        val url = URL(urlStr)
                        val conn = (url.openConnection() as HttpURLConnection).apply {
                            connectTimeout = 8000
                            readTimeout = 8000
                            requestMethod = "POST"
                            doOutput = true
                            setRequestProperty("User-Agent", "Mozilla/5.0 (Android; AalaapiSky/1.0)")
                            try {
                                if (headersJson.isNotBlank()) {
                                    val hdrs = JSONObject(headersJson)
                                    val keys = hdrs.keys()
                                    while (keys.hasNext()) {
                                        val k = keys.next()
                                        setRequestProperty(k, hdrs.getString(k))
                                    }
                                }
                            } catch (_: Exception) {}
                        }
                        conn.outputStream.bufferedWriter().use { it.write(bodyStr) }
                        val code = conn.responseCode
                        if (code in 200..299) {
                            conn.inputStream.bufferedReader().use { it.readText() }
                        } else {
                            val err = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "HTTP $code"
                            JSONObject().apply {
                                put("error", err)
                                put("status", code)
                            }.toString()
                        }
                    } catch (e: Exception) {
                        JSONObject().apply {
                            put("error", e.message ?: "Network error")
                        }.toString()
                    }
                }
            }
        }, "AalaapiAndroid")
    }

    override fun onDestroy() {
        super.onDestroy()
        remoteIdScanner.stopScan()
        adsbBridge.stop()
        tts?.stop()
        tts?.shutdown()
        tts = null
        unregisterReceiver(usbReceiver)
    }
}
