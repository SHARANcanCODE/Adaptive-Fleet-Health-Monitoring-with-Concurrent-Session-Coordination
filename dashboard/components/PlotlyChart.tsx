'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Metric } from '@/lib/api';

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface PlotlyChartProps {
  data: Metric[];
  metricType: 'temperature_c' | 'vibration_g' | 'humidity_pct' | 'voltage_v';
  title: string;
  height?: number;
}

export default function PlotlyChart({
  data,
  metricType,
  title,
  height = 400,
}: PlotlyChartProps) {

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  // Downsample for initial render
  const maxPoints = 1000;
  const step = Math.max(1, Math.floor(data.length / maxPoints));
  const sampledData = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const x = sampledData.map((m) => new Date(m.ts));
  const y = sampledData.map((m) => m[metricType]);

  const plotData: any = [
    {
      x,
      y,
      type: 'scatter',
      mode: 'lines',
      name: title,
      line: {
        color: getColorForMetric(metricType),
        width: 2,
      },
    },
  ];

  const layout: any = {
    title: {
      text: title,
      font: { size: 16 },
    },
    xaxis: {
      title: 'Time',
      type: 'date',
    },
    yaxis: {
      title: getYAxisLabel(metricType),
    },
    margin: { l: 60, r: 30, t: 50, b: 50 },
    height,
    showlegend: false,
    hovermode: 'closest' as const,
  };

  const config: any = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['pan2d', 'lasso2d'],
  };

  return (
    <div className="w-full">
      {/* @ts-ignore - react-plotly.js types are complex */}
      <Plot
        data={plotData}
        layout={layout}
        config={config}
        style={{ width: '100%', height: `${height}px` }}
      />
    </div>
  );
}

function getColorForMetric(metricType: string): string {
  switch (metricType) {
    case 'temperature_c':
      return '#ef4444';
    case 'vibration_g':
      return '#3b82f6';
    case 'humidity_pct':
      return '#10b981';
    case 'voltage_v':
      return '#f59e0b';
    default:
      return '#6b7280';
  }
}

function getYAxisLabel(metricType: string): string {
  switch (metricType) {
    case 'temperature_c':
      return 'Temperature (°C)';
    case 'vibration_g':
      return 'Vibration (g)';
    case 'humidity_pct':
      return 'Humidity (%)';
    case 'voltage_v':
      return 'Voltage (V)';
    default:
      return 'Value';
  }
}

