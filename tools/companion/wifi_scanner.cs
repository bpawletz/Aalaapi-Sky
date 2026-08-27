using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace AalaapiSky
{
    class WifiScanner
    {
        [DllImport("wlanapi.dll")]
        public static extern int WlanOpenHandle(uint dwClientVersion, IntPtr pReserved, out uint pdwNegotiatedVersion, out IntPtr phClientHandle);

        [DllImport("wlanapi.dll")]
        public static extern int WlanCloseHandle(IntPtr hClientHandle, IntPtr pReserved);

        [DllImport("wlanapi.dll")]
        public static extern int WlanEnumInterfaces(IntPtr hClientHandle, IntPtr pReserved, out IntPtr ppInterfaceList);

        [DllImport("wlanapi.dll")]
        public static extern int WlanScan(IntPtr hClientHandle, ref Guid pInterfaceGuid, IntPtr pDot11Ssid, IntPtr pIeData, IntPtr pReserved);

        [DllImport("wlanapi.dll")]
        public static extern int WlanGetNetworkBssList(IntPtr hClientHandle, ref Guid pInterfaceGuid, IntPtr pDot11Ssid, int dot11BssType, bool bSecurityEnabled, IntPtr pReserved, out IntPtr ppWlanBssList);

        [DllImport("wlanapi.dll")]
        public static extern void WlanFreeMemory(IntPtr pMemory);

        [StructLayout(LayoutKind.Sequential)]
        public struct WLAN_INTERFACE_INFO_LIST
        {
            public uint dwNumberOfItems;
            public uint dwIndex;
            public WLAN_INTERFACE_INFO InterfaceInfo;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct WLAN_INTERFACE_INFO
        {
            public Guid InterfaceGuid;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string strInterfaceDescription;
            public int isState;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct DOT11_SSID
        {
            public uint uSSIDLength;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
            public byte[] ucSSID;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct WLAN_RATE_SET
        {
            public uint uRateSetLength;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 126)]
            public ushort[] usRateSet;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct WLAN_BSS_ENTRY
        {
            public DOT11_SSID dot11Ssid;
            public uint uPhyId;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 6)]
            public byte[] dot11Bssid;
            public int dot11BssType;
            public int dot11BssPhyType;
            public int lRssi;
            public uint uLinkQuality;
            public byte bInRegDomain;
            public ushort usBeaconPeriod;
            public ulong ullTimestamp;
            public ulong ullHostTimestamp;
            public ushort usCapabilityInformation;
            public uint ulChCenterFrequency;
            public WLAN_RATE_SET wlanRateSet;
            public uint ulIeOffset;
            public uint ulIeSize;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct WLAN_BSS_LIST
        {
            public uint dwTotalSize;
            public uint dwNumberOfItems;
        }

        static volatile bool running = true;

        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            IntPtr client;
            uint version;

            if (WlanOpenHandle(2, IntPtr.Zero, out version, out client) != 0)
            {
                Console.WriteLine("[WIFI_SCANNER_ERROR] Could not open WLAN API handle");
                return;
            }

            // Background stdin listener for graceful termination
            var inputThread = new Thread(() =>
            {
                while (running)
                {
                    var line = Console.ReadLine();
                    if (line == null || line == "exit" || line == "quit")
                    {
                        running = false;
                        break;
                    }
                }
            });
            inputThread.IsBackground = true;
            inputThread.Start();

            Console.WriteLine("[WIFI_SCANNER_STARTED]");

            try
            {
                while (running)
                {
                    PerformScan(client);
                    // Sleep for 3.5 seconds between background scans
                    for (int i = 0; i < 35 && running; i++)
                    {
                        Thread.Sleep(100);
                    }
                }
            }
            finally
            {
                WlanCloseHandle(client, IntPtr.Zero);
            }
        }

        static void PerformScan(IntPtr client)
        {
            try
            {
                IntPtr ifListPtr;
                if (WlanEnumInterfaces(client, IntPtr.Zero, out ifListPtr) != 0) return;

                WLAN_INTERFACE_INFO_LIST ifList = (WLAN_INTERFACE_INFO_LIST)Marshal.PtrToStructure(ifListPtr, typeof(WLAN_INTERFACE_INFO_LIST));
                if (ifList.dwNumberOfItems > 0)
                {
                    Guid guid = ifList.InterfaceInfo.InterfaceGuid;
                    WlanScan(client, ref guid, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
                    Thread.Sleep(1200); // Allow scan completion

                    IntPtr bssListPtr;
                    if (WlanGetNetworkBssList(client, ref guid, IntPtr.Zero, 3 /* any */, false, IntPtr.Zero, out bssListPtr) == 0)
                    {
                        WLAN_BSS_LIST bssList = (WLAN_BSS_LIST)Marshal.PtrToStructure(bssListPtr, typeof(WLAN_BSS_LIST));
                        int structSize = Marshal.SizeOf(typeof(WLAN_BSS_ENTRY));
                        IntPtr current = new IntPtr(bssListPtr.ToInt64() + 8);

                        for (int i = 0; i < bssList.dwNumberOfItems; i++)
                        {
                            WLAN_BSS_ENTRY entry = (WLAN_BSS_ENTRY)Marshal.PtrToStructure(current, typeof(WLAN_BSS_ENTRY));
                            string ssidStr = entry.dot11Ssid.uSSIDLength > 0 ? Encoding.ASCII.GetString(entry.dot11Ssid.ucSSID, 0, (int)entry.dot11Ssid.uSSIDLength) : "";
                            string mac = string.Format("{0:X2}:{1:X2}:{2:X2}:{3:X2}:{4:X2}:{5:X2}",
                                entry.dot11Bssid[0], entry.dot11Bssid[1], entry.dot11Bssid[2],
                                entry.dot11Bssid[3], entry.dot11Bssid[4], entry.dot11Bssid[5]);

                            string ieHex = "";
                            if (entry.ulIeSize > 0 && entry.ulIeOffset > 0)
                            {
                                IntPtr iePtr = new IntPtr(bssListPtr.ToInt64() + entry.ulIeOffset);
                                byte[] ieBytes = new byte[Math.Min(entry.ulIeSize, (uint)512)];
                                Marshal.Copy(iePtr, ieBytes, 0, ieBytes.Length);
                                ieHex = BitConverter.ToString(ieBytes).Replace("-", "");
                            }

                            // Match DJI signatures or Remote ID IEs strictly (prevent matching general words or home Wi-Fi routers)
                            bool isDji = (!string.IsNullOrEmpty(ssidStr)) && (
                                         ssidStr.StartsWith("DJI-", StringComparison.OrdinalIgnoreCase) ||
                                         ssidStr.StartsWith("DJI_", StringComparison.OrdinalIgnoreCase) ||
                                         ssidStr.StartsWith("DJI ", StringComparison.OrdinalIgnoreCase) ||
                                         (ssidStr.StartsWith("DJI", StringComparison.OrdinalIgnoreCase) && ssidStr.Length >= 6 && System.Text.RegularExpressions.Regex.IsMatch(ssidStr, @"^DJI[-_A-Za-z0-9]+$")) ||
                                         ssidStr.StartsWith("Mini-", StringComparison.OrdinalIgnoreCase) ||
                                         ssidStr.StartsWith("Mavic-", StringComparison.OrdinalIgnoreCase) ||
                                         ssidStr.StartsWith("Avata-", StringComparison.OrdinalIgnoreCase));

                            // In 802.11 Wi-Fi, OpenDroneID uses the IEEE OUI FA-0B-BC (0xFA0BBC)
                            bool isRemoteId = (!string.IsNullOrEmpty(ieHex)) && ieHex.Contains("FA0BBC");

                            if (isDji || isRemoteId)
                            {
                                uint freqMhz = entry.ulChCenterFrequency / 1000;
                                // Output format: WIFI|MAC|RSSI|FREQ_MHZ|QUALITY|SSID|IE_HEX
                                Console.WriteLine(string.Format("WIFI|{0}|{1}|{2}|{3}|{4}|{5}",
                                    mac, entry.lRssi, freqMhz, entry.uLinkQuality, ssidStr, ieHex));
                            }

                            current = new IntPtr(current.ToInt64() + structSize);
                        }

                        WlanFreeMemory(bssListPtr);
                    }
                }
                WlanFreeMemory(ifListPtr);
            }
            catch {}
        }
    }
}
