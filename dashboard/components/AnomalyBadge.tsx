'use client';

interface AnomalyBadgeProps {
  score: number;
  type: string;
  metricChannel?: string | null;
  flagged?: boolean;
}

export default function AnomalyBadge({
  score,
  type,
  metricChannel,
  flagged = true,
}: AnomalyBadgeProps) {
  if (!flagged) {
    return null;
  }

  const normalizedType = type?.toLowerCase() || 'unknown';

  let bgClass = 'bg-red-500/10 text-red-700 border-red-300';
  let dotClass = 'bg-red-500';
  let label = type;

  if (normalizedType.includes('spike')) {
    bgClass = 'bg-amber-500/15 text-amber-800 border-amber-300';
    dotClass = 'bg-amber-500';
    label = 'Spike';
  } else if (normalizedType.includes('drift')) {
    bgClass = 'bg-purple-500/15 text-purple-800 border-purple-300';
    dotClass = 'bg-purple-500';
    label = 'Drift';
  } else if (normalizedType.includes('flatline')) {
    bgClass = 'bg-slate-500/15 text-slate-800 border-slate-300';
    dotClass = 'bg-slate-500';
    label = 'Flatline';
  } else if (normalizedType.includes('oscillation')) {
    bgClass = 'bg-cyan-500/15 text-cyan-800 border-cyan-300';
    dotClass = 'bg-cyan-500';
    label = 'Oscillation';
  } else if (normalizedType.includes('sensor_swap') || normalizedType.includes('swap')) {
    bgClass = 'bg-rose-500/15 text-rose-800 border-rose-300';
    dotClass = 'bg-rose-500';
    label = 'Sensor Swap';
  }

  const formatChannel = (channel?: string | null) => {
    if (!channel) return null;
    switch (channel) {
      case 'temperature_c':
        return 'Temp';
      case 'vibration_g':
        return 'Vib';
      case 'humidity_pct':
        return 'Hum';
      case 'voltage_v':
        return 'Volt';
      default:
        return channel;
    }
  };

  const channelLabel = formatChannel(metricChannel);

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${bgClass} shadow-xs transition`}
      title={`Score: ${score?.toFixed(2) || 'N/A'}${channelLabel ? ` on ${metricChannel}` : ''}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`}></span>
      <span>{label}</span>
      {channelLabel && (
        <span className="opacity-75 font-mono text-[10px] bg-white/60 px-1 py-0.5 rounded">
          {channelLabel}
        </span>
      )}
      <span className="opacity-75 font-mono text-[10px]">
        {score ? `(${score.toFixed(1)})` : ''}
      </span>
    </div>
  );
}
