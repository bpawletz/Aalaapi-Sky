package com.aalaapi.sky

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * Android Native Bonjour (mDNS / DNS-SD) Discovery & ADS-B Host Port Prober.
 * Discovers dump1090, readsb, Stratux, and Aalaapi Sky companions on local Wi-Fi.
 */
class AndroidMdnsDiscovery(private val context: Context) {

    private val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as? NsdManager

    /**
     * Probes standard ADS-B receiver ports on target host.
     * Matches the schema of tools/companion/server.js (/api/config/adsb/probe).
     */
    suspend fun probeHost(targetHost: String): String = withContext(Dispatchers.IO) {
        val cleanHost = targetHost.trim().ifEmpty { "127.0.0.1" }
        val root = JSONObject()
        root.put("success", true)
        root.put("host", cleanHost)
        root.put("timestamp", System.currentTimeMillis())

        val portsObj = JSONObject()

        val p30003 = probeTcpPort(cleanHost, 30003, 700)
        portsObj.put("30003", JSONObject().apply {
            put("name", "SBS / BaseStation (TCP)")
            put("open", p30003)
        })

        val p30002 = probeTcpPort(cleanHost, 30002, 700)
        portsObj.put("30002", JSONObject().apply {
            put("name", "Raw Mode S AVR (TCP)")
            put("open", p30002)
        })

        val p30005 = probeTcpPort(cleanHost, 30005, 700)
        portsObj.put("30005", JSONObject().apply {
            put("name", "Beast Binary (TCP)")
            put("open", p30005)
        })

        val p80 = probeHttpJson(cleanHost, 80, 800)
        portsObj.put("80", JSONObject().apply {
            put("name", "HTTP Web (/data/aircraft.json)")
            put("open", p80)
        })

        val p8080 = probeHttpJson(cleanHost, 8080, 800)
        portsObj.put("8080", JSONObject().apply {
            put("name", "HTTP Web 8080 (/data/aircraft.json)")
            put("open", p8080)
        })

        root.put("ports", portsObj)

        val recommendedPort = when {
            p30003 -> 30003
            p30002 -> 30002
            p8080 -> 8080
            p80 -> 80
            p30005 -> 30005
            else -> JSONObject.NULL
        }
        root.put("recommendedPort", recommendedPort)

        root.toString()
    }

