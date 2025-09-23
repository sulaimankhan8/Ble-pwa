import { useEffect, useRef, useState } from 'react';

export default function useBluetoothScanner(enabled = false) {
  const [ads, setAds] = useState([]); // recent adverts
  const abortRef = useRef(null);

  useEffect(() => {
    let leScan;

    async function startScan() {
      if (!('bluetooth' in navigator)) {
        console.warn('Web Bluetooth not available in this browser');
        return;
      }
console.log('Starting BLE scan...');

      try {
        // requestLEScan is the scanning API
        // we request acceptAllAdvertisements where supported (some browsers limit options)
        leScan = await navigator.bluetooth.requestLEScan?.({
          keepRepeatedDevices: true,
          acceptAllAdvertisements: true
        });

        // listen to advertisementreceived (Chrome)
        navigator.bluetooth.addEventListener('advertisementreceived', event => {
          try {
            // event.serviceData is a Map — parse bytes -> string -> JSON
            for (const [uuid, dataView] of event.serviceData) {
              // convert DataView to string
              const bytes = new Uint8Array(dataView.buffer);
              try {
                const text = new TextDecoder().decode(bytes);
                const obj = JSON.parse(text);
                const record = {
                  id: obj.id || event.device?.id || null,
                  lat: obj.lat,
                  lon: obj.lng || obj.lon,
                  ts: obj.ts,
                  rssi: event.rssi,
                  sourceDeviceId: obj.id || event.device?.id,
                  raw: obj
                };
                setAds(prev => [record, ...prev].slice(0, 200));
              } catch (e) {
                // not JSON — ignore or store raw
              }
            }
          } catch (e) {
            console.warn('ad recv parse error', e);
          }
        });

        abortRef.current = leScan;
      } catch (err) {
        console.error('requestLEScan failed (permissions/flags?)', err);
      }
    }

    function stopScan() {
      try {
        if (abortRef.current && abortRef.current.active) {
          abortRef.current.stop();
        }
      } catch (e) {}
      try {
        navigator.bluetooth.removeEventListener('advertisementreceived', () => {});
      } catch (e) {}
    }

    if (enabled) startScan();
    else stopScan();

    return () => { stopScan(); };
  }, [enabled]);

  return { adverts: ads };
}
