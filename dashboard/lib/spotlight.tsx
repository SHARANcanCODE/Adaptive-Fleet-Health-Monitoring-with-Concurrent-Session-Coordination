'use client';

/**
 * Cross-View Real-Time Spotlight Coordination Hook & Provider
 * 
 * Synchronizes spotlight selections (device IDs) across all open browser views/tabs in real time via Socket.IO.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSocket } from './socket';

interface SpotlightContextType {
  spotlightedIds: string[];
  setSpotlight: (ids: string[] | string, sourceView?: string) => void;
  clearSpotlight: () => void;
  isSpotlighted: (id: string) => boolean;
}

const SpotlightContext = createContext<SpotlightContextType>({
  spotlightedIds: [],
  setSpotlight: () => {},
  clearSpotlight: () => {},
  isSpotlighted: () => false,
});

export function SpotlightProvider({ children }: { children: React.ReactNode }) {
  const [spotlightedIds, setSpotlightedIds] = useState<string[]>([]);

  useEffect(() => {
    const socket = getSocket();

    const handleSpotlightUpdate = (data: { deviceIds: string[]; sourceView?: string }) => {
      setSpotlightedIds(data.deviceIds || []);
    };

    socket.on('spotlight:update', handleSpotlightUpdate);

    return () => {
      socket.off('spotlight:update', handleSpotlightUpdate);
    };
  }, []);

  const setSpotlight = useCallback((ids: string[] | string, sourceView?: string) => {
    const idList = Array.isArray(ids) ? ids : [ids];
    setSpotlightedIds(idList);

    const socket = getSocket();
    socket.emit('spotlight:set', {
      deviceIds: idList,
      sourceView,
    });
  }, []);

  const clearSpotlight = useCallback(() => {
    setSpotlightedIds([]);
    const socket = getSocket();
    socket.emit('spotlight:set', {
      deviceIds: [],
    });
  }, []);

  const isSpotlighted = useCallback(
    (id: string) => {
      return spotlightedIds.includes(id);
    },
    [spotlightedIds]
  );

  return (
    <SpotlightContext.Provider
      value={{
        spotlightedIds,
        setSpotlight,
        clearSpotlight,
        isSpotlighted,
      }}
    >
      {children}
    </SpotlightContext.Provider>
  );
}

export function useSpotlight() {
  return useContext(SpotlightContext);
}
