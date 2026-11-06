package com.aalaapi.sky

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var remoteIdScanner: AndroidRemoteIdScanner
    private lateinit var adsbBridge: AndroidAdsbBridge
    private lateinit var mtpBridge: AndroidMtpBridge

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
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
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Android 15 Edge-to-Edge & System Bar Styling
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.parseColor("#0f172a")
        window.navigationBarColor = Color.parseColor("#0f172a")
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false

        webView = WebView(this)
        setContentView(webView)

        // Apply window insets to webView so topbar and navigation bar do not collide with system bars
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
            WindowInsetsCompat.CONSUMED
        }

        remoteIdScanner = AndroidRemoteIdScanner(this, webView)
        adsbBridge = AndroidAdsbBridge(webView)
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

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            databaseEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                remoteIdScanner.startScan()
                adsbBridge.start()
                mtpBridge.checkConnectedDevices()
            }
        }

        webView.webChromeClient = WebChromeClient()

        // Register Javascript Interface: window.AalaapiAndroid
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun pushKmzToRc2(base64Kmz: String, targetUuid: String): Boolean {
                return mtpBridge.writeKmzToRc2(base64Kmz, targetUuid)
            }

            @JavascriptInterface
            fun pullLatestLogFromRc2(): String {
                return mtpBridge.pullLatestLog()
            }

            @JavascriptInterface
            fun setAdsbServer(host: String, port: Int) {
                adsbBridge.start(host, port)
            }
        }, "AalaapiAndroid")
    }

    override fun onDestroy() {
        super.onDestroy()
        remoteIdScanner.stopScan()
        adsbBridge.stop()
        unregisterReceiver(usbReceiver)
    }
}
