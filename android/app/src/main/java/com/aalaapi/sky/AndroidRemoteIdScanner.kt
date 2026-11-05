package com.aalaapi.sky

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Base64
import android.webkit.WebView
import java.util.UUID

/**
 * Android Native ASTM F3411 Broadcast Remote ID Scanner.
 * Listens for Bluetooth LE Advertisements (Service UUID 0xFFFA).
 */
class AndroidRemoteIdScanner(private val context: Context, private val webView: WebView) {

    private val bluetoothManager: BluetoothManager? = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter
    private var bleScanner: BluetoothLeScanner? = null
    private var isScanning = false

    private val REMOTE_ID_SERVICE_UUID: ParcelUuid = ParcelUuid(UUID.fromString("0000fffa-0000-1000-8000-00805f9b34fb"))

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            result?.let { handleScanResult(it) }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>?) {
            results?.forEach { handleScanResult(it) }
        }

        override fun onScanFailed(errorCode: Int) {
            // Scanner backoff or error
        }
    }

    private fun handleScanResult(result: ScanResult) {
        val record = result.scanRecord ?: return
        val serviceData = record.getServiceData(REMOTE_ID_SERVICE_UUID)
        val payload = serviceData ?: record.bytes
        if (payload != null && payload.size >= 25) {
            val base64Str = Base64.encodeToString(payload, Base64.NO_WRAP)
            val rssi = result.rssi
            dispatchToWebView(base64Str, rssi, "ble")
        }
    }

    private fun dispatchToWebView(base64Payload: String, rssi: Int, transport: String) {
        webView.post {
            webView.evaluateJavascript(
                "if (typeof window.ingestRemoteIdFrame === 'function') { window.ingestRemoteIdFrame('$base64Payload', $rssi, '$transport'); }",
                null
            )
        }
    }

    @SuppressLint("MissingPermission")
    fun startScan() {
        if (isScanning || bluetoothAdapter == null || !bluetoothAdapter.isEnabled) return
        bleScanner = bluetoothAdapter.bluetoothLeScanner ?: return

        val filter = ScanFilter.Builder()
            .setServiceUuid(REMOTE_ID_SERVICE_UUID)
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setReportDelay(0)
            .build()

        try {
            bleScanner?.startScan(listOf(filter), settings, scanCallback)
            isScanning = true
        } catch (_: Exception) {}
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        if (!isScanning) return
        try {
            bleScanner?.stopScan(scanCallback)
        } catch (_: Exception) {}
        isScanning = false
    }
}
