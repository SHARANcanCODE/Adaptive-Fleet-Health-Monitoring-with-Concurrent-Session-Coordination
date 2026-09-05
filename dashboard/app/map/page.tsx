'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { fetchDevices, Device } from '@/lib/api';
import { useSpotlight } from '@/lib/spotlight';
import { useSocket } from '@/lib/socket';
import MapCard from '@/components/MapCard';
import LiveStatus from '@/components/LiveStatus';

export default function MapPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const { spotlightedIds, setSpotlight } = useSpotlight();
  const { socket } = useSocket();
  const mapSectionRef = useRef<HTMLDivElement>(null);

  const loadDevices = async () => {
    try {
      const data = await fetchDevices();
      setDevices(data);
    } catch (error) {
      console.error('Failed to load devices for map:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  // Update device status in real time on anomaly events
  useEffect(() => {
    if (!socket) return;

    const onAnomalyNew = (data: { deviceId: string; anomaly: any }) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === data.deviceId ? { ...d, lastAnomaly: true } : d))
      );
    };

    socket.on('anomaly:new', onAnomalyNew);
    return () => {
      socket.off('anomaly:new', onAnomalyNew);
    };
  }, [socket]);

  // Handle clicking on a device card in the list below
  const handleSelectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setSpotlight(deviceId, 'device-map-list');

    // Smooth scroll to map if user is scrolled down
    if (mapSectionRef.current) {
      const rect = mapSectionRef.current.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        mapSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const devicesWithLocation = devices.filter((d) => !!d.location);

  // Region breakdown counts
  const regionsList = [
    { id: 'all', label: 'All Global', count: devicesWithLocation.length },
    { id: 'us-east', label: 'US East', count: devicesWithLocation.filter((d) => d.region === 'us-east').length },
    { id: 'us-west', label: 'US West', count: devicesWithLocation.filter((d) => d.region === 'us-west').length },
    { id: 'eu-west', label: 'EU West', count: devicesWithLocation.filter((d) => d.region === 'eu-west').length },
    { id: 'ap-south', label: 'AP South', count: devicesWithLocation.filter((d) => d.region === 'ap-south').length },
    { id: 'ap-east', label: 'AP East', count: devicesWithLocation.filter((d) => d.region === 'ap-east').length },
  ];

  // Filtered devices list
  const filteredDevices = devicesWithLocation.filter((d) => {
    const matchesRegion = selectedRegion === 'all' || d.region === selectedRegion;
    const matchesSearch =
      searchQuery.trim() === '' ||
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.region && d.region.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesRegion && matchesSearch;
  });

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 font-medium text-lg flex items-center gap-3">
          <span className="w-4 h-4 rounded-full bg-blue-600 animate-ping"></span>
          Loading Global Fleet Map...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Global Fleet Map & Navigator</h1>
            <p className="text-gray-600 text-xs sm:text-sm mt-1">
              Geographical distribution across 5 regions. Click any device below to fly to its live location on the map.
            </p>
          </div>
          <LiveStatus />
        </div>

        {/* Interactive Map Section */}
        <div ref={mapSectionRef} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Active View:</span>
              {selectedDevice ? (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-600 text-white">
                    📍 {selectedDevice.name} ({selectedDevice.id})
                  </span>
                  <span className="text-xs text-gray-500 font-mono">{selectedDevice.location}</span>
                </div>
              ) : (
                <span className="text-xs text-gray-500">
                  Global Overview ({devicesWithLocation.length} Plotted Devices)
                </span>
              )}
            </div>

            {selectedDeviceId && (
              <button
                onClick={() => setSelectedDeviceId(null)}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
              >
                Clear Map Focus ✕
              </button>
            )}
          </div>

          <MapCard
            devices={devicesWithLocation}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={(id) => setSelectedDeviceId(id)}
          />
        </div>

        {/* Device Location Explorer Box */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Device Location Explorer ({filteredDevices.length} Devices)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Click on any device card below to immediately navigate and fly to its coordinates on the map above.
              </p>
            </div>

            {/* Search Input */}
            <div className="w-full md:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search device name, ID, or region..."
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Regional Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            {regionsList.map((reg) => (
              <button
                key={reg.id}
                onClick={() => setSelectedRegion(reg.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  selectedRegion === reg.id
                    ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                {reg.label} <span className="opacity-75 font-mono text-[11px]">({reg.count})</span>
              </button>
            ))}
          </div>

          {/* Device Cards Grid */}
          {filteredDevices.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500 bg-gray-50 rounded-xl border border-gray-200">
              No devices match your search or regional filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredDevices.map((device) => {
                const isSelected = selectedDeviceId === device.id;
                const isSpot = spotlightedIds.includes(device.id);

                return (
                  <div
                    key={device.id}
                    onClick={() => handleSelectDevice(device.id)}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all duration-150 flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-400 shadow-sm'
                        : isSpot
                        ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300'
                        : 'bg-gray-50/60 hover:bg-white hover:border-gray-300 border-gray-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <div>
                          <div className="font-bold text-sm text-gray-900">{device.name}</div>
                          <div className="text-xs font-mono text-gray-500">{device.id}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase font-mono">
                          {device.region || 'Region'}
                        </span>
                      </div>

                      <div className="text-xs text-gray-600 font-mono flex items-center gap-1 mt-2">
                        <span>📍</span>
                        <span className="truncate">{device.location}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-200/70 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            device.lastAnomaly ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                          }`}
                        ></span>
                        <span
                          className={`font-semibold text-[11px] ${
                            device.lastAnomaly ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {device.lastAnomaly ? 'Anomaly' : 'Normal'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectDevice(device.id);
                          }}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
                          }`}
                        >
                          {isSelected ? 'Focused' : 'Locate'}
                        </button>

                        <Link
                          href={`/devices/${encodeURIComponent(device.id)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded text-[11px] border border-gray-300 transition"
                          title="View device telemetry graphs"
                        >
                          Graphs ↗
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
