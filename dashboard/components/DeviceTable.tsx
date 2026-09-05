'use client';

import Link from 'next/link';
import { Device } from '@/lib/api';
import { useSpotlight } from '@/lib/spotlight';

interface DeviceTableProps {
  devices: Device[];
}

export default function DeviceTable({ devices }: DeviceTableProps) {
  const { isSpotlighted, setSpotlight, spotlightedIds } = useSpotlight();

  const handleSpotlightClick = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (isSpotlighted(id)) {
      setSpotlight(spotlightedIds.filter((devId) => devId !== id), 'device-table');
    } else {
      setSpotlight([...spotlightedIds, id], 'device-table');
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Device ID & Fleet
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Region
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Location
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Metrics
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Anomalies
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {devices.map((device) => {
            const active = isSpotlighted(device.id);

            return (
              <tr
                key={device.id}
                className={`transition-colors duration-200 ${
                  active
                    ? 'bg-amber-50/70 ring-2 ring-inset ring-amber-400 font-medium'
                    : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{device.id}</span>

                    {/* Fleet Badge */}
                    <span className="px-1.5 py-0.5 rounded text-[11px] font-sans font-medium bg-gray-100 text-gray-700 border border-gray-200">
                      {device.fleetId || 'fleet-a'}
                    </span>

                    {/* Duplicate ID Collision Badge */}
                    {device.conflictWithId && (
                      <Link
                        href={`/devices/${device.conflictWithId}`}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-sans font-semibold bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-200 transition"
                        title={`Cross-fleet collision with device ${device.conflictWithId}`}
                      >
                        <span>Merged Dupl</span>
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {device.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {device.region ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {device.region}
                    </span>
                  ) : (
                    <span className="text-gray-400 italic">None</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs">
                  {device.location || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {device._count?.metrics || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {(device._count?.anomalies || 0) > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                      {device._count?.anomalies}
                    </span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right space-x-3">
                  <button
                    onClick={(e) => handleSpotlightClick(device.id, e)}
                    className={`px-2.5 py-1 rounded text-xs transition ${
                      active
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                    }`}
                    title="Toggle spotlight across all open views"
                  >
                    {active ? '★ Spotlighted' : '☆ Spotlight'}
                  </button>
                  <Link
                    href={`/devices/${device.id}`}
                    className="text-blue-600 hover:text-blue-900 inline-block"
                  >
                    Details →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
