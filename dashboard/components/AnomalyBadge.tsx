'use client';

interface AnomalyBadgeProps {
  score: number;
  type: string;
  flagged: boolean;
}

export default function AnomalyBadge({ score, type, flagged }: AnomalyBadgeProps) {
  const getSeverityColor = (score: number) => {
    if (score > 5) return 'bg-red-500';
    if (score > 3) return 'bg-orange-500';
    return 'bg-yellow-500';
  };

  if (!flagged) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-semibold text-white bg-red-500">
      <span>Anomaly</span>
      <span className="opacity-75">({type})</span>
      <span className="opacity-75">Score: {score.toFixed(2)}</span>
    </div>
  );
}

