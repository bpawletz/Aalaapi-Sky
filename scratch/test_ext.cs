using System;
using Windows.Devices.Bluetooth.Advertisement;

namespace TestApp
{
    class Program
    {
        static void Main(string[] args)
        {
            var watcher = new BluetoothLEAdvertisementWatcher();
            try
            {
                watcher.AllowExtendedAdvertisements = true;
                Console.WriteLine("SUCCESS: AllowExtendedAdvertisements is supported and enabled!");
            }
            catch (Exception ex)
            {
                Console.WriteLine("ERROR: " + ex.Message);
            }
        }
    }
}
