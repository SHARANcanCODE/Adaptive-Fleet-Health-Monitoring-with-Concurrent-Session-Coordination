'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchAnomalies, fetchDevices, Anomaly, Device } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import LiveStatus from '@/components/LiveStatus';
import AnomalyBadge from '@/components/AnomalyBadge';
import { format, subHours } from 'date-fns';

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDevices();
    loadAnomalies();

    const socket = getSocket();

    const onAnomalyNew = () => {
      loadAnomalies();
    };

    socket.on('anomaly:new', onAnomalyNew);

    return () => {
      socket.off('anomaly:new', onAnomalyNew);
    };
  }, [selectedDevice, selectedType]);

  const loadDevices = async () => {
    try {
      const devicesData = await fetchDevices();
      setDevices(devicesData);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadAnomalies = async () => {
    try {
      setLoading(true);
      const anomaliesData = await fetchAnomalies({
        deviceId: selectedDevice || undefined,
        type: selectedType || undefined,
        from: subHours(new Date(), 24).toISOString(),
        limit: 1000,
      });
      setAnomalies(anomaliesData);
    } catch (error) {
      console.error('Failed to load anomalies:', error);
    } finally {
      setLoading(false);
    }
  };

  const uniqueTypes = Array.from(new Set(anomalies.map((a) => a.type)));

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/" className="text-blue-600 hover:text-blue-800 mb-2 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Anomalies</h1>
          </div>
          <LiveStatus />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Device
              </label>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Devices</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                {uniqueTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Anomalies Table */}
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-8 text-center">Loading...</div>
          ) : anomalies.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No anomalies found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Device
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Metric Values
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {anomalies.map((anomaly) => (
                    <tr key={anomaly.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(new Date(anomaly.ts), 'PPpp')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <Link
                          href={`/devices/${anomaly.deviceId}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {anomaly.device?.name || anomaly.deviceId}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <AnomalyBadge
                          score={anomaly.score}
                          type={anomaly.type}
                          flagged={anomaly.flagged}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">
                        {anomaly.score.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {anomaly.metric ? (
                          <div className="space-y-1">
                            <div>Temp: {anomaly.metric.temperature_c.toFixed(2)}°C</div>
                            <div>Vib: {anomaly.metric.vibration_g.toFixed(3)}g</div>
                            <div>Hum: {anomaly.metric.humidity_pct.toFixed(1)}%</div>
                            <div>Volt: {anomaly.metric.voltage_v.toFixed(2)}V</div>
                          </div>
                        ) : (
                          'N/A'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

