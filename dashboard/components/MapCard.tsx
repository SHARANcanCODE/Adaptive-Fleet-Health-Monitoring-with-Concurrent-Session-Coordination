'use client';

import { useEffect, useRef, useState } from 'react';
import { Device } from '@/lib/api';
import { useSocket } from '@/lib/socket';

interface MapCardProps {
  devices: Device[];
}

export default function MapCard({ devices }: MapCardProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapLibRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const { socket } = useSocket();

  useEffect(() => {
    if (!mapContainer.current || mapLoaded) return;

    // Dynamically import MapLibre GL
    import('maplibre-gl').then((maplibre) => {
      const mapLib = maplibre.default;
      mapLibRef.current = mapLib;
      const Map = mapLib.Map;

      const map = new Map({
        container: mapContainer.current!,
        style: {
          version: 8,
          sources: {
            'raster-tiles': {
              type: 'raster',
              tiles: [
                'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              ],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            },
          },
          layers: [
            {
              id: 'simple-tiles',
              type: 'raster',
              source: 'raster-tiles',
              minzoom: 0,
              maxzoom: 22,
            },
          ],
        },
        center: [0, 20], // Default center
        zoom: 2,
      });

      map.on('load', () => {
        setMapLoaded(true);
        mapRef.current = map;
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapLoaded]);

  // Update markers when devices change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !mapLibRef.current) return;

    const map = mapRef.current;
    const mapLib = mapLibRef.current;

    // Remove old markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    // Add markers for devices with location
    devices.forEach((device) => {
      const location = parseLocation(device.location);
      if (!location) return;

      const [lng, lat] = location;

      // Create marker element
      const el = document.createElement('div');
      el.className = 'device-marker';
      el.style.width = '24px';
      el.style.height = '24px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = device.lastAnomaly ? '#ef4444' : '#10b981';
      el.style.border = '2px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
      el.title = `${device.name} - ${device.location || 'Unknown'}`;

      // Create popup and marker using the imported mapLib
      const Popup = mapLib.Popup;
      const Marker = mapLib.Marker;
      
      const popup = new Popup({ offset: 25 }).setHTML(
        `
        <div class="p-2">
          <h3 class="font-semibold">${device.name}</h3>
          <p class="text-sm text-gray-600">${device.id}</p>
          <p class="text-sm">Location: ${device.location || 'Unknown'}</p>
          ${device.lastAnomaly ? '<p class="text-sm text-red-600">[WARN] Anomaly detected</p>' : ''}
        </div>
        `
      );

      const marker = new Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.set(device.id, marker);
    });

    // Fit bounds to show all markers
    if (markersRef.current.size > 0) {
      const LngLatBounds = mapLib.LngLatBounds;
      const bounds = new LngLatBounds();
      markersRef.current.forEach((marker) => {
        bounds.extend(marker.getLngLat());
      });
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [devices, mapLoaded]);

  // Update marker colors on real-time anomaly updates
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

  return (
    <div className="w-full h-full min-h-[500px] rounded-lg overflow-hidden border border-gray-200">
      <div ref={mapContainer} className="w-full h-full" />
      <style jsx global>{`
        .maplibregl-popup-content {
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}

function parseLocation(location: string | null): [number, number] | null {
  if (!location) return null;

  // Parse format: "lat:37.335,lng:-121.881"
  const latMatch = location.match(/lat:([-\d.]+)/);
  const lngMatch = location.match(/lng:([-\d.]+)/);

  if (latMatch && lngMatch) {
    return [parseFloat(lngMatch[1]), parseFloat(latMatch[1])];
  }

  return null;
}

