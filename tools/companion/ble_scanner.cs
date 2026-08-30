using System;
using System.IO;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using Windows.Devices.Bluetooth.Advertisement;
using Windows.Storage.Streams;

namespace AalaapiSky
{
    class BleScanner
    {
        static void Main(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            var watcher = new BluetoothLEAdvertisementWatcher();
            watcher.ScanningMode = BluetoothLEScanningMode.Active;
            
            try
            {
                watcher.AllowExtendedAdvertisements = true;
            }
            catch {}

            watcher.Received += (sender, eventArgs) =>
            {
                try
                {
                    string mac = eventArgs.BluetoothAddress.ToString("X12");
                    string formattedMac = string.Format("{0}:{1}:{2}:{3}:{4}:{5}",
                        mac.Substring(0, 2), mac.Substring(2, 2), mac.Substring(4, 2),
                        mac.Substring(6, 2), mac.Substring(8, 2), mac.Substring(10, 2));

                    short rssi = eventArgs.RawSignalStrengthInDBm;

                    // Pre-filter: Only inspect Service Data (0x16), Manufacturer Data (0xFF), or ODID packs (>= 25 bytes)
                    // This prevents thousands of non-drone BLE packets from flooding stdout and stalling Node.js.
                    if (eventArgs.Advertisement.DataSections != null)
                    {
                        foreach (var sec in eventArgs.Advertisement.DataSections)
                        {
                            if (sec.DataType != 0x16 && sec.DataType != 0xFF && sec.Data.Length < 25)
                            {
                                continue;
                            }

                            var reader = DataReader.FromBuffer(sec.Data);
                            byte[] bytes = new byte[sec.Data.Length];
                            reader.ReadBytes(bytes);

                            bool isOdid = false;
                            if (sec.DataType == 0x16)
                            {
                                // ASTM F3411 16-bit UUID 0xFFFA (stored little-endian 0xFA, 0xFF or big-endian 0xFF, 0xFA)
                                for (int i = 0; i <= bytes.Length - 2 && i < 6; i++)
                                {
                                    if ((bytes[i] == 0xFA && bytes[i + 1] == 0xFF) || (bytes[i] == 0xFF && bytes[i + 1] == 0xFA))
                                    {
                                        isOdid = true;
                                        break;
                                    }
                                }
                            }
                            else if (sec.DataType == 0xFF && bytes.Length >= 2)
                            {
                                // DJI Company ID 0x0888 (0x88, 0x08 or 0x08, 0x88)
                                if ((bytes[0] == 0x88 && bytes[1] == 0x08) || (bytes[0] == 0x08 && bytes[1] == 0x88))
                                {
                                    isOdid = true;
                                }
                            }
                            else if (bytes.Length >= 25 && (bytes[0] & 0xF0) == 0xF0)
                            {
                                isOdid = true;
                            }

                            if (isOdid)
                            {
                                string hex = BitConverter.ToString(bytes).Replace("-", "");
                                // Output format: ADV|MAC|RSSI|TYPE_HEX|PAYLOAD_HEX
                                Console.WriteLine(string.Format("ADV|{0}|{1}|{2:X2}|{3}", formattedMac, rssi, sec.DataType, hex));
                            }
                        }
                    }

                    // 2. Process ManufacturerData explicitly for DJI Company ID 0x0888 / 0x8808
                    if (eventArgs.Advertisement.ManufacturerData != null)
                    {
                        foreach (var mfg in eventArgs.Advertisement.ManufacturerData)
                        {
                            if (mfg.CompanyId == 0x0888 || mfg.CompanyId == 0x8808)
                            {
                                var reader = DataReader.FromBuffer(mfg.Data);
                                byte[] bytes = new byte[mfg.Data.Length];
                                reader.ReadBytes(bytes);
                                string hex = string.Format("{0:X2}{1:X2}", (byte)(mfg.CompanyId & 0xFF), (byte)((mfg.CompanyId >> 8) & 0xFF)) + BitConverter.ToString(bytes).Replace("-", "");
                                Console.WriteLine(string.Format("ADV|{0}|{1}|FF|{2}", formattedMac, rssi, hex));
                            }
                        }
                    }
                }
                catch {}
            };

            watcher.Start();
            Console.WriteLine("[BLE_WATCHER_STARTED]");

            // Run until stdin closed or exit requested
            while (true)
            {
                var line = Console.ReadLine();
                if (line == null || line == "exit" || line == "quit") break;
                Thread.Sleep(100);
            }

            try
            {
                watcher.Stop();
            }
            catch {}
        }
    }
}
