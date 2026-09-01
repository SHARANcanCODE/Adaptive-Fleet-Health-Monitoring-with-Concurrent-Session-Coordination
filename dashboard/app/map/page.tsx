'use client';

import { useEffect, useState } from 'react';
import { fetchDevices, Device } from '@/lib/api';
import MapCard from '@/components/MapCard';

export default function MapPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDevices();
  }, []);

  async function loadDevices() {
    try {
      const data = await fetchDevices();
      setDevices(data);
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading map...</div>
      </div>
    );
  }

  const devicesWithLocation = devices.filter((d) => d.location);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Device Map</h1>
        <p className="text-gray-600">
          {devicesWithLocation.length} device{devicesWithLocation.length !== 1 ? 's' : ''} with location data
        </p>
      </div>

      {devicesWithLocation.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800">
            No devices with location data found. Devices need to publish lat/lng coordinates via MQTT.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <MapCard devices={devicesWithLocation} />
        </div>
      )}

      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <h2 className="font-semibold mb-2">Device List</h2>
        <div className="space-y-2">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between p-2 bg-white rounded border"
            >
              <div>
                <span className="font-medium">{device.name}</span>
                <span className="text-sm text-gray-500 ml-2">({device.id})</span>
              </div>
              <div className="text-sm text-gray-600">
                {device.location || 'No location'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

