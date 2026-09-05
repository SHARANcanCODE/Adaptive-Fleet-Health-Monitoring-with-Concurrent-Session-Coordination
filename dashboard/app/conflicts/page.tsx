'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { fetchConflicts, acknowledgeConflict, resolveConflict, Conflict, ConflictDeviceDetail } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useSpotlight } from '@/lib/spotlight';
import { useLiveControl } from '@/lib/live-control';
import LiveStatus from '@/components/LiveStatus';
import AnomalyBadge from '@/components/AnomalyBadge';
import { format } from 'date-fns';

export default function ConflictsPage() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { setSpotlight, spotlightedIds } = useSpotlight();
  const { isPaused } = useLiveControl();
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const loadConflicts = async () => {
    try {
      setLoading(true);
      const data = await fetchConflicts({
        status: statusFilter || undefined,
      });
      setConflicts(data);
    } catch (error) {
      console.error('Failed to load conflicts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConflicts();

    const socket = getSocket();

    const onConflictEvent = () => {
      if (isPausedRef.current) return;
      loadConflicts();
    };

    socket.on('conflict:new', onConflictEvent);
    socket.on('conflict:updated', onConflictEvent);

    return () => {
      socket.off('conflict:new', onConflictEvent);
      socket.off('conflict:updated', onConflictEvent);
    };
  }, [statusFilter]);

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeConflict(id);
      loadConflicts();
    } catch (error) {
      console.error('Failed to acknowledge conflict:', error);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await resolveConflict(id);
      loadConflicts();
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    }
  };

  const handleSpotlightConflict = (deviceIds: string[]) => {
    setSpotlight(deviceIds, 'conflicts-page');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
            Open Conflict
          </span>
        );
      case 'acknowledged':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            Acknowledged
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Resolved
          </span>
        );
      default:
        return <span className="text-gray-500">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
              Regional Conflict Coordination
            </h1>
            <p className="text-gray-600 text-xs sm:text-sm mt-1">
              Correlated anomaly detection and multi-device incident tracking across geographic regions
            </p>
          </div>
          <LiveStatus />
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider mr-2">
              Status Filter:
            </span>
            {['', 'open', 'acknowledged', 'resolved'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {st === '' ? 'All Statuses' : st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>

          <div className="text-xs text-gray-500 font-mono">
            Active Conflicts: <strong>{conflicts.length}</strong>
          </div>
        </div>

        {/* Conflicts List */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-12 text-center text-gray-500">
            Loading regional conflicts...
          </div>
        ) : conflicts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900">No Regional Conflicts Detected</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto mt-1">
              No overlapping anomaly events detected among multiple devices in the same region within the 60-second window.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {conflicts.map((conflict) => {
              const devIds: string[] = Array.isArray(conflict.deviceIds)
                ? (conflict.deviceIds as string[])
                : [];
              const isAllSpotlighted = devIds.length > 0 && devIds.every((id) => spotlightedIds.includes(id));
              const devicesDetails: ConflictDeviceDetail[] = conflict.devices || devIds.map((id) => ({
                id,
                name: id,
                region: conflict.region,
              }));

              const failureModes = devicesDetails.map((d) => d.anomaly?.type).filter(Boolean);
              const uniqueModes = Array.from(new Set(failureModes));
              const isSameAnomaly = uniqueModes.length === 1 && uniqueModes[0];

              return (
                <div
                  key={conflict.id}
                  className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm p-6 space-y-5 ${
                    conflict.status === 'open'
                      ? 'border-rose-300 ring-2 ring-rose-200/50'
                      : conflict.status === 'acknowledged'
                      ? 'border-amber-300 ring-1 ring-amber-200'
                      : 'border-gray-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-3 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-900 uppercase font-mono tracking-wide">
                          Region: {conflict.region}
                        </span>
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-100 text-purple-900 border border-purple-200">
                          {conflict.correlationType || 'Correlated Regional Anomaly'}
                        </span>
                        {getStatusBadge(conflict.status)}
                      </div>
                      <div className="text-xs text-gray-500 font-mono">
                        Incident ID: {conflict.id} • Window: 60s Sliding Window
                      </div>
                    </div>

                    <div className="text-right text-xs text-gray-400 font-mono">
                      Updated: {format(new Date(conflict.updatedAt), 'PP pp')}
                    </div>
                  </div>

                  {/* Correlation Insight Callout Banner */}
                  <div className={`p-3 rounded-xl text-xs flex items-center gap-2.5 ${
                    isSameAnomaly
                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
                      : 'bg-blue-50 text-blue-900 border border-blue-200'
                  }`}>
                    <span className="text-base">{isSameAnomaly ? '⚡' : '🔗'}</span>
                    <div>
                      {isSameAnomaly ? (
                        <span>
                          <strong>Identical Regional Anomaly Signature:</strong> All devices in this region conflict are experiencing matching <strong>{uniqueModes[0]?.toUpperCase()}</strong> anomalies concurrently.
                        </span>
                      ) : (
                        <span>
                          <strong>Synchronized Multi-Vector Incident:</strong> Multiple co-located devices in <strong>{conflict.region}</strong> triggered concurrent anomalies at matching failure intensity within the same sliding window.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Co-located Devices & Quantitative Anomaly Breakdown */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Co-located Conflict Devices & Failure Signatures ({devicesDetails.length}):
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {devicesDetails.map((dev) => {
                        const isSpot = spotlightedIds.includes(dev.id);
                        const anomaly = dev.anomaly;
                        const metric = anomaly?.metric;

                        return (
                          <div
                            key={dev.id}
                            className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 transition ${
                              isSpot
                                ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-300'
                                : 'bg-gray-50 hover:bg-white border-gray-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold text-sm text-gray-900">{dev.name}</div>
                                <div className="text-xs font-mono text-gray-500">{dev.id}</div>
                              </div>
                              {anomaly?.type ? (
                                <AnomalyBadge
                                  score={anomaly.score}
                                  type={anomaly.type}
                                  metricChannel={anomaly.metricChannel}
                                  flagged={true}
                                />
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-700">
                                  Flagged
                                </span>
                              )}
                            </div>

                            {/* Quantitative Measurement Values */}
                            <div className="bg-white/80 rounded-lg p-2 border border-gray-200/80 text-[11px] font-mono space-y-1">
                              <div className="flex justify-between text-gray-600">
                                <span>Channel / Score:</span>
                                <span className="font-bold text-rose-600">
                                  {anomaly?.metricChannel || 'Sensor'} • z: {anomaly?.score || 'Active'}
                                </span>
                              </div>
                              {metric && (
                                <div className="text-gray-500 flex justify-between">
                                  <span>Latest Value:</span>
                                  <span className="font-semibold text-gray-900">
                                    {metric.temperature_c ? `${metric.temperature_c}°C` : ''}
                                    {metric.voltage_v ? ` ${metric.voltage_v}V` : ''}
                                    {metric.humidity_pct ? ` ${metric.humidity_pct}%` : ''}
                                    {metric.vibration_g ? ` ${metric.vibration_g}g` : ''}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="pt-2 border-t border-gray-200/70 flex items-center justify-between gap-1 text-xs">
                              <button
                                onClick={() => setSpotlight(dev.id, 'conflicts-card')}
                                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                                  isSpot
                                    ? 'bg-amber-500 text-white font-bold'
                                    : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
                                }`}
                              >
                                {isSpot ? 'Spotlight Active' : 'Spotlight'}
                              </button>

                              <Link
                                href={`/devices/${encodeURIComponent(dev.id)}`}
                                className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded text-[11px] transition"
                              >
                                Inspect Graphs →
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <button
                      onClick={() => handleSpotlightConflict(devIds)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isAllSpotlighted
                          ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                          : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
                      }`}
                    >
                      {isAllSpotlighted ? 'Spotlight Active on All' : 'Spotlight All Incident Devices'}
                    </button>

                    <div className="flex items-center gap-2">
                      {conflict.status === 'open' && (
                        <button
                          onClick={() => handleAcknowledge(conflict.id)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 transition"
                        >
                          Acknowledge Incident
                        </button>
                      )}
                      {conflict.status !== 'resolved' && (
                        <button
                          onClick={() => handleResolve(conflict.id)}
                          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
