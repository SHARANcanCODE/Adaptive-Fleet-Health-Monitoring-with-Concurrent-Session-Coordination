'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { fetchAnomalies, fetchDevices, Anomaly, Device } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useLiveControl } from '@/lib/live-control';
import LiveStatus from '@/components/LiveStatus';
import AnomalyBadge from '@/components/AnomalyBadge';
import { format, subHours } from 'date-fns';

const FAILURE_MODES = [
  { value: '', label: 'All Failure Modes' },
  { value: 'spike', label: 'Spike' },
  { value: 'drift', label: 'Drift' },
  { value: 'flatline', label: 'Flatline' },
  { value: 'oscillation', label: 'Oscillation' },
  { value: 'sensor_swap', label: 'Sensor Swap' },
];

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { isPaused } = useLiveControl();
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    loadDevices();
    loadAnomalies();

    const socket = getSocket();

    const onAnomalyNew = (data: { deviceId: string; anomaly: any }) => {
      if (isPausedRef.current) return;
      if (!data?.anomaly) return;

      // Filter check
      if (selectedDevice && data.deviceId !== selectedDevice) return;
      if (selectedType && data.anomaly.type !== selectedType) return;

      setAnomalies((prev) => {
        if (prev.some((a) => a.id === data.anomaly.id)) return prev;
        return [data.anomaly, ...prev].slice(0, 1000);
      });
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm mb-1 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Detected Anomalies</h1>
            <p className="text-gray-600 text-sm mt-1">
              Live failure classifications produced by adaptive per-device baseline engines
            </p>
          </div>
          <LiveStatus />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-700 mb-2">
                Filter by Device
              </label>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Devices ({devices.length})</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} ({device.id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-700 mb-2">
                Filter by Failure Mode
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {FAILURE_MODES.map((fm) => (
                  <option key={fm.value} value={fm.value}>
                    {fm.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Anomalies Table */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading anomalies...</div>
          ) : anomalies.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <p className="font-medium text-gray-700">No anomalies detected</p>
              <p className="text-xs text-gray-400 mt-1">No anomalous telemetry points in the selected filter window.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Device
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Classification & Channel
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Sensor Measurements
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {anomalies.map((anomaly) => (
                    <tr key={anomaly.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                        {format(new Date(anomaly.ts), 'PP pp')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        <Link
                          href={`/devices/${anomaly.deviceId}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {anomaly.device?.name || anomaly.deviceId}
                        </Link>
                        <span className="block text-xs font-mono text-gray-400 font-normal">
                          {anomaly.deviceId}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <AnomalyBadge
                          score={anomaly.score}
                          type={anomaly.type}
                          metricChannel={anomaly.metricChannel}
                          flagged={anomaly.flagged}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold font-mono text-rose-600">
                        {anomaly.score ? anomaly.score.toFixed(2) : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-gray-600">
                        {anomaly.metric ? (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <div><span className="text-gray-400">Temp:</span> {anomaly.metric.temperature_c.toFixed(2)}°C</div>
                            <div><span className="text-gray-400">Vib:</span> {anomaly.metric.vibration_g.toFixed(3)}g</div>
                            <div><span className="text-gray-400">Hum:</span> {anomaly.metric.humidity_pct.toFixed(1)}%</div>
                            <div><span className="text-gray-400">Volt:</span> {anomaly.metric.voltage_v.toFixed(2)}V</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">N/A</span>
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
