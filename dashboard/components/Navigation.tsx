'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSpotlight } from '@/lib/spotlight';
import { useLiveControl } from '@/lib/live-control';
import SeedControlModal from './SeedControlModal';

export default function Navigation() {
  const pathname = usePathname();
  const { spotlightedIds, clearSpotlight } = useSpotlight();
  const { isPaused, togglePause } = useLiveControl();
  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'Overview' },
    { href: '/devices', label: 'Devices' },
    { href: '/anomalies', label: 'Anomalies' },
    { href: '/conflicts', label: 'Conflicts' },
    { href: '/fleets', label: 'Fleets' },
    { href: '/map', label: 'Map' },
    { href: '/simulator', label: 'Simulator' },
  ];

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            {/* Left: Brand & Main Navigation Links */}
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 font-bold text-gray-900 text-base tracking-tight shrink-0">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                <span>Adaptive Fleet</span>
              </Link>

              <div className="flex items-center gap-1 overflow-x-auto py-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200/60'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right: Quick Operational Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Live Stream Pause / Resume Control */}
              <button
                onClick={togglePause}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  isPaused
                    ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-300'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
                title={isPaused ? 'Click to resume live sensor streaming' : 'Click to pause live sensor stream for explanation'}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-ping'}`}></span>
                <span className="hidden sm:inline">{isPaused ? 'Data Paused' : 'Live Streaming'}</span>
                <span className="sm:hidden">{isPaused ? 'Paused' : 'Live'}</span>
                <span className="opacity-60 text-[10px] hidden md:inline font-mono">
                  ({isPaused ? 'Resume' : 'Pause'})
                </span>
              </button>

              {/* Generator Seed Modal Trigger */}
              <button
                onClick={() => setIsSeedModalOpen(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 transition whitespace-nowrap"
                title="Configure Mock Generator Seed"
              >
                Seed
              </button>

              {/* Cross-view spotlight indicator */}
              {spotlightedIds.length > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 px-2.5 py-1 rounded-lg text-xs font-medium shadow-2xs animate-fadeIn">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>
                  <span>
                    Spotlight: <strong>{spotlightedIds.length}</strong>
                  </span>
                  <button
                    onClick={clearSpotlight}
                    className="ml-0.5 hover:bg-amber-200 text-amber-800 rounded px-1 text-[11px] transition"
                    title="Clear spotlight"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Generator Seed Modal */}
      <SeedControlModal
        isOpen={isSeedModalOpen}
        onClose={() => setIsSeedModalOpen(false)}
      />
    </>
  );
}
