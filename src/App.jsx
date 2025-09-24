import React, { useEffect, useState, useRef } from 'react';
import useGeolocation from './hooks/useGeolocation';
import useBluetoothScanner from './hooks/useBluetoothScanner';
import { uploadEvent, uploadBatchIfAny } from './services/syncService';
import './leafletFix';
import 'leaflet/dist/leaflet.css';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';

// Custom Icons
const ownIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/447/447031.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

const relayIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/61/61168.png',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

// Auto recenter map
function RecenterMap({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lon) {
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

  const pos = useGeolocation(scanning, 30000);
  const { adverts } = useBluetoothScanner(scanning);

  useEffect(() => setScanning(true), []);

  useEffect(() => {
    intervalRef.current = setInterval(() => setTimer(t => (t > 0 ? t - 1 : 30)), 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const backendUrl = "https://ble-backend-trim.onrender.com";

  // Socket.IO
  useEffect(() => {
    const socket = io(backendUrl, { transports: ['websocket'], withCredentials: true });
    socket.on('connect', () => console.log('[Socket] Connected', socket.id));
    socket.on('disconnect', () => console.log('[Socket] Disconnected'));
    socket.on('event:new', ev => {
      setDevices(d => ({ ...d, [ev.deviceId]: ev }));
      setLastUpdate(new Date());
    });
    return () => socket.disconnect();
  }, []);

  // Upload own position
  useEffect(() => {
    if (!pos) return;
    const uploadOwnEvent = async () => {
      const ownEvent = {
        deviceId: 'web-' + (navigator.userAgent || '').slice(0, 30),
        ts: pos.ts,
        lat: pos.lat,
        lon: pos.lon,
        rssi: null,
        sourceDeviceId: null,
        uploaderDeviceId: null,
        relayed: false,
      };
      setDevices(d => ({ ...d, [ownEvent.deviceId]: ownEvent }));
      const uploaded = await uploadEvent(ownEvent);
      if (uploaded) setLastUpdate(new Date());
      await uploadBatchIfAny();
      setTimer(30);
    };
    uploadOwnEvent();
  }, [pos]);

  // Upload relayed adverts
  useEffect(() => {
    if (!adverts || adverts.length === 0) return;
    const handleAdverts = async () => {
      for (const a of adverts) {
        if (!a.lat || !a.lon) continue;
        const ev = {
          deviceId: a.id || `adv-${a.sourceDeviceId}`,
          ts: a.ts || new Date().toISOString(),
          lat: parseFloat(a.lat),
          lon: parseFloat(a.lon),
          rssi: a.rssi,
          sourceDeviceId: a.sourceDeviceId,
          uploaderDeviceId: 'web-relay',
          relayed: true,
        };
        setDevices(d => ({ ...d, [ev.deviceId]: ev }));
        await uploadEvent(ev);
      }
      await uploadBatchIfAny();
    };
    handleAdverts();
  }, [adverts]);

  const ownDevice = Object.values(devices).find(d => !d.relayed);
  const totalDevices = Object.keys(devices).length;
  const onlineDevices = Object.values(devices).filter(d => d.lat && d.lon).length;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>BLE PWA Relay</h1>
          <div className="stats">
            <div className="stat-item">
              <span className="stat-value">{totalDevices}</span>
              <span className="stat-label">Total Devices</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{onlineDevices}</span>
              <span className="stat-label">Online</span>
            </div>
          </div>
        </div>
       
      </header>

      <div style={{ display: 'flex', height: '100%', width: '100%' }}>
        {/* Sidebar */}
        <div style={{ width: 320, padding: 12, borderRight: '1px solid #ddd', overflowY: 'auto' }}>
          <button onClick={() => setScanning(s => !s)}>{scanning ? 'Stop' : 'Start'} scanning</button>
          <p>Geo: {pos ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}` : 'no fix yet'}</p>
          <p>Next upload in: {timer}s</p>
          <h4>Discovered Devices</h4>
          <ul>
            {Object.values(devices).map(d => (
              <li key={d.deviceId}>
                {d.deviceId} {d.lat ? `@ ${d.lat.toFixed(5)},${d.lon.toFixed(5)}` : ''} {d.relayed ? '(relayed)' : '(me)'}
              </li>
            ))}
          </ul>
        </div>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          {ownDevice ? (
            <MapContainer center={[ownDevice.lat, ownDevice.lon]} zoom={15} style={{ flex: 1, height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[ownDevice.lat, ownDevice.lon]} icon={ownIcon}>
                <Popup>
                  <b>Me</b>
                  <br />
                  {new Date(ownDevice.ts).toLocaleString()}
                </Popup>
              </Marker>
              <RecenterMap lat={ownDevice.lat} lon={ownDevice.lon} />
              {Object.values(devices)
                .filter(d => d.relayed)
                .map(d => (
                  <Marker key={d.deviceId} position={[d.lat, d.lon]} icon={relayIcon}>
                    <Popup>
                      <b>{d.deviceId}</b>
                      <br />
                      {new Date(d.ts).toLocaleString()}
                      <br />
                      via {d.uploaderDeviceId}
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Loading map...
            </div>
          )}
        </div>
      </div>

      {lastUpdate && (
        <div className="update-toast">
          Location updated at {lastUpdate.toLocaleTimeString()}
        </div>
      )}

      <style jsx>{`
        .app-container {
          height: 100vh;
          width: 100vw;
          display: flex;
          flex-direction: column;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        .app-header {
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          color: white;
          padding: 12px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          z-index: 1000;
        }

        .header-content {
          display: flex;
          align-items: center;
          gap: 30px;
        }

        .app-header h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 600;
        }

        .stats {
          display: flex;
          gap: 20px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .stat-value {
          font-size: 18px;
          font-weight: bold;
        }

        .stat-label {
          font-size: 12px;
          opacity: 0.8;
        }

        .download-btn {
          background-color: rgba(255,255,255,0.2);
          color: white;
          padding: 6px 12px;
          border-radius: 30px;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.3s ease;
        }

        .download-btn:hover {
          background-color: rgba(255,255,255,0.3);
          transform: translateY(-2px);
        }

        .update-toast {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,128,0,0.8);
          color: #fff;
          padding: 8px 16px;
          border-radius: 8px;
          z-index: 999;
        }
      `}</style>
    </div>
  );
}