    private fun probeTcpPort(host: String, port: Int, timeoutMs: Int): Boolean {
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(host, port), timeoutMs)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun probeHttpJson(host: String, port: Int, timeoutMs: Int): Boolean {
        val paths = listOf("/data/aircraft.json", "/tar1090/data/aircraft.json", "/aircraft.json")
        for (path in paths) {
            try {
                val url = URL("http://$host:$port$path")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = timeoutMs
                    readTimeout = timeoutMs
                    requestMethod = "GET"
                    setRequestProperty("User-Agent", "AalaapiSky-Android/1.0")
                }
                val code = conn.responseCode
                conn.disconnect()
                if (code in 200..299) return true
            } catch (_: Exception) {
                // Try next path
            }
        }
        return false
    }

    /**
     * Discovers ADS-B / SBS servers on local Wi-Fi via mDNS / DNS-SD.
     * Uses Wi-Fi MulticastLock + NsdManager with UDP multicast query fallback.
     */
    suspend fun discoverAdsb(timeoutMs: Long = 2000): String = withContext(Dispatchers.IO) {
        val serversMap = ConcurrentHashMap<String, JSONObject>()

        val multicastLock = wifiManager?.createMulticastLock("AalaapiMdnsLock")?.apply {
            setReferenceCounted(true)
            try { acquire() } catch (_: Exception) {}
        }

        try {
            // 1. Android NsdManager discovery
            val serviceTypes = listOf("_sbs._tcp", "_dump1090._tcp", "_aalaapi-sky._tcp")
            val activeListeners = mutableListOf<NsdManager.DiscoveryListener>()

            nsdManager?.let { nsd ->
                for (sType in serviceTypes) {
                    val listener = object : NsdManager.DiscoveryListener {
                        override fun onDiscoveryStarted(regType: String) {}
                        override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                            try {
                                nsd.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                                    override fun onResolveFailed(serviceInfo: NsdServiceInfo?, errorCode: Int) {}
                                    override fun onServiceResolved(resolved: NsdServiceInfo?) {
                                        resolved?.let { info ->
                                            val host = info.host?.hostAddress ?: return@let
                                            val port = info.port
                                            val name = info.serviceName ?: "dump1090"
                                            val key = "$host:$port"
                                            val item = JSONObject().apply {
                                                put("name", name)
                                                put("host", host)
                                                put("address", host)
                                                put("port", if (port > 0) port else 30003)
                                                put("isSbs", true)
                                            }
                                            serversMap[key] = item
                                        }
                                    }
                                })
                            } catch (_: Exception) {}
                        }
                        override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
                        override fun onDiscoveryStopped(serviceType: String) {}
                        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
                        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
                    }
                    try {
                        nsd.discoverServices(sType, NsdManager.PROTOCOL_DNS_SD, listener)
                        activeListeners.add(listener)
                    } catch (_: Exception) {}
                }
            }

            // 2. Direct UDP mDNS Query fallback to 224.0.0.251:5353
            runUdpMdnsQuery(serversMap, timeoutMs)

            // Stop NsdManager discovery listeners
            for (listener in activeListeners) {
                try { nsdManager?.stopServiceDiscovery(listener) } catch (_: Exception) {}
            }
        } finally {
            try {
                if (multicastLock?.isHeld == true) multicastLock.release()
            } catch (_: Exception) {}
        }

        val serversArray = JSONArray()
        serversMap.values.forEach { serversArray.put(it) }

        val result = JSONObject().apply {
            put("success", true)
            put("count", serversArray.length())
            put("servers", serversArray)
        }
        result.toString()
    }

    private fun runUdpMdnsQuery(serversMap: ConcurrentHashMap<String, JSONObject>, timeoutMs: Long) {
        var socket: DatagramSocket? = null
        try {
            socket = DatagramSocket()
            socket.soTimeout = (timeoutMs / 2).toInt().coerceAtLeast(600)

            val queryPacket = buildMdnsQueryPacket("_sbs._tcp.local")
            val destGroup = InetAddress.getByName("224.0.0.251")
            val packet = DatagramPacket(queryPacket, queryPacket.size, destGroup, 5353)
            socket.send(packet)

            val buf = ByteArray(2048)
            val startTime = System.currentTimeMillis()
            while (System.currentTimeMillis() - startTime < timeoutMs) {
                try {
                    val resp = DatagramPacket(buf, buf.size)
                    socket.receive(resp)
                    val senderIp = resp.address.hostAddress ?: continue
                    val text = String(buf, 0, resp.length, Charsets.ISO_8859_1)

                    if (text.contains("sbs", ignoreCase = true) || text.contains("dump1090", ignoreCase = true) || text.contains("aalaapi", ignoreCase = true)) {
                        val key = "$senderIp:30003"
                        if (!serversMap.containsKey(key)) {
                            serversMap[key] = JSONObject().apply {
                                put("name", "dump1090 ($senderIp)")
                                put("host", senderIp)
                                put("address", senderIp)
                                put("port", 30003)
                                put("isSbs", true)
                            }
                        }
                    }
                } catch (_: Exception) {
                    break // Timeout reached
                }
            }
        } catch (_: Exception) {
            // Ignore UDP socket errors
        } finally {
            try { socket?.close() } catch (_: Exception) {}
        }
    }

    private fun buildMdnsQueryPacket(serviceName: String): ByteArray {
        val bos = ByteArrayOutputStream()
        // Transaction ID (0), Flags (0 - standard query), Questions (1), Answers (0), Auth (0), Add (0)
        bos.write(byteArrayOf(0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0))
        for (part in serviceName.split(".")) {
            if (part.isEmpty()) continue
            val bytes = part.toByteArray(Charsets.UTF_8)
            bos.write(bytes.size)
            bos.write(bytes)
        }
        bos.write(0) // End of QNAME
        bos.write(byteArrayOf(0, 12)) // QTYPE = PTR (12)
        bos.write(byteArrayOf(0, 1))  // QCLASS = IN (1)
        return bos.toByteArray()
    }

    /**
     * Discovers Aalaapi Sky Companion Bridge nodes on local Wi-Fi via Bonjour (mDNS / DNS-SD).
     * Discovers services registered as _aalaapi-sky._tcp and _http._tcp.
     */
    suspend fun discoverCompanionBridges(timeoutMs: Long = 2500): String = withContext(Dispatchers.IO) {
        val bridgesMap = ConcurrentHashMap<String, JSONObject>()

        val multicastLock = wifiManager?.createMulticastLock("AalaapiCompanionMdnsLock")?.apply {
            setReferenceCounted(true)
            try { acquire() } catch (_: Exception) {}
        }

        try {
            // 1. Android NsdManager discovery for _aalaapi-sky._tcp
            val activeListeners = mutableListOf<NsdManager.DiscoveryListener>()

            nsdManager?.let { nsd ->
                val listener = object : NsdManager.DiscoveryListener {
                    override fun onDiscoveryStarted(regType: String) {}
                    override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                        try {
                            nsd.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                                override fun onResolveFailed(serviceInfo: NsdServiceInfo?, errorCode: Int) {}
                                override fun onServiceResolved(resolved: NsdServiceInfo?) {
                                    resolved?.let { info ->
                                        val host = info.host?.hostAddress ?: return@let
                                        val port = if (info.port > 0) info.port else 8765
                                        val name = info.serviceName ?: "Aalaapi Sky Drone Bridge"
                                        val key = "$host:$port"

                                        val txtMap = JSONObject()
                                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                                            try {
                                                info.attributes?.forEach { (k, v) ->
                                                    txtMap.put(k, if (v != null) String(v, Charsets.UTF_8) else "")
                                                }
                                            } catch (_: Exception) {}
                                        }

                                        val item = JSONObject().apply {
                                            put("name", name)
                                            put("host", host)
                                            put("address", host)
                                            put("port", port)
                                            put("httpPort", port)
                                            put("httpsPort", txtMap.optString("httpsPort", "8766"))
                                            put("version", txtMap.optString("version", ""))
                                            put("txt", txtMap)
                                            put("url", "http://$host:$port")
                                        }
                                        bridgesMap[key] = item
                                    }
                                }
                            })
                        } catch (_: Exception) {}
                    }
                    override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
                    override fun onDiscoveryStopped(serviceType: String) {}
                    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
                    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
                }
                try {
                    nsd.discoverServices("_aalaapi-sky._tcp", NsdManager.PROTOCOL_DNS_SD, listener)
                    activeListeners.add(listener)
                } catch (_: Exception) {}
            }

            // 2. Direct UDP mDNS Query fallback for _aalaapi-sky._tcp.local
            runUdpCompanionQuery(bridgesMap, timeoutMs)

            // Stop NsdManager discovery listeners
            for (listener in activeListeners) {
                try { nsdManager?.stopServiceDiscovery(listener) } catch (_: Exception) {}
            }
        } finally {
            try {
                if (multicastLock?.isHeld == true) multicastLock.release()
            } catch (_: Exception) {}
        }

        val bridgesArray = JSONArray()
        bridgesMap.values.forEach { bridgesArray.put(it) }

        val result = JSONObject().apply {
            put("success", true)
            put("count", bridgesArray.length())
            put("bridges", bridgesArray)
        }
        result.toString()
    }

    private fun runUdpCompanionQuery(bridgesMap: ConcurrentHashMap<String, JSONObject>, timeoutMs: Long) {
        var socket: DatagramSocket? = null
        try {
            socket = DatagramSocket()
            socket.soTimeout = (timeoutMs / 2).toInt().coerceAtLeast(600)

            val queryPacket = buildMdnsQueryPacket("_aalaapi-sky._tcp.local")
            val destGroup = InetAddress.getByName("224.0.0.251")
            val packet = DatagramPacket(queryPacket, queryPacket.size, destGroup, 5353)
            socket.send(packet)

            val buf = ByteArray(2048)
            val startTime = System.currentTimeMillis()
            while (System.currentTimeMillis() - startTime < timeoutMs) {
                try {
                    val resp = DatagramPacket(buf, buf.size)
                    socket.receive(resp)
                    val senderIp = resp.address.hostAddress ?: continue
                    val text = String(buf, 0, resp.length, Charsets.ISO_8859_1)

                    if (text.contains("aalaapi", ignoreCase = true) || text.contains("sky", ignoreCase = true) || text.contains("8765")) {
                        val key = "$senderIp:8765"
                        if (!bridgesMap.containsKey(key)) {
                            bridgesMap[key] = JSONObject().apply {
                                put("name", "Aalaapi Sky Drone Bridge ($senderIp)")
                                put("host", senderIp)
                                put("address", senderIp)
                                put("port", 8765)
                                put("httpPort", 8765)
                                put("httpsPort", 8766)
                                put("url", "http://$senderIp:8765")
                            }
                        }
                    }
                } catch (_: Exception) {
                    break // Timeout reached
                }
            }
        } catch (_: Exception) {
            // Ignore UDP socket errors
        } finally {
            try { socket?.close() } catch (_: Exception) {}
        }
    }
}
