'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchDevice, fetchMetrics, Device, Metric } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useLiveControl } from '@/lib/live-control';
import LiveStatus from '@/components/LiveStatus';
import MetricChart from '@/components/MetricChart';
import PlotlyChart from '@/components/PlotlyChart';
import { subMinutes, subHours, subDays } from 'date-fns';

type TimeRange = '15m' | '1h' | '24h' | '7d';
type ChartEngine = 'recharts' | 'plotly';

export default function DeviceDetailPage() {
  const params = useParams();
  const rawId = params.id as string;
  const deviceId = rawId ? decodeURIComponent(rawId) : '';

  const [device, setDevice] = useState<Device | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [chartEngine, setChartEngine] = useState<ChartEngine>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chartEngine');
      return (saved === 'plotly' || saved === 'recharts') ? saved : 'recharts';
    }
    return 'recharts';
  });
  const [loading, setLoading] = useState(true);
  const { isPaused, togglePause } = useLiveControl();
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (!deviceId) return;

    loadDevice();
    loadMetrics();

    const socket = getSocket();
    socket.emit('subscribe:device', deviceId);

    const onMetricNew = (data: { deviceId: string; metric: Metric }) => {
      if (isPausedRef.current) return;
      if (data.deviceId === deviceId && data.metric) {
        setMetrics((prev) => [data.metric, ...prev].slice(0, 500));
      }
    };

    socket.on('metric:new', onMetricNew);

    return () => {
      socket.emit('unsubscribe:device', deviceId);
      socket.off('metric:new', onMetricNew);
    };
  }, [deviceId, timeRange]);

  const loadDevice = async () => {
    try {
      const deviceData = await fetchDevice(deviceId);
      setDevice(deviceData);
    } catch (error) {
      console.error('Failed to load device:', error);
    }
  };

  const loadMetrics = async () => {
    try {
      let from: Date;
      switch (timeRange) {
        case '15m':
          from = subMinutes(new Date(), 15);
          break;
        case '1h':
          from = subHours(new Date(), 1);
          break;
        case '24h':
          from = subHours(new Date(), 24);
          break;
        case '7d':
          from = subDays(new Date(), 7);
          break;
      }

      const metricsData = await fetchMetrics({
        deviceId,
        from: from.toISOString(),
        limit: 1000,
      });
      setMetrics(metricsData);
    } catch (error) {
      console.error('Failed to load metrics:', error);
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

  if (!device) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-rose-600">Device not found: {deviceId}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <Link href="/devices" className="text-blue-600 hover:text-blue-800 mb-2 inline-block text-sm">
              ← Back to Devices
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-gray-900">{device.name}</h1>
              <span className="px-2.5 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 text-gray-700 border border-gray-200">
                {device.id}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
                {device.fleetId || 'fleet-a'}
              </span>
            </div>
            <p className="text-gray-600 text-sm mt-1">
              Region: <strong>{device.region || 'Unassigned'}</strong> • Location: <span className="font-mono">{device.location || 'Unknown'}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Pause live reload toggle button */}
            <button
              onClick={togglePause}
              className={`px-4 py-2 rounded-lg text-xs font-bold border transition shadow-xs flex items-center gap-2 ${isPaused
                  ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-300'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border-gray-300'
                }`}
            >
              <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
              <span>{isPaused ? 'Resume Live Telemetry' : 'Pause Live Telemetry'}</span>
            </button>

            <LiveStatus />
          </div>
        </div>

        {/* Paused Banner Notification */}
        {isPaused && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl text-xs flex items-center justify-between shadow-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="font-semibold">Sensor Live Reload Paused</span>
              <span className="text-amber-800">Incoming points are frozen on charts so you can inspect and explain telemetry anomalies.</span>
            </div>
            <button
              onClick={togglePause}
              className="px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold rounded text-xs transition"
            >
              Resume Streaming
            </button>
          </div>
        )}

        {/* Cross-fleet Collision / Duplicate ID Banner */}
        {device.conflictWithId && (
          <div className="bg-rose-50 border border-rose-200 text-rose-900 px-5 py-3.5 rounded-xl text-xs space-y-1 shadow-xs">
            <div className="font-bold flex items-center gap-2">
              <span>Cross-Fleet Collision Linked:</span>
              <span className="font-mono bg-rose-100 px-1.5 py-0.5 rounded text-rose-950 font-semibold">{device.id}</span>
            </div>
            <p className="text-rose-800">
              This device collided on externalId with another fleet and was assigned a synthesized unique namespace.
              Telemetry histories for both devices are preserved independently.
            </p>
            <div className="pt-1">
              <Link
                href={`/devices/${encodeURIComponent(device.conflictWithId)}`}
                className="text-blue-700 hover:text-blue-900 font-semibold underline inline-block"
              >
                Inspect Counterpart Device ({device.conflictWithId}) →
              </Link>
            </div>
          </div>
        )}

        {/* Time Range Selector & Chart Engine Toggle */}
        <div className="flex flex-wrap gap-3 items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-gray-500 mr-1">Time Range:</span>
            {(['15m', '1h', '24h', '7d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => {
                  setTimeRange(range);
                  setLoading(true);
                  loadMetrics();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${timeRange === range
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {range}
              </button>
            ))}
          </div>

          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500 font-medium">Renderer:</span>
            <button
              onClick={() => {
                const newEngine: ChartEngine = chartEngine === 'recharts' ? 'plotly' : 'recharts';
                setChartEngine(newEngine);
                localStorage.setItem('chartEngine', newEngine);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${chartEngine === 'plotly'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {chartEngine === 'recharts' ? 'Switch to Plotly' : 'Switch to Recharts'}
            </button>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center justify-between">
              <span>Temperature</span>
              <span className="text-xs font-mono text-gray-500 font-normal">°C</span>
            </h2>
            {chartEngine === 'recharts' ? (
              <MetricChart
                metrics={metrics}
                metricKey="temperature_c"
                label="Temperature"
                unit="°C"
                color="#ef4444"
              />
            ) : (
              <PlotlyChart
                data={metrics}
                metricType="temperature_c"
                title="Temperature (°C)"
              />
            )}
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center justify-between">
              <span>Voltage</span>
              <span className="text-xs font-mono text-gray-500 font-normal">V</span>
            </h2>
            {chartEngine === 'recharts' ? (
              <MetricChart
                metrics={metrics}
                metricKey="voltage_v"
                label="Voltage"
                unit="V"
                color="#10b981"
              />
            ) : (
              <PlotlyChart
                data={metrics}
                metricType="voltage_v"
                title="Voltage (V)"
              />
            )}
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center justify-between">
              <span>Vibration</span>
              <span className="text-xs font-mono text-gray-500 font-normal">g</span>
            </h2>
            {chartEngine === 'recharts' ? (
              <MetricChart
                metrics={metrics}
                metricKey="vibration_g"
                label="Vibration"
                unit="g"
                color="#f59e0b"
              />
            ) : (
              <PlotlyChart
                data={metrics}
                metricType="vibration_g"
                title="Vibration (g)"
              />
            )}
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center justify-between">
              <span>Humidity</span>
              <span className="text-xs font-mono text-gray-500 font-normal">%</span>
            </h2>
            {chartEngine === 'recharts' ? (
              <MetricChart
                metrics={metrics}
                metricKey="humidity_pct"
                label="Humidity"
                unit="%"
                color="#3b82f6"
              />
            ) : (
              <PlotlyChart
                data={metrics}
                metricType="humidity_pct"
                title="Humidity (%)"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
