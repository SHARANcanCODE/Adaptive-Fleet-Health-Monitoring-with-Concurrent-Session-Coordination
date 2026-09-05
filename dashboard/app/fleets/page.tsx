'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { fetchMergeLog, importFleet, FleetMergeEvent } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useLiveControl } from '@/lib/live-control';
import LiveStatus from '@/components/LiveStatus';
import { format } from 'date-fns';

export default function FleetsPage() {
  const [mergeLogs, setMergeLogs] = useState<FleetMergeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [lastImportResult, setLastImportResult] = useState<any>(null);
  const { isPaused } = useLiveControl();
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const loadMergeLogs = async () => {
    try {
      setLoading(true);
      const logs = await fetchMergeLog();
      setMergeLogs(logs);
    } catch (error) {
      console.error('Failed to load merge logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMergeLogs();

    const socket = getSocket();

    const onFleetMerge = (data: { event: FleetMergeEvent }) => {
      if (isPausedRef.current) return;
      setMergeLogs((prev) => [data.event, ...prev]);
    };

    socket.on('fleet:merge', onFleetMerge);

    return () => {
      socket.off('fleet:merge', onFleetMerge);
    };
  }, []);

  const handleImportDemoFleetB = async () => {
    try {
      setImporting(true);
      setLastImportResult(null);

      // Demo Fleet B payload deliberately contains duplicate externalIds
      // (sim-device-001 through sim-device-005) from Fleet A to demonstrate live conflict resolution
      const demoFleetB = {
        fleetId: 'fleet-b',
        devices: [
          {
            externalId: 'sim-device-001',
            name: 'Sensor 001 (Fleet B)',
            region: 'eu-west',
            location: 'lat:51.5074,lng:-0.1278',
          },
          {
            externalId: 'sim-device-002',
            name: 'Sensor 002 (Fleet B)',
            region: 'eu-west',
            location: 'lat:48.8566,lng:2.3522',
          },
          {
            externalId: 'sim-device-003',
            name: 'Sensor 003 (Fleet B)',
            region: 'us-west',
            location: 'lat:34.0522,lng:-118.2437',
          },
          {
            externalId: 'sim-device-004',
            name: 'Sensor 004 (Fleet B)',
            region: 'us-east',
            location: 'lat:40.7128,lng:-74.0060',
          },
          {
            externalId: 'sim-device-005',
            name: 'Sensor 005 (Fleet B)',
            region: 'ap-south',
            location: 'lat:19.0760,lng:72.8777',
          },
          {
            externalId: 'sim-device-101',
            name: 'Sensor 101 (Fleet B Unique)',
            region: 'eu-west',
            location: 'lat:52.5200,lng:13.4050',
          },
        ],
      };

      const result = await importFleet(demoFleetB);
      setLastImportResult(result);
      loadMergeLogs();
    } catch (error) {
      console.error('Error importing demo fleet:', error);
      alert('Failed to import fleet: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm mb-1 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              Fleet Merge & Deduplication Audit
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Zero-data-loss duplicate ID resolution with synthesized namespaces and audit logging
            </p>
          </div>
          <LiveStatus />
        </div>

        {/* Demo Action Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl text-white p-6 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white border border-white/30">
              Live Fleet Integration Demo
            </div>
            <h3 className="text-xl font-bold">Merge Secondary Fleet (Fleet B) with Overlapping IDs</h3>
            <p className="text-blue-100 text-sm">
              Simulates ingesting an external fleet where device IDs collide with pre-existing Fleet A devices.
              The backend synthesizes a unique internal ID (e.g., <code className="bg-blue-900/50 px-1 py-0.5 rounded text-amber-200">sim-device-001~fleet-b</code>) while linking the collision and preserving 100% of telemetry history for both devices.
            </p>
          </div>

          <button
            onClick={handleImportDemoFleetB}
            disabled={importing}
            className="whitespace-nowrap px-6 py-3 rounded-lg font-bold bg-white text-blue-700 hover:bg-blue-50 shadow-sm transition transform active:scale-95 disabled:opacity-50"
          >
            {importing ? 'Merging Fleet B...' : 'Import Demo Fleet B (Colliding IDs)'}
          </button>
        </div>

        {/* Last Import Result Banner */}
        {lastImportResult && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-5 shadow-xs animate-fadeIn">
            <div className="flex items-center gap-2 text-emerald-900 font-bold mb-2">
              <span>Fleet Import Complete:</span>
              <span>{lastImportResult.totalProcessed} devices processed</span>
            </div>
            <div className="text-xs text-emerald-800 space-y-1 font-mono">
              <div>Collisions Detected & Resolved: <strong>{lastImportResult.collisionsCount}</strong></div>
              <div>Fleet ID: <strong>{lastImportResult.fleetId}</strong></div>
            </div>
          </div>
        )}

        {/* Merge Audit Log Table */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Live Merge Audit Log</h2>
              <p className="text-xs text-gray-500">
                Audited collision records tracking both original and synthesized device IDs
              </p>
            </div>
            <div className="text-xs text-gray-500">
              Total Resolutions: <strong>{mergeLogs.length}</strong>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading merge audit logs...</div>
          ) : mergeLogs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <p className="font-medium text-gray-700">No fleet merge collisions recorded yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Click &quot;Import Demo Fleet B&quot; above to trigger a live duplicate-ID collision resolution demo.
              </p>
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
                      Incoming Fleet
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      External ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Synthesized Unique ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Conflicting Target ID
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Telemetry Graphs
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {mergeLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        {format(new Date(log.createdAt), 'PP pp')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-medium text-gray-900">
                        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">
                          {log.fleetId}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono font-bold text-gray-900">
                        {log.externalId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-emerald-700 font-semibold bg-emerald-50/50">
                        {log.resolvedDeviceId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-rose-700 font-semibold bg-rose-50/50">
                        {log.conflictingDeviceId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-right space-x-2">
                        <Link
                          href={`/devices/${encodeURIComponent(log.resolvedDeviceId)}`}
                          className="text-blue-600 hover:text-blue-900 font-medium"
                          title="View telemetry graphs for resolved device"
                        >
                          View Resolved Graphs →
                        </Link>
                        <span className="text-gray-300">|</span>
                        <Link
                          href={`/devices/${encodeURIComponent(log.conflictingDeviceId)}`}
                          className="text-gray-600 hover:text-gray-900 font-medium"
                          title="View telemetry graphs for original device"
                        >
                          View Original Graphs →
                        </Link>
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
