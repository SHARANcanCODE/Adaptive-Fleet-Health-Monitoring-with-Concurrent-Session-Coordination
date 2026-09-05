'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchSimulatorStatus,
  setSimulatorSeed,
  fetchMetrics,
  fetchDevice,
  SimulatorStatus,
  SimulatorScheduledDevice,
  Device,
  Metric,
} from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useSpotlight } from '@/lib/spotlight';
import { useLiveControl } from '@/lib/live-control';
import LiveStatus from '@/components/LiveStatus';
import MetricChart from '@/components/MetricChart';

export default function SimulatorPage() {
  const [status, setStatus] = useState<SimulatorStatus | null>(null);
  const [seedInput, setSeedInput] = useState<string>('42');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Spotlight & active device for inline graphs
  const { spotlightedIds, isSpotlighted, setSpotlight } = useSpotlight();
  const [activeDeviceId, setActiveDeviceId] = useState<string>('sim-device-001');
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const { isPaused, togglePause } = useLiveControl();
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Sync active device ID with spotlight if judge spotlights a device
  useEffect(() => {
    if (spotlightedIds.length > 0) {
      const latestSpotlight = spotlightedIds[spotlightedIds.length - 1];
      setActiveDeviceId(latestSpotlight);
    }
  }, [spotlightedIds]);

  const loadStatus = async () => {
    try {
      const data = await fetchSimulatorStatus();
      setStatus(data);
      setSeedInput(String(data.seed));
    } catch (error) {
      console.error('Failed to load simulator status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDeviceData = useCallback(async (devId: string) => {
    try {
      setMetricsLoading(true);
      const [dev, metricData] = await Promise.all([
        fetchDevice(devId).catch(() => null),
        fetchMetrics({ deviceId: devId, limit: 120 }).catch(() => []),
      ]);
      setActiveDevice(dev);
      setMetrics(metricData);
    } catch (err) {
      console.error(`Failed to load data for device ${devId}:`, err);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (activeDeviceId) {
      loadDeviceData(activeDeviceId);
    }
  }, [activeDeviceId, loadDeviceData]);

  // Socket.IO real-time telemetry streaming
  useEffect(() => {
    const socket = getSocket();

    const onSeedChanged = (data: { seed: string | number }) => {
      loadStatus();
    };

    const onMetricNew = (data: { deviceId: string; metric: Metric }) => {
      if (isPausedRef.current) return;
      if (data.deviceId === activeDeviceId) {
        setMetrics((prev) => [data.metric, ...prev].slice(0, 200));
      }
    };

    const onAnomalyNew = (data: { deviceId: string; anomaly: any }) => {
      if (isPausedRef.current) return;
      if (data.deviceId === activeDeviceId) {
        setActiveDevice((prev) =>
          prev ? { ...prev, lastAnomaly: true } : null
        );
      }
    };

    socket.on('simulator:seed_changed', onSeedChanged);
    socket.on('metric:new', onMetricNew);
    socket.on('anomaly:new', onAnomalyNew);

    return () => {
      socket.off('simulator:seed_changed', onSeedChanged);
      socket.off('metric:new', onMetricNew);
      socket.off('anomaly:new', onAnomalyNew);
    };
  }, [activeDeviceId]);

  const handleApplySeed = async (seedToApply: string) => {
    if (!seedToApply.trim()) return;

    try {
      setApplying(true);
      setFeedback(null);
      const res = await setSimulatorSeed(seedToApply.trim());
      setStatus(res);
      setSeedInput(String(res.seed));
      setFeedback({
        message: `Seed applied: '${res.seed}'. Fault sequences and device assignments re-randomized. The live graph below will visibly transition as the new sequence is injected.`,
        type: 'success',
      });
      if (activeDeviceId) {
        loadDeviceData(activeDeviceId);
      }
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Failed to apply seed',
        type: 'error',
      });
    } finally {
      setApplying(false);
    }
  };

  const handleRandomize = () => {
    const randomSeed = String(Math.floor(Math.random() * 900000) + 100000);
    setSeedInput(randomSeed);
    handleApplySeed(randomSeed);
  };

  const handleSelectDevice = (deviceId: string) => {
    setActiveDeviceId(deviceId);
    setSpotlight(deviceId, 'simulator-inspector');
  };

  const scheduledDeviceMap = new Map<string, SimulatorScheduledDevice>();
  (status?.devicesSchedule || []).forEach((d) => scheduledDeviceMap.set(d.deviceId, d));
  const activeScheduled = scheduledDeviceMap.get(activeDeviceId);

  const filteredDevices: SimulatorScheduledDevice[] = (status?.devicesSchedule || []).filter((dev) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'healthy') return !dev.failureMode;
    if (selectedFilter === 'faulty') return !!dev.failureMode;
    return dev.failureMode === selectedFilter;
  });

  const latestMetric = metrics.length > 0 ? metrics[0] : null;

  const getModeBadge = (mode: string | null) => {
    switch (mode) {
      case 'spike':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">Spike</span>;
      case 'drift':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">Drift</span>;
      case 'flatline':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-900 border border-slate-300">Flatline</span>;
      case 'oscillation':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-900 border border-cyan-300">Oscillation</span>;
      case 'sensor_swap':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">Sensor Swap</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">Healthy</span>;
    }
  };

  if (loading && !status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading Simulator Studio...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Simulator Studio & Live Graph Inspector</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 uppercase tracking-wider">
                PRNG Seed Control
              </span>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm mt-1">
              Observe real-time graph transitions and dynamic anomaly injections as you test different seeds
            </p>
          </div>
          <LiveStatus />
        </div>

        {/* Hero Seed Control Bar */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-white/10 pb-4">
            <div>
              <div className="text-[11px] uppercase font-semibold text-blue-300 tracking-wider">
                Active Mock Generator Seed
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-3xl font-mono font-bold text-amber-300">
                  {status?.seed ?? '42'}
                </span>
                <span className="text-xs font-mono bg-white/10 px-2.5 py-1 rounded text-blue-200 border border-white/15">
                  Hash: #{status?.seedHash || '00000000'}
                </span>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded font-medium">
                  50 Devices Streaming
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={togglePause}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                  isPaused
                    ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-300'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                }`}
              >
                {isPaused ? 'Resume Live Stream' : 'Pause Live Stream'}
              </button>
            </div>
          </div>

          {/* Seed Input Controls */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              placeholder="Enter any seed (e.g. 777, judge-alpha, seed-9)..."
              className="flex-1 px-3.5 py-2 rounded-lg bg-white/10 text-white placeholder-white/50 border border-white/20 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="button"
              onClick={() => handleApplySeed(seedInput)}
              disabled={applying}
              className="px-4 py-2 rounded-lg font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 transition shadow disabled:opacity-50 text-xs whitespace-nowrap"
            >
              {applying ? 'Applying...' : 'Apply Seed & Re-randomize'}
            </button>
            <button
              type="button"
              onClick={handleRandomize}
              disabled={applying}
              className="px-3.5 py-2 rounded-lg font-medium bg-white/15 hover:bg-white/25 text-white border border-white/20 transition text-xs whitespace-nowrap"
            >
              Randomize Seed
            </button>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-200 border border-rose-500/30'
              }`}
            >
              {feedback.message}
            </div>
          )}
        </div>

        {/* Spotlighted Device Live Telemetry Studio with Inline Graphs */}
        <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-sm p-6 space-y-5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-gray-100 pb-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-600 text-white tracking-wide uppercase">
                  Spotlighted Device Live Telemetry
                </span>
                <h2 className="text-xl font-bold text-gray-900">
                  {activeDevice?.name || activeScheduled?.name || activeDeviceId}
                </h2>
                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                  {activeDeviceId}
                </span>
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  Region: {activeScheduled?.region || activeDevice?.region || 'us-east'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-600">
                <span>Assignment under Seed <strong>{status?.seed}</strong>:</span>
                {getModeBadge(activeScheduled?.failureMode || null)}
                {activeScheduled?.failureMode && (
                  <span className="font-semibold text-gray-800">
                    Target Channel: {activeScheduled.targetChannel}
                  </span>
                )}
                <span>• Baselines: {activeScheduled?.baselineTemp}°C, {activeScheduled?.baselineVolt}V, {activeScheduled?.baselineVib}g, {activeScheduled?.baselineHum}%</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={togglePause}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  isPaused
                    ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300'
                }`}
              >
                {isPaused ? 'Resume Telemetry' : 'Pause Live Telemetry'}
              </button>

              <Link
                href={`/devices/${encodeURIComponent(activeDeviceId)}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
              >
                Open Full View ↗
              </Link>
            </div>
          </div>

          {/* Live Sensor Value Readouts */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-red-50/50 border border-red-200 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase text-red-700">Live Temperature</div>
              <div className="text-2xl font-mono font-bold text-red-900 mt-0.5">
                {latestMetric ? `${latestMetric.temperature_c.toFixed(2)} °C` : '--'}
              </div>
              <div className="text-[10px] text-red-600 mt-0.5">
                Baseline: {activeScheduled?.baselineTemp || 22}°C
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase text-emerald-700">Live Voltage</div>
              <div className="text-2xl font-mono font-bold text-emerald-900 mt-0.5">
                {latestMetric ? `${latestMetric.voltage_v.toFixed(3)} V` : '--'}
              </div>
              <div className="text-[10px] text-emerald-600 mt-0.5">
                Baseline: {activeScheduled?.baselineVolt || 5.0}V
              </div>
            </div>

            <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase text-amber-700">Live Vibration</div>
              <div className="text-2xl font-mono font-bold text-amber-900 mt-0.5">
                {latestMetric ? `${latestMetric.vibration_g.toFixed(4)} g` : '--'}
              </div>
              <div className="text-[10px] text-amber-600 mt-0.5">
                Baseline: {activeScheduled?.baselineVib || 0.015}g
              </div>
            </div>

            <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase text-blue-700">Live Humidity</div>
              <div className="text-2xl font-mono font-bold text-blue-900 mt-0.5">
                {latestMetric ? `${latestMetric.humidity_pct.toFixed(1)} %` : '--'}
              </div>
              <div className="text-[10px] text-blue-600 mt-0.5">
                Baseline: {activeScheduled?.baselineHum || 40}%
              </div>
            </div>
          </div>

          {/* Quick Jump to Active Fault Devices */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Quick Jump to Active Faults under Seed {status?.seed}:
            </span>
            {status?.breakdown.spike?.[0] && (
              <button
                type="button"
                onClick={() => handleSelectDevice(status.breakdown.spike[0])}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition"
              >
                Spike ({status.breakdown.spike[0]})
              </button>
            )}
            {status?.breakdown.drift?.[0] && (
              <button
                type="button"
                onClick={() => handleSelectDevice(status.breakdown.drift[0])}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 transition"
              >
                Drift ({status.breakdown.drift[0]})
              </button>
            )}
            {status?.breakdown.flatline?.[0] && (
              <button
                type="button"
                onClick={() => handleSelectDevice(status.breakdown.flatline[0])}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-900 border border-slate-400 transition"
              >
                Flatline ({status.breakdown.flatline[0]})
              </button>
            )}
            {status?.breakdown.oscillation?.[0] && (
              <button
                type="button"
                onClick={() => handleSelectDevice(status.breakdown.oscillation[0])}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-100 hover:bg-cyan-200 text-cyan-900 border border-cyan-300 transition"
              >
                Oscillation ({status.breakdown.oscillation[0]})
              </button>
            )}
            {status?.breakdown.sensor_swap?.[0] && (
              <button
                type="button"
                onClick={() => handleSelectDevice(status.breakdown.sensor_swap[0])}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 transition"
              >
                Sensor Swap ({status.breakdown.sensor_swap[0]})
              </button>
            )}
          </div>

          {/* Live Charts 4-Grid */}
          {metricsLoading && metrics.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-500">
              Loading real-time telemetry for {activeDeviceId}...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Temperature */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Temperature (°C)
                  </span>
                  {activeScheduled?.failureMode === 'spike' && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                      Target: Spike Injection
                    </span>
                  )}
                  {activeScheduled?.failureMode === 'drift' && (
                    <span className="text-[10px] font-bold bg-purple-100 text-purple-900 px-2 py-0.5 rounded border border-purple-300">
                      Target: Linear Drift
                    </span>
                  )}
                </div>
                <MetricChart
                  metrics={metrics}
                  metricKey="temperature_c"
                  label="Temperature"
                  unit="°C"
                  color="#ef4444"
                />
              </div>

              {/* Voltage */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Voltage (V)
                  </span>
                  {activeScheduled?.failureMode === 'sensor_swap' && (
                    <span className="text-[10px] font-bold bg-rose-100 text-rose-900 px-2 py-0.5 rounded border border-rose-300">
                      Target: Sensor Swap Jump
                    </span>
                  )}
                </div>
                <MetricChart
                  metrics={metrics}
                  metricKey="voltage_v"
                  label="Voltage"
                  unit="V"
                  color="#10b981"
                />
              </div>

              {/* Vibration */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Vibration (g)
                  </span>
                  {activeScheduled?.failureMode === 'flatline' && (
                    <span className="text-[10px] font-bold bg-slate-200 text-slate-900 px-2 py-0.5 rounded border border-slate-400">
                      Target: Flatline Freeze
                    </span>
                  )}
                </div>
                <MetricChart
                  metrics={metrics}
                  metricKey="vibration_g"
                  label="Vibration"
                  unit="g"
                  color="#f59e0b"
                />
              </div>

              {/* Humidity */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Humidity (%)
                  </span>
                  {activeScheduled?.failureMode === 'oscillation' && (
                    <span className="text-[10px] font-bold bg-cyan-100 text-cyan-900 px-2 py-0.5 rounded border border-cyan-300">
                      Target: Oscillation Wave
                    </span>
                  )}
                </div>
                <MetricChart
                  metrics={metrics}
                  metricKey="humidity_pct"
                  label="Humidity"
                  unit="%"
                  color="#3b82f6"
                />
              </div>
            </div>
          )}
        </div>

        {/* Fleet Matrix Filter Bar */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-bold uppercase text-gray-500 mr-1">Filter Fleet:</span>
          {[
            { id: 'all', label: `All (${status?.devicesSchedule.length || 50})` },
            { id: 'spike', label: `Spikes (${status?.breakdown.spike?.length || 0})` },
            { id: 'drift', label: `Drifts (${status?.breakdown.drift?.length || 0})` },
            { id: 'flatline', label: `Flatlines (${status?.breakdown.flatline?.length || 0})` },
            { id: 'oscillation', label: `Oscillations (${status?.breakdown.oscillation?.length || 0})` },
            { id: 'sensor_swap', label: `Sensor Swaps (${status?.breakdown.sensor_swap?.length || 0})` },
            { id: 'healthy', label: `Healthy (${status?.breakdown.healthy?.length || 0})` },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFilter(f.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                selectedFilter === f.id
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 50-Device Fleet Matrix Grid */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3">
          <div className="flex justify-between items-center border-b border-gray-100 pb-2">
            <h3 className="text-sm font-bold text-gray-900">
              Fleet Devices Matrix (Click any card to spotlight & inspect live graphs above)
            </h3>
            <span className="text-xs text-gray-500 font-mono">
              Showing {filteredDevices.length} devices
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {filteredDevices.map((dev) => {
              const isSelected = dev.deviceId === activeDeviceId;
              const isSpot = isSpotlighted(dev.deviceId);

              return (
                <div
                  key={dev.deviceId}
                  onClick={() => handleSelectDevice(dev.deviceId)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-400 shadow-xs'
                      : isSpot
                      ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300'
                      : 'bg-gray-50 hover:bg-white hover:border-gray-300 border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <div className="font-bold text-xs text-gray-900">{dev.name}</div>
                      <div className="text-[10px] font-mono text-gray-500">{dev.deviceId}</div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-200 text-gray-700 uppercase font-mono">
                      {dev.region}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    {getModeBadge(dev.failureMode)}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectDevice(dev.deviceId);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-200 border border-gray-300'
                      }`}
                    >
                      {isSelected ? 'Viewing' : 'Inspect'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
