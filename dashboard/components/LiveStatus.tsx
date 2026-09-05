'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { useLiveControl } from '@/lib/live-control';

export default function LiveStatus() {
  const [connected, setConnected] = useState(false);
  const { isPaused, togglePause } = useLiveControl();

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Check initial connection state
    setConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      {/* Live / Paused Badge */}
      <button
        onClick={togglePause}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
          isPaused
            ? 'bg-amber-100 text-amber-900 border-amber-300'
            : connected
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}
        title={isPaused ? 'Click to resume live stream' : 'Click to pause live stream'}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isPaused
              ? 'bg-amber-500'
              : connected
              ? 'bg-emerald-500 animate-pulse'
              : 'bg-rose-500'
          }`}
        />
        <span>
          {isPaused ? 'Stream Paused' : connected ? 'Live Push' : 'Disconnected'}
        </span>
      </button>
    </div>
  );
}


