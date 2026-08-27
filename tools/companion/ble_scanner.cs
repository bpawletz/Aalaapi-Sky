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

                    // 1. Process all raw DataSections
                    if (eventArgs.Advertisement.DataSections != null)
                    {
                        foreach (var sec in eventArgs.Advertisement.DataSections)
                        {
                            var reader = DataReader.FromBuffer(sec.Data);
                            byte[] bytes = new byte[sec.Data.Length];
                            reader.ReadBytes(bytes);
                            string hex = BitConverter.ToString(bytes).Replace("-", "");
                            // Output format: ADV|MAC|RSSI|TYPE_HEX|PAYLOAD_HEX
                            Console.WriteLine(string.Format("ADV|{0}|{1}|{2:X2}|{3}", formattedMac, rssi, sec.DataType, hex));
                        }
                    }

                    // 2. Process ManufacturerData explicitly if present
                    if (eventArgs.Advertisement.ManufacturerData != null)
                    {
                        foreach (var mfg in eventArgs.Advertisement.ManufacturerData)
                        {
                            var reader = DataReader.FromBuffer(mfg.Data);
                            byte[] bytes = new byte[mfg.Data.Length];
                            reader.ReadBytes(bytes);
                            string hex = string.Format("{0:X2}{1:X2}", (byte)(mfg.CompanyId & 0xFF), (byte)((mfg.CompanyId >> 8) & 0xFF)) + BitConverter.ToString(bytes).Replace("-", "");
                            Console.WriteLine(string.Format("ADV|{0}|{1}|FF|{2}", formattedMac, rssi, hex));
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
