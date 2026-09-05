'use client';

/**
 * Live Data Stream Control Provider & Hook
 * 
 * Provides global state to pause/resume live incoming sensor data and telemetry reloads.
 * This allows presenters and judges to freeze the live graphs and tables at any moment to explain anomalies.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface LiveControlContextType {
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
  togglePause: () => void;
}

const LiveControlContext = createContext<LiveControlContextType>({
  isPaused: false,
  setPaused: () => {},
  togglePause: () => {},
});

export function LiveControlProvider({ children }: { children: React.ReactNode }) {
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    setIsPaused(paused);
  }, []);

  return (
    <LiveControlContext.Provider
      value={{
        isPaused,
        setPaused,
        togglePause,
      }}
    >
      {children}
    </LiveControlContext.Provider>
  );
}

export function useLiveControl() {
  return useContext(LiveControlContext);
}
