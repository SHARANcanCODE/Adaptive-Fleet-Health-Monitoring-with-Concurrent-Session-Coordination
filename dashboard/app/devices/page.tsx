'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchDevices, Device } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import LiveStatus from '@/components/LiveStatus';
import DeviceTable from '@/components/DeviceTable';

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDevices();

    const socket = getSocket();

    const onDeviceUpdate = () => {
      loadDevices();
    };

    const onMetricNew = () => {
      loadDevices();
    };

    socket.on('device:update', onDeviceUpdate);
    socket.on('metric:new', onMetricNew);

    return () => {
      socket.off('device:update', onDeviceUpdate);
      socket.off('metric:new', onMetricNew);
    };
  }, []);

  const loadDevices = async () => {
    try {
      const devicesData = await fetchDevices();
      setDevices(devicesData);
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/" className="text-blue-600 hover:text-blue-800 mb-2 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Devices</h1>
          </div>
          <LiveStatus />
        </div>

        <div className="bg-white rounded-lg shadow">
          <DeviceTable devices={devices} />
        </div>
      </div>
    </div>
  );
}

