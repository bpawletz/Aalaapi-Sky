using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace WifiScanner
{
    class Program
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

        static void Main(string[] args)
        {
            IntPtr client;
            uint version;
            if (WlanOpenHandle(2, IntPtr.Zero, out version, out client) != 0) return;

            try
            {
                IntPtr ifListPtr;
                if (WlanEnumInterfaces(client, IntPtr.Zero, out ifListPtr) != 0) return;

                WLAN_INTERFACE_INFO_LIST ifList = (WLAN_INTERFACE_INFO_LIST)Marshal.PtrToStructure(ifListPtr, typeof(WLAN_INTERFACE_INFO_LIST));
                if (ifList.dwNumberOfItems > 0)
                {
                    Guid guid = ifList.InterfaceInfo.InterfaceGuid;
                    WlanScan(client, ref guid, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
                    Thread.Sleep(2000);

                    IntPtr bssListPtr;
                    if (WlanGetNetworkBssList(client, ref guid, IntPtr.Zero, 3, false, IntPtr.Zero, out bssListPtr) == 0)
                    {
                        WLAN_BSS_LIST bssList = (WLAN_BSS_LIST)Marshal.PtrToStructure(bssListPtr, typeof(WLAN_BSS_LIST));
                        Console.WriteLine("Total Wi-Fi Networks Found: " + bssList.dwNumberOfItems);

                        int structSize = Marshal.SizeOf(typeof(WLAN_BSS_ENTRY));
                        IntPtr current = new IntPtr(bssListPtr.ToInt64() + 8);

                        for (int i = 0; i < bssList.dwNumberOfItems; i++)
                        {
                            WLAN_BSS_ENTRY entry = (WLAN_BSS_ENTRY)Marshal.PtrToStructure(current, typeof(WLAN_BSS_ENTRY));
                            string ssidStr = entry.dot11Ssid.uSSIDLength > 0 ? Encoding.ASCII.GetString(entry.dot11Ssid.ucSSID, 0, (int)entry.dot11Ssid.uSSIDLength) : "<Hidden / Direct RID>";
                            string mac = string.Format("{0:X2}:{1:X2}:{2:X2}:{3:X2}:{4:X2}:{5:X2}",
                                entry.dot11Bssid[0], entry.dot11Bssid[1], entry.dot11Bssid[2],
                                entry.dot11Bssid[3], entry.dot11Bssid[4], entry.dot11Bssid[5]);

                            if (ssidStr.StartsWith("DJI") || ssidStr.Contains("Mini") || ssidStr.Contains("Neo") || ssidStr.Contains("Mavic"))
                            {
                                Console.WriteLine(string.Format("🎯 [DJI DRONE DETECTED VIA WI-FI!]\n   SSID: {0}\n   BSSID: {1}\n   Frequency: {2} MHz (Channel {3})\n   Signal Strength (RSSI): {4} dBm (Quality: {5}%)\n   IE Payload Size: {6} bytes",
                                    ssidStr, mac, entry.ulChCenterFrequency / 1000,
                                    (entry.ulChCenterFrequency / 1000 - 2407) / 5,
                                    entry.lRssi, entry.uLinkQuality, entry.ulIeSize));

                                if (entry.ulIeSize > 0)
                                {
                                    IntPtr iePtr = new IntPtr(bssListPtr.ToInt64() + entry.ulIeOffset);
                                    byte[] ieBytes = new byte[entry.ulIeSize];
                                    Marshal.Copy(iePtr, ieBytes, 0, (int)entry.ulIeSize);
                                    Console.WriteLine("   Raw IE Hex Preview: " + BitConverter.ToString(ieBytes, 0, Math.Min(64, (int)entry.ulIeSize)).Replace("-", " "));
                                }
                            }

                            current = new IntPtr(current.ToInt64() + structSize);
                        }

                        WlanFreeMemory(bssListPtr);
                    }
                }
                WlanFreeMemory(ifListPtr);
            }
            finally
            {
                WlanCloseHandle(client, IntPtr.Zero);
            }
        }
    }
}
