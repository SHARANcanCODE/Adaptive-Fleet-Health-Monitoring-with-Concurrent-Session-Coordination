'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { fetchDevices, Device } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useLiveControl } from '@/lib/live-control';
import LiveStatus from '@/components/LiveStatus';
import DeviceTable from '@/components/DeviceTable';

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const { isPaused } = useLiveControl();
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

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

  useEffect(() => {
    loadDevices();

    const socket = getSocket();

    const onDeviceUpdate = (data?: { deviceId: string; device: Device }) => {
      if (isPausedRef.current) return;
      if (data?.device) {
        setDevices((prev) => {
          const exists = prev.some((d) => d.id === data.device.id);
          if (exists) {
            return prev.map((d) => (d.id === data.device.id ? { ...d, ...data.device } : d));
          }
          return [data.device, ...prev];
        });
      } else {
        loadDevices();
      }
    };

    const onMetricNew = (data: { deviceId: string; metric: any }) => {
      if (isPausedRef.current) return;
      setDevices((prev) => {
        const exists = prev.some((d) => d.id === data.deviceId);
        if (!exists) {
          loadDevices();
          return prev;
        }
        return prev.map((d) => {
          if (d.id === data.deviceId) {
            return {
              ...d,
              _count: {
                ...d._count,
                metrics: (d._count?.metrics || 0) + 1,
                anomalies: d._count?.anomalies || 0,
              },
            };
          }
          return d;
        });
      });
    };

    socket.on('device:update', onDeviceUpdate);
    socket.on('metric:new', onMetricNew);

    return () => {
      socket.off('device:update', onDeviceUpdate);
      socket.off('metric:new', onMetricNew);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Link href="/" className="text-blue-600 hover:text-blue-800 mb-1 inline-block text-sm">
              ← Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Registered Devices</h1>
            <p className="text-gray-600 text-sm mt-1">
              Active sensor fleet nodes with per-device adaptive telemetry baselines
            </p>
          </div>
          <LiveStatus />
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
          <DeviceTable devices={devices} />
        </div>
      </div>
    </div>
  );
}
