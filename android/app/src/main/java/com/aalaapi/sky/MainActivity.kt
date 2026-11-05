package com.aalaapi.sky

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var remoteIdScanner: AndroidRemoteIdScanner
    private lateinit var adsbBridge: AndroidAdsbBridge
    private lateinit var mtpBridge: AndroidMtpBridge

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
                    device?.let { mtpBridge.onDeviceAttached(it) }
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    mtpBridge.onDeviceDetached()
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        remoteIdScanner = AndroidRemoteIdScanner(this, webView)
        adsbBridge = AndroidAdsbBridge(webView)
        mtpBridge = AndroidMtpBridge(this, webView)

        setupWebView()

        val filter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
        registerReceiver(usbReceiver, filter)

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
