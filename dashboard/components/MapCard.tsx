'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Device } from '@/lib/api';
import { useSocket } from '@/lib/socket';
import { useSpotlight } from '@/lib/spotlight';

interface MapCardProps {
  devices: Device[];
  selectedDeviceId?: string | null;
  onSelectDevice?: (deviceId: string) => void;
}

export default function MapCard({ devices, selectedDeviceId, onSelectDevice }: MapCardProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapLibRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const popupsRef = useRef<Map<string, any>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const { socket } = useSocket();
  const { spotlightedIds, setSpotlight } = useSpotlight();

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    let isMounted = true;

    import('maplibre-gl').then((maplibre) => {
      if (!isMounted || !mapContainer.current) return;

      const mapLib = maplibre.default;
      mapLibRef.current = mapLib;
      const Map = mapLib.Map;

      const map = new Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'carto-voyager': {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              ],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            },
          },
          layers: [
            {
              id: 'carto-layer',
              type: 'raster',
              source: 'carto-voyager',
              minzoom: 0,
              maxzoom: 20,
            },
          ],
        },
        center: [0, 25],
        zoom: 1.8,
        attributionControl: false,
      });

      // Add navigation controls (+ / - zoom buttons)
      map.addControl(new mapLib.NavigationControl({ showCompass: true }), 'top-right');
      map.addControl(new mapLib.AttributionControl({ compact: true }), 'bottom-right');

      map.on('load', () => {
        if (!isMounted) return;
        setMapLoaded(true);
        mapRef.current = map;
        // Trigger resize to guarantee WebGL canvas buffer matches container dimensions
        setTimeout(() => map.resize(), 100);
        setTimeout(() => map.resize(), 500);
      });
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fly to device location helper
  const flyToDevice = useCallback((deviceId: string) => {
    if (!mapRef.current || !mapLibRef.current) return;

    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;

    const location = parseLocation(device.location);
    if (!location) return;

    const [lng, lat] = location;
    const map = mapRef.current;

    map.flyTo({
      center: [lng, lat],
      zoom: 6.5,
      speed: 1.4,
      curve: 1.2,
      essential: true,
    });

    // Open popup for this device marker
    const marker = markersRef.current.get(deviceId);
    if (marker) {
      const popup = popupsRef.current.get(deviceId);
      if (popup) {
        // Close all other popups
        popupsRef.current.forEach((p) => p.remove());
        popup.addTo(map);
      }
    }
  }, [devices]);

  // Handle selectedDeviceId change from props (e.g. clicked in the device list below)
  useEffect(() => {
    if (selectedDeviceId && mapLoaded) {
      flyToDevice(selectedDeviceId);
    }
  }, [selectedDeviceId, mapLoaded, flyToDevice]);

  // Update markers when devices list changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !mapLibRef.current) return;

    const map = mapRef.current;
    const mapLib = mapLibRef.current;

    // Remove old markers and popups
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    popupsRef.current.clear();

    // Add markers for all devices with coordinates
    devices.forEach((device) => {
      const location = parseLocation(device.location);
      if (!location) return;

      const [lng, lat] = location;
      const isSpotlight = spotlightedIds.includes(device.id) || selectedDeviceId === device.id;

      // Marker element
      const el = document.createElement('div');
      el.className = `device-marker device-${device.id} cursor-pointer group`;
      el.style.width = isSpotlight ? '30px' : '20px';
      el.style.height = isSpotlight ? '30px' : '20px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = device.lastAnomaly ? '#ef4444' : '#10b981';
      el.style.border = isSpotlight ? '3px solid #f59e0b' : '2.5px solid #ffffff';
      el.style.boxShadow = isSpotlight
        ? '0 0 0 6px rgba(245, 158, 11, 0.45), 0 4px 12px rgba(0,0,0,0.35)'
        : '0 2px 6px rgba(0,0,0,0.25)';
      el.style.transition = 'all 0.25s ease';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';

      // Inner dot
      const innerDot = document.createElement('div');
      innerDot.style.width = '6px';
      innerDot.style.height = '6px';
      innerDot.style.borderRadius = '50%';
      innerDot.style.backgroundColor = '#ffffff';
      el.appendChild(innerDot);

      // Click listener: Spotlight and select device
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSpotlight(device.id, 'map-marker');
        if (onSelectDevice) {
          onSelectDevice(device.id);
        }
        flyToDevice(device.id);
      });

      // Create popup
      const Popup = mapLib.Popup;
      const popup = new Popup({
        offset: 20,
        closeButton: true,
        closeOnClick: false,
        className: 'custom-map-popup',
      }).setHTML(`
        <div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 4px 2px; min-width: 190px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
            <strong style="font-size: 14px; color: #111827;">${device.name}</strong>
            <span style="font-size: 10px; font-weight: 700; background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
              ${device.region || 'Region'}
            </span>
          </div>
          <div style="font-size: 11px; font-family: monospace; color: #4b5563; margin-bottom: 4px;">
            ${device.id} • ${device.fleetId || 'fleet-a'}
          </div>
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">
            📍 ${device.location || 'Unknown'}
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #f3f4f6; padding-top: 6px; font-size: 11px;">
            <span style="font-weight: 600; color: ${device.lastAnomaly ? '#dc2626' : '#16a34a'};">
              ${device.lastAnomaly ? '● Anomaly Active' : '● Status: Normal'}
            </span>
            <a href="/devices/${encodeURIComponent(device.id)}" style="color: #2563eb; font-weight: 600; text-decoration: none;">
              Graphs →
            </a>
          </div>
        </div>
      `);

      const Marker = mapLib.Marker;
      const marker = new Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.set(device.id, marker);
      popupsRef.current.set(device.id, popup);
    });

    // Fit bounds on initial load if no device is selected
    if (markersRef.current.size > 0 && !selectedDeviceId) {
      const LngLatBounds = mapLib.LngLatBounds;
      const bounds = new LngLatBounds();
      markersRef.current.forEach((marker) => {
        bounds.extend(marker.getLngLat());
      });
      map.fitBounds(bounds, { padding: 60, maxZoom: 5, duration: 1000 });
    }
  }, [devices, mapLoaded, selectedDeviceId, onSelectDevice, setSpotlight, flyToDevice, spotlightedIds]);

  // Update marker styles when spotlight or selected device changes
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const isSpotlight = spotlightedIds.includes(id) || selectedDeviceId === id;
      const el = marker.getElement();
      if (isSpotlight) {
        el.style.width = '30px';
        el.style.height = '30px';
        el.style.border = '3px solid #f59e0b';
        el.style.boxShadow = '0 0 0 8px rgba(245, 158, 11, 0.45), 0 4px 14px rgba(0,0,0,0.4)';
        el.style.zIndex = '999';
      } else {
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.border = '2.5px solid #ffffff';
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
        el.style.zIndex = '1';
      }
    });
  }, [spotlightedIds, selectedDeviceId]);

  // Socket.IO real-time anomaly indicator update
  useEffect(() => {
    if (!socket) return;

    const handleAnomaly = (data: any) => {
      const marker = markersRef.current.get(data.deviceId);
      if (marker) {
        const el = marker.getElement();
        el.style.backgroundColor = '#ef4444';
      }
    };

    socket.on('anomaly:new', handleAnomaly);
    return () => {
      socket.off('anomaly:new', handleAnomaly);
    };
  }, [socket]);

  const handleResetView = () => {
    if (!mapRef.current || !mapLibRef.current || markersRef.current.size === 0) return;
    const LngLatBounds = mapLibRef.current.LngLatBounds;
    const bounds = new LngLatBounds();
    markersRef.current.forEach((marker) => {
      bounds.extend(marker.getLngLat());
    });
    mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 4, duration: 1200 });
  };

  return (
    <div className="w-full h-full min-h-[560px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm relative bg-slate-100 flex flex-col">
      <div ref={mapContainer} className="w-full h-[560px]" style={{ minHeight: '560px' }} />

      {/* Map Overlay Controls */}
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <button
          onClick={handleResetView}
          className="px-3 py-1.5 bg-white/95 backdrop-blur-sm text-gray-800 hover:bg-white text-xs font-semibold rounded-lg shadow-sm border border-gray-200/80 transition flex items-center gap-1.5"
          title="Reset map view to fit all global device locations"
        >
          <span>Fit All Devices</span>
        </button>
      </div>

      {/* Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-sm px-3.5 py-2.5 rounded-xl shadow-md border border-gray-200 text-xs flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white shadow-xs"></span>
          <span className="text-gray-700 font-medium">Normal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-500 border border-white shadow-xs"></span>
          <span className="text-gray-700 font-medium">Anomaly Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-amber-500 ring-2 ring-amber-400/50 shadow-xs"></span>
          <span className="text-amber-900 font-bold">Spotlighted</span>
        </div>
      </div>

      <style jsx global>{`
        .maplibregl-popup-content {
          font-family: inherit;
          border-radius: 12px;
          padding: 12px 14px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(0, 0, 0, 0.08);
        }
        .maplibregl-popup-close-button {
          font-size: 16px;
          color: #6b7280;
          padding: 4px 8px;
        }
        .maplibregl-popup-close-button:hover {
          color: #111827;
          background: transparent;
        }
      `}</style>
    </div>
  );
}

function parseLocation(location: string | null | undefined): [number, number] | null {
  if (!location) return null;

  // Supports format: "lat:40.7128,lng:-74.0060" or "lat: 40.7128, lng: -74.0060"
  const latMatch = location.match(/lat:\s*([-\d.]+)/);
  const lngMatch = location.match(/lng:\s*([-\d.]+)/);

  if (latMatch && lngMatch) {
    const lat = parseFloat(latMatch[1]);
    const lng = parseFloat(lngMatch[1]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return [lng, lat]; // MapLibre GL takes [lng, lat]
    }
  }

  return null;
}
