/**
 * API Client for Backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://your-backend-url:8080';

export interface Device {
  id: string;
  name: string;
  location: string | null;
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

