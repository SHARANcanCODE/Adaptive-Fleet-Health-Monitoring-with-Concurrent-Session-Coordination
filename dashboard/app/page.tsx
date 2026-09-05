'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { fetchDevices, fetchAnomalies, Device, Anomaly } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useLiveControl } from '@/lib/live-control';
import LiveStatus from '@/components/LiveStatus';
import AnomalyBadge from '@/components/AnomalyBadge';
import { format, subHours } from 'date-fns';

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [anomalies24h, setAnomalies24h] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const { isPaused } = useLiveControl();
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const loadDevices = async () => {
    try {
      const data = await fetchDevices();
      setDevices(data);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadAnomalies = async () => {
    try {
      const anomaliesData = await fetchAnomalies({
        from: subHours(new Date(), 24).toISOString(),
        limit: 100,
      });
      setAnomalies24h(anomaliesData);
    } catch (error) {
      console.error('Failed to load anomalies:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadDevices(), loadAnomalies()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const socket = getSocket();

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

    const onAnomalyNew = (data: { deviceId: string; anomaly: any }) => {
      if (isPausedRef.current) return;
      if (data?.anomaly) {
        setAnomalies24h((prev) => {
          if (prev.some((a) => a.id === data.anomaly.id)) return prev;
          return [data.anomaly, ...prev].slice(0, 100);
        });

        setDevices((prev) =>
          prev.map((d) => {
            if (d.id === data.deviceId) {
              return {
                ...d,
                lastAnomaly: true,
                _count: {
                  ...d._count!,
                  anomalies: (d._count?.anomalies || 0) + 1,
                },
              };
            }
            return d;
          })
        );
      }
    };

    socket.on('metric:new', onMetricNew);
    socket.on('anomaly:new', onAnomalyNew);

    return () => {
      socket.off('metric:new', onMetricNew);
      socket.off('anomaly:new', onAnomalyNew);
    };
  }, []);

  const totalMetrics = devices.reduce((sum, d) => sum + (d._count?.metrics || 0), 0);

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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              IoT Anomaly Detection Dashboard
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Push-based adaptive telemetry baseline monitoring and regional conflict coordination
            </p>
          </div>
          <LiveStatus />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
            <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Total Devices</h3>
            <p className="text-3xl font-bold text-gray-900">{devices.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
            <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Total Metrics Streamed</h3>
            <p className="text-3xl font-bold text-gray-900">{totalMetrics.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
            <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Anomalies Detected (24h)</h3>
            <p className="text-3xl font-bold text-rose-600">{anomalies24h.length}</p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/devices"
            className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 hover:shadow-md transition"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-2">View All Devices</h2>
            <p className="text-gray-600 text-sm">Browse device inventory, view live metrics and adaptive baselines</p>
          </Link>
          <Link
            href="/anomalies"
            className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 hover:shadow-md transition"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-2">View Anomalies</h2>
            <p className="text-gray-600 text-sm">Review detected anomaly events and failure mode classifications</p>
          </Link>
        </div>

        {/* Recent Anomalies */}
        {anomalies24h.length > 0 && (
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Anomalies</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Device
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Failure Mode
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {anomalies24h.slice(0, 10).map((anomaly) => (
                    <tr key={anomaly.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                        {format(new Date(anomaly.ts), 'PP pp')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        <Link
                          href={`/devices/${encodeURIComponent(anomaly.deviceId)}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {anomaly.device?.name || anomaly.deviceId}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <AnomalyBadge
                          score={anomaly.score}
                          type={anomaly.type}
                          metricChannel={anomaly.metricChannel}
                          flagged={anomaly.flagged}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold font-mono text-rose-600">
                        {anomaly.score.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
