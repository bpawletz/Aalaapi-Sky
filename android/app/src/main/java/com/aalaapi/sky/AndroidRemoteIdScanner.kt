package com.aalaapi.sky

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import android.webkit.WebView
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.UUID

/**
 * Android Native ASTM F3411 Broadcast Remote ID Scanner.
 * Listens for Bluetooth LE Advertisements (Service Data UUID 0xFFFA and DJI Manufacturer Data 0x0888 / 0x8808).
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
            Log.w("AndroidRemoteIdScanner", "BLE scan failed with error code: $errorCode")
            isScanning = false
        }
    }

    private fun isPotentialRemoteId(bytes: ByteArray): Boolean {
        // Fast byte scan for ASTM F3411 16-bit UUID 0xFFFA (0xFA, 0xFF or 0xFF, 0xFA),
        // OpenDroneID Application Code (0x0D), DJI Manufacturer IDs (0x0888 / 0x8808),
        // or ASTM F3411 MessagePack headers (0xF0..0xF2)
        for (i in 0 until bytes.size - 1) {
            val b0 = bytes[i].toInt() and 0xFF
            val b1 = bytes[i + 1].toInt() and 0xFF
            if ((b0 == 0xFA && b1 == 0xFF) ||
                (b0 == 0xFF && b1 == 0xFA) ||
                (b0 == 0x88 && b1 == 0x08) ||
                (b0 == 0x08 && b1 == 0x88)) {
                return true
            }
        }
        val first = bytes[0].toInt() and 0xFF
        if (first == 0x0D) return true
        return (first and 0xF0) == 0xF0 && (first and 0x0F) <= 2
    }

    private fun handleScanResult(result: ScanResult) {
        val record = result.scanRecord ?: return
        val mac = try { result.device?.address ?: "UNKNOWN" } catch (_: Exception) { "UNKNOWN" }

        // 1. Check ASTM F3411 Service Data (UUID 0xFFFA)
        val serviceData = record.getServiceData(REMOTE_ID_SERVICE_UUID)
        if (serviceData != null && serviceData.size >= 25) {
            val base64Str = Base64.encodeToString(serviceData, Base64.NO_WRAP)
            dispatchToWebView(base64Str, result.rssi, "ble", mac)
            return
        }

        // 2. Check DJI Manufacturer Specific Data (Company ID 0x0888 / 0x8808)
        val djiMfgData1 = record.getManufacturerSpecificData(0x0888)
        if (djiMfgData1 != null && djiMfgData1.size >= 25) {
            val base64Str = Base64.encodeToString(djiMfgData1, Base64.NO_WRAP)
            dispatchToWebView(base64Str, result.rssi, "ble", mac)
            return
        }

        val djiMfgData2 = record.getManufacturerSpecificData(0x8808)
        if (djiMfgData2 != null && djiMfgData2.size >= 25) {
            val base64Str = Base64.encodeToString(djiMfgData2, Base64.NO_WRAP)
            dispatchToWebView(base64Str, result.rssi, "ble", mac)
            return
        }

        // 3. Fallback: Raw advertisement bytes only if it contains ASTM F3411 or DJI patterns
        val rawBytes = record.bytes
        if (rawBytes != null && rawBytes.size >= 25 && isPotentialRemoteId(rawBytes)) {
            val base64Str = Base64.encodeToString(rawBytes, Base64.NO_WRAP)
            dispatchToWebView(base64Str, result.rssi, "ble", mac)
        }
    }

    private fun dispatchToWebView(base64Payload: String, rssi: Int, transport: String, mac: String) {
        webView.post {
            webView.evaluateJavascript(
                "if (typeof window.ingestRemoteIdFrame === 'function') { window.ingestRemoteIdFrame('$base64Payload', $rssi, '$transport', '$mac'); }",
                null
            )
        }
    }

    fun hasPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        }
    }

    fun isBluetoothEnabled(): Boolean {
        return bluetoothAdapter != null && bluetoothAdapter.isEnabled
    }

    fun isScanning(): Boolean = isScanning

    fun getStatusJson(): String {
        return JSONObject().apply {
            put("scanning", isScanning)
            put("bluetoothEnabled", isBluetoothEnabled())
            put("hasPermission", hasPermission())
        }.toString()
    }

    @SuppressLint("MissingPermission")
    fun startScan(): Boolean {
        if (isScanning) return true
        if (!hasPermission() || !isBluetoothEnabled()) return false

        bleScanner = bluetoothAdapter?.bluetoothLeScanner ?: return false

        // Configure Bluetooth 5 Extended Advertising and Coded PHY scanning when supported
        val settingsBuilder = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setReportDelay(0)

        var extendedSupported = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (bluetoothAdapter?.isLeExtendedAdvertisingSupported == true) {
                settingsBuilder.setLegacy(false)
                extendedSupported = true
            }
            if (bluetoothAdapter?.isLeCodedPhySupported == true) {
                settingsBuilder.setPhy(ScanSettings.PHY_LE_ALL_SUPPORTED)
            }
        }

        val settings = settingsBuilder.build()

        return try {
            // Open scan without hardware filter offload registers (e.g. ScanFilter setServiceData / setManufacturerData)
            // to ensure Bluetooth 5 Extended Advertisements and multi-frame Remote ID packets are not dropped by OEM filters.
            bleScanner?.startScan(null, settings, scanCallback)
            isScanning = true
            Log.i("AndroidRemoteIdScanner", "Started ASTM F3411 BLE Remote ID scan (extendedSupported=$extendedSupported)")
            true
        } catch (e: Exception) {
            // If device OEM rejects extended settings, fallback to standard legacy low-latency scan
            try {
                val legacySettings = ScanSettings.Builder()
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                    .setReportDelay(0)
                    .build()
                bleScanner?.startScan(null, legacySettings, scanCallback)
                isScanning = true
                Log.i("AndroidRemoteIdScanner", "Started ASTM F3411 BLE Remote ID scan (legacy fallback)")
                true
            } catch (e2: Exception) {
                Log.e("AndroidRemoteIdScanner", "Failed to start BLE scan: ${e2.message}", e2)
                isScanning = false
                false
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScan(): Boolean {
        if (!isScanning) return true
        try {
            bleScanner?.stopScan(scanCallback)
        } catch (e: Exception) {
            Log.e("AndroidRemoteIdScanner", "Error stopping BLE scan: ${e.message}", e)
        }
        isScanning = false
        Log.i("AndroidRemoteIdScanner", "Stopped ASTM F3411 BLE Remote ID scan")
        return true
    }
}
