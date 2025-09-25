import React, { useEffect, useState, useRef } from 'react';
import useGeolocation from './hooks/useGeolocation';
import useBluetoothScanner from './hooks/useBluetoothScanner';
import { uploadEvent, uploadBatchIfAny } from './services/syncService';
import './leafletFix';
import 'leaflet/dist/leaflet.css';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';

// Utility: generate & persist unique device ID
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = "web-" + crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

// Custom Icons
const ownIcon = new L.Icon({
  iconUrl: '/icons/pin.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

const otherIcon = new L.Icon({
  iconUrl: '/icons/location-pin.png', // red marker
  iconSize: [28, 28],
  iconAnchor: [14, 28],
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

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log("PWA Install:", outcome);
    setDeferredPrompt(null);
    setInstallable(false);
  };

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
        deviceId: getDeviceId(), // ✅ persistent unique ID
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
          uploaderDeviceId: getDeviceId(), // ✅ tag relays with unique ID
          relayed: true,
        };
        setDevices(d => ({ ...d, [ev.deviceId]: ev }));
        await uploadEvent(ev);
      }
      await uploadBatchIfAny();
    };
    handleAdverts();
  }, [adverts]);

  const ownDevice = Object.values(devices).find(d => !d.relayed && d.deviceId === getDeviceId());
  const totalDevices = Object.keys(devices).length;
  const onlineDevices = Object.values(devices).filter(d => d.lat && d.lon).length;

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-50 to-gray-100 font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 shadow-lg z-10">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
            <div className="bg-white p-2 rounded-lg mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">BLE PWA Relay</h1>
          </div>
          
          <div className="flex items-center space-x-6">
            <div className="flex items-center bg-indigo-500 bg-opacity-30 px-4 py-2 rounded-lg">
              <div className="text-center mr-4">
                <div className="text-2xl font-bold">{totalDevices}</div>
                <div className="text-xs opacity-80">Total Devices</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{onlineDevices}</div>
                <div className="text-xs opacity-80">Online</div>
              </div>
            </div>
            
            {installable && (
              <button 
                onClick={handleInstallClick}
                className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold flex items-center hover:bg-gray-100 transition-all duration-200 shadow-md"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Install App
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <div className="w-full md:w-80 bg-white shadow-md p-4 overflow-y-auto" style={{ minHeight: '0' }}>
          {/* Scan Button */}
          <div className="mb-6">
            <button 
              onClick={() => setScanning(s => !s)}
              className={`w-full py-3 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center ${
                scanning 
                  ? 'bg-red-500 hover:bg-red-600 text-white' 
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {scanning ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                )}
              </svg>
              {scanning ? 'Stop Scanning' : 'Start Scanning'}
            </button>
          </div>

          {/* Location */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h3 className="font-semibold text-gray-700">Location</h3>
            </div>
            <p className="text-gray-600">
              {pos ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}` : 'No location fix yet'}
            </p>
          </div>

          {/* Next Update */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="font-semibold text-gray-700">Next Update</h3>
            </div>
            <div className="flex items-center">
              <div className="w-full bg-gray-200 rounded-full h-2.5 mr-3">
                <div 
                  className="bg-indigo-600 h-2.5 rounded-full" 
                  style={{ width: `${(timer / 30) * 100}%` }}
                ></div>
              </div>
              <span className="text-sm font-medium text-gray-700">{timer}s</span>
            </div>
          </div>

          {/* Devices */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Discovered Devices
            </h3>
            <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
              {Object.values(devices).map(d => (
                <div 
                  key={d.deviceId} 
                  className={`p-3 rounded-lg border ${d.relayed ? 'bg-blue-50 border-blue-200' : (d.deviceId === getDeviceId() ? 'bg-indigo-50 border-indigo-200' : 'bg-red-50 border-red-200')}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="font-medium truncate max-w-[70%]">{d.deviceId}</div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      d.relayed 
                        ? 'bg-blue-100 text-blue-800' 
                        : (d.deviceId === getDeviceId() 
                            ? 'bg-indigo-100 text-indigo-800' 
                            : 'bg-red-100 text-red-800')
                    }`}>
                      {d.relayed ? 'Relayed' : (d.deviceId === getDeviceId() ? 'Me' : 'Other')}
                    </span>
                  </div>
                  {d.lat && (
                    <div className="text-sm text-gray-600 mt-1">
                      {d.lat.toFixed(5)}, {d.lon.toFixed(5)}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(d.ts).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative min-h-[300px]">
          {ownDevice ? (
            <MapContainer 
              center={[ownDevice.lat, ownDevice.lon]} 
              zoom={15} 
              className="w-full h-full"
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {/* Own device */}
              <Marker position={[ownDevice.lat, ownDevice.lon]} icon={ownIcon}>
                <Popup>
                  <div className="font-semibold">Your Location</div>
                  <div>{new Date(ownDevice.ts).toLocaleString()}</div>
                </Popup>
              </Marker>
              <RecenterMap lat={ownDevice.lat} lon={ownDevice.lon} />

              {/* Relayed devices */}
              {Object.values(devices)
                .filter(d => d.relayed)
                .map(d => (
                  <Marker key={d.deviceId} position={[d.lat, d.lon]} icon={relayIcon}>
                    <Popup>
                      <div className="font-semibold">{d.deviceId}</div>
                      <div>{new Date(d.ts).toLocaleString()}</div>
                      <div className="text-sm text-gray-600">via {d.uploaderDeviceId}</div>
                    </Popup>
                  </Marker>
              ))}

              {/* Other devices */}
              {Object.values(devices)
                .filter(d => d.deviceId !== getDeviceId() && !d.relayed)
                .map(d => (
                  <Marker key={d.deviceId} position={[d.lat, d.lon]} icon={otherIcon}>
                    <Popup>
                      <div className="font-semibold">{d.deviceId}</div>
                      <div>{new Date(d.ts).toLocaleString()}</div>
                    </Popup>
                  </Marker>
              ))}
            </MapContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading map...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Update Toast */}
      {lastUpdate && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-20 animate-fade-in">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Location updated at {lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
