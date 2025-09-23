import { useEffect, useState, useRef } from 'react';

export default function useGeolocation(enabled = false, intervalMs = 60000) {
  const [position, setPosition] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let watchId;
console.log('geoloc effect', enabled, intervalMs);

    async function getPos() {
      try {
        const p = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, maximumAge: 0 })
        );
        setPosition({ lat: p.coords.latitude, lon: p.coords.longitude, ts: new Date().toISOString() });
      } catch (e) {
        // permission denied or no fix
      }
    }

    if (enabled && 'geolocation' in navigator) {
      getPos();
      timerRef.current = setInterval(getPos, intervalMs);
    }

    return () => { clearInterval(timerRef.current); if (watchId) navigator.geolocation.clearWatch(watchId); };
  }, [enabled, intervalMs]);

  return position;
}
