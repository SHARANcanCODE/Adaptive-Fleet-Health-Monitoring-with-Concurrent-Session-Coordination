/**
 * API Client for Backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

export interface Device {
  id: string;
  externalId?: string;
  fleetId?: string;
  region?: string | null;
  name: string;
  location: string | null;
  conflictWithId?: string | null;
  createdAt: string;
  lastAnomaly?: boolean;
  _count?: {
    metrics: number;
    anomalies: number;
  };
}

export interface Metric {
  id: string;
  deviceId: string;
  ts: string;
  temperature_c: number;
  vibration_g: number;
  humidity_pct: number;
  voltage_v: number;
  device?: {
    id: string;
    name: string;
    location: string | null;
  };
}

export interface Anomaly {
  id: string;
  deviceId: string;
  metricId: string | null;
  ts: string;
  score: number;
  type: string;
  metricChannel?: string | null;
  engine?: string;
  flagged: boolean;
  device?: {
    id: string;
    name: string;
    location: string | null;
  };
  metric?: {
    id: string;
    temperature_c: number;
    vibration_g: number;
    humidity_pct: number;
    voltage_v: number;
  };
}

export interface ConflictDeviceDetail {
  id: string;
  name: string;
  region: string;
  location?: string | null;
  anomaly?: {
    id?: string;
    type: string;
    score: number;
    metricChannel?: string | null;
    ts: string;
    metric?: {
      temperature_c?: number;
      voltage_v?: number;
      vibration_g?: number;
      humidity_pct?: number;
    } | null;
  } | null;
}

export interface Conflict {
  id: string;
  region: string;
  deviceIds: string[];
  status: 'open' | 'acknowledged' | 'resolved';
  createdAt: string;
  updatedAt: string;
  devices?: ConflictDeviceDetail[];
  correlationType?: string;
  dominantChannel?: string;
  matchedFailureMode?: string | null;
  anomalyCount?: number;
}

export interface FleetMergeEvent {
  id: string;
  fleetId: string;
  externalId: string;
  resolvedDeviceId: string;
  conflictingDeviceId: string;
  createdAt: string;
}

export async function fetchDevices(): Promise<Device[]> {
  const res = await fetch(`${API_BASE_URL}/api/devices`);
  if (!res.ok) throw new Error('Failed to fetch devices');
  const data = await res.json();
  return data.devices || [];
}

export async function fetchDevice(id: string): Promise<Device> {
  const res = await fetch(`${API_BASE_URL}/api/devices/${id}`);
  if (!res.ok) throw new Error('Failed to fetch device');
  return res.json();
}

export async function fetchMetrics(params: {
  deviceId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<Metric[]> {
  const queryParams = new URLSearchParams();
  if (params.deviceId) queryParams.set('deviceId', params.deviceId);
  if (params.from) queryParams.set('from', params.from);
  if (params.to) queryParams.set('to', params.to);
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const res = await fetch(`${API_BASE_URL}/api/metrics?${queryParams}`);
  if (!res.ok) throw new Error('Failed to fetch metrics');
  const data = await res.json();
  return data.metrics || [];
}

export async function fetchAnomalies(params: {
  deviceId?: string;
  from?: string;
  to?: string;
  type?: string;
  limit?: number;
}): Promise<Anomaly[]> {
  const queryParams = new URLSearchParams();
  if (params.deviceId) queryParams.set('deviceId', params.deviceId);
  if (params.from) queryParams.set('from', params.from);
  if (params.to) queryParams.set('to', params.to);
  if (params.type) queryParams.set('type', params.type);
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const res = await fetch(`${API_BASE_URL}/api/anomalies?${queryParams}`);
  if (!res.ok) throw new Error('Failed to fetch anomalies');
  const data = await res.json();
  return data.anomalies || [];
}

export async function fetchConflicts(params?: {
  status?: string;
  region?: string;
}): Promise<Conflict[]> {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.set('status', params.status);
  if (params?.region) queryParams.set('region', params.region);

  const res = await fetch(`${API_BASE_URL}/api/conflicts?${queryParams}`);
  if (!res.ok) throw new Error('Failed to fetch conflicts');
  const data = await res.json();
  return data.conflicts || [];
}

export async function acknowledgeConflict(id: string): Promise<Conflict> {
  const res = await fetch(`${API_BASE_URL}/api/conflicts/${id}/acknowledge`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to acknowledge conflict');
  const data = await res.json();
  return data.conflict;
}

export async function resolveConflict(id: string): Promise<Conflict> {
  const res = await fetch(`${API_BASE_URL}/api/conflicts/${id}/resolve`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to resolve conflict');
  const data = await res.json();
  return data.conflict;
}

export async function importFleet(payload: {
  fleetId: string;
  devices: Array<{
    externalId: string;
    name: string;
    region?: string;
    location?: string;
  }>;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/fleets/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to import fleet');
  return res.json();
}

export async function fetchMergeLog(): Promise<FleetMergeEvent[]> {
  const res = await fetch(`${API_BASE_URL}/api/fleets/merge-log`);
  if (!res.ok) throw new Error('Failed to fetch merge log');
  const data = await res.json();
  return data.events || [];
}

export interface SimulatorScheduledDevice {
  deviceId: string;
  name: string;
  region: string;
  regionName: string;
  failureMode: string | null;
  targetChannel: string;
  cycleOffset: number;
  baselineTemp: number;
  baselineVolt: number;
  baselineVib: number;
  baselineHum: number;
}

export interface SimulatorPreset {
  name: string;
  seed: string;
  description: string;
}

export interface SimulatorStatus {
  seed: string | number;
  seedHash: string;
  devicesSchedule: SimulatorScheduledDevice[];
  breakdown: Record<string, string[]>;
  healthyCount: number;
  faultyCount: number;
  activeDevicesCount: number;
  eventsPerMinute?: number;
  faultClasses: string[];
  presets: SimulatorPreset[];
  lastSeedUpdate: string;
}

export async function fetchSimulatorStatus(): Promise<SimulatorStatus> {
  const res = await fetch(`${API_BASE_URL}/api/simulator/status`);
  if (!res.ok) throw new Error('Failed to fetch simulator status');
  return res.json();
}

export async function setSimulatorSeed(seed: string | number): Promise<SimulatorStatus & { success: boolean; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/simulator/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed }),
  });
  if (!res.ok) throw new Error('Failed to set simulator seed');
  return res.json();
}

