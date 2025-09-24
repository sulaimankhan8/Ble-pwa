import React, { useEffect, useState, useRef } from 'react';
import useGeolocation from './hooks/useGeolocation';
import useBluetoothScanner from './hooks/useBluetoothScanner';
import { uploadEvent, uploadBatchIfAny } from './services/syncService';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';
import './leafletFix';
import 'leaflet/dist/leaflet.css';


const ownIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/447/447031.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30]
});

const relayIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/61/61168.png',
  iconSize: [28, 28],
  iconAnchor: [14, 28]
});

function RecenterMap({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lon) {
      console.log("[RecenterMap] Moving map to:", lat, lon);
      map.setView([lat, lon], 15, { animate: true });
    }
  }, [lat, lon, map]);
  return null;
}

export default function App() {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [timer, setTimer] = useState(30);
  const intervalRef = useRef(null);

  console.log("[App] Render start");

  const pos = useGeolocation(scanning, 30000);
  const { adverts } = useBluetoothScanner(scanning);

  // Timer
  useEffect(() => {
    console.log("[Timer] Started countdown");
    intervalRef.current = setInterval(() => {
      setTimer(t => (t > 0 ? t - 1 : 30));
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  // Socket.IO
  useEffect(() => {
    console.log("[Socket] Connecting to backend…");
    const socket = io('https://ble-backend-trim.onrender.com', {
  transports: ['websocket'], // force WS
  withCredentials: true
});

    socket.on('connect', () => console.log("[Socket] Connected:", socket.id));
    socket.on('disconnect', () => console.log("[Socket] Disconnected"));
    socket.on('event:new', (ev) => {
      console.log("[Socket] New event received:", ev);
      setDevices(d => ({ ...d, [ev.deviceId]: ev }));
      setLastUpdate(new Date());
    });
    return () => socket.disconnect();
  }, []);

  // Own position
  useEffect(() => {
    async function handleOwnPos() {
      if (!pos) {
        console.log("[Geo] No position yet");
        return;
      }
      console.log("[Geo] Got position:", pos);
      const ownEvent = {
        deviceId: 'web-' + (navigator.userAgent || '').slice(0, 30),
        ts: pos.ts,
        lat: pos.lat,
        lon: pos.lon,
        rssi: null,
        sourceDeviceId: null,
        uploaderDeviceId: null,
        relayed: false
      };
      console.log("[Upload] Sending ownEvent:", ownEvent);
      const uploaded = await uploadEvent(ownEvent);
      console.log("[Upload] Upload result:", uploaded);
      setDevices(d => ({ ...d, [ownEvent.deviceId]: ownEvent }));
      if (uploaded) setLastUpdate(new Date());
      await uploadBatchIfAny();
      setTimer(30);
    }
    handleOwnPos();
  }, [pos]);

  // Relayed adverts
  useEffect(() => {
    async function handleAdverts() {
      if (!adverts || adverts.length === 0) {
        console.log("[BLE] No adverts found");
        return;
      }
      console.log("[BLE] Got adverts:", adverts);
      for (const a of adverts) {
        const ev = {
          deviceId: a.id || `adv-${a.sourceDeviceId}`,
          ts: a.ts || new Date().toISOString(),
          lat: parseFloat(a.lat),
          lon: parseFloat(a.lon),
          rssi: a.rssi,
          sourceDeviceId: a.sourceDeviceId,
          uploaderDeviceId: 'web-relay',
          relayed: true
        };
        console.log("[Upload] Relayed event:", ev);
        await uploadEvent(ev);
        setDevices(d => ({ ...d, [ev.deviceId]: ev }));
      }
      await uploadBatchIfAny();
    }
    handleAdverts();
  }, [adverts]);

  const ownDevice = Object.values(devices).find(d => !d.relayed);
  console.log("[Devices] Current state:", devices);

  return (
    <div style={{ display: 'flex', height: '100vh', position: 'relative' }}>
      {/* Sidebar */}
      <div style={{ width: 320, padding: 12, borderRight: '1px solid #ddd', overflowY: 'auto' }}>
        <h3>BLE PWA Relay</h3>
        <button onClick={() => {
          console.log("[UI] Toggle scanning:", !scanning);
          setScanning(s => !s);
        }}>
          {scanning ? 'Stop' : 'Start'} scanning
        </button>
        <p>Geo: {pos ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}` : 'no fix yet'}</p>
        <p>Next upload in: {timer}s</p>
        <h4>Discovered Devices</h4>
        <ul>
          {Object.keys(devices).map(k => {
            const d = devices[k];
            return (
              <li key={k}>
                {k} {d.lat ? `@ ${d.lat.toFixed(5)},${d.lon.toFixed(5)}` : ''} {d.relayed ? '(relayed)' : '(me)'}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Map */}
      <div style={{ flex: 1 }}>
        <MapContainer
          center={ownDevice ? [ownDevice.lat, ownDevice.lon] : [20, 77]}
          zoom={ownDevice ? 15 : 5}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {ownDevice && (
            <>
              <Marker position={[ownDevice.lat, ownDevice.lon]} icon={ownIcon}>
                <Popup>
                  <b>Me</b><br />
                  {new Date(ownDevice.ts).toLocaleString()}
                </Popup>
              </Marker>
              <RecenterMap lat={ownDevice.lat} lon={ownDevice.lon} />
            </>
          )}
          {Object.values(devices)
            .filter(d => d.relayed)
            .map(d => (
              <Marker key={d.deviceId} position={[d.lat, d.lon]} icon={relayIcon}>
                <Popup>
                  <b>{d.deviceId}</b><br />
                  {new Date(d.ts).toLocaleString()}<br />
                  via {d.uploaderDeviceId}
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      </div>

      {lastUpdate && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,128,0,0.8)',
          color: '#fff', padding: '8px 16px',
          borderRadius: 8, zIndex: 999
        }}>
          Location updated at {lastUpdate.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
