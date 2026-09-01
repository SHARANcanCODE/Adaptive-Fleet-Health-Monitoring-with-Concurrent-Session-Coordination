'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Metric } from '@/lib/api';
import { format } from 'date-fns';

interface MetricChartProps {
  metrics: Metric[];
  metricKey: 'temperature_c' | 'vibration_g' | 'humidity_pct' | 'voltage_v';
  label: string;
  unit: string;
  color?: string;
}

// Downsample data to keep chart performant
function downsample(data: Metric[], maxPoints: number = 200): Metric[] {
  if (data.length <= maxPoints) return data;

  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, idx) => idx % step === 0);
}

export default function MetricChart({
  metrics,
  metricKey,
  label,
  unit,
  color = '#8884d8',
}: MetricChartProps) {
  const chartData = useMemo(() => {
    const downsampled = downsample([...metrics].reverse());
    return downsampled.map((m) => ({
      time: format(new Date(m.ts), 'HH:mm:ss'),
      timestamp: new Date(m.ts).getTime(),
      value: m[metricKey],
    }));
  }, [metrics, metricKey]);

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <YAxis
            label={{ value: `${label} (${unit})`, angle: -90, position: 'insideLeft' }}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            labelFormatter={(value) => {
              const item = chartData.find((d) => d.time === value);
              return item ? format(new Date(item.timestamp), 'PPpp') : value;
            }}
            formatter={(value: number) => [`${value.toFixed(2)} ${unit}`, label]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            name={label}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

