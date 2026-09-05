'use client';

/**
 * Mock Generator Seed Control Modal for Judges
 * 
 * Allows judges to control the mock generator's seed at demo time.
 * The fault sequence is deterministically randomized from this seed, ensuring
 * teams know the fault classes in advance but never the exact sequence.
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchSimulatorStatus, setSimulatorSeed, SimulatorStatus } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface SeedControlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SeedControlModal({ isOpen, onClose }: SeedControlModalProps) {
  const [status, setStatus] = useState<SimulatorStatus | null>(null);
  const [seedInput, setSeedInput] = useState<string>('42');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadStatus = async () => {
    try {
      const data = await fetchSimulatorStatus();
      setStatus(data);
      setSeedInput(String(data.seed));
    } catch (e) {
      console.warn('Could not fetch simulator status:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      setFeedback(null);
    }

    const socket = getSocket();
    const onSeedChanged = (data: { seed: string | number }) => {
      setStatus((prev) => prev ? { ...prev, seed: data.seed, lastSeedUpdate: new Date().toISOString() } : null);
      setSeedInput(String(data.seed));
    };

    socket.on('simulator:seed_changed', onSeedChanged);
    return () => {
      socket.off('simulator:seed_changed', onSeedChanged);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seedInput.trim()) return;

    try {
      setLoading(true);
      setFeedback(null);
      const res = await setSimulatorSeed(seedInput.trim());
      setFeedback({ message: `Seed applied successfully: ${res.seed}`, type: 'success' });
      await loadStatus();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Failed to apply seed',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRandomize = () => {
    const randomSeed = Math.floor(Math.random() * 900000) + 100000;
    setSeedInput(String(randomSeed));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 to-blue-700 text-white p-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-white/20 uppercase tracking-wider mb-1">
                Judge Demo Control
              </div>
              <h2 className="text-xl font-bold">Mock Generator Seed Control</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white text-lg font-mono p-1 transition"
              title="Close"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-blue-100 mt-2">
            Control the generator seed at demo time. Fault classes are known in advance, but the exact sequence and timing are randomized by this seed.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleApply} className="p-6 space-y-5">
          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.message}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              RNG Seed (Number or String)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                placeholder="e.g. 42 or judge-demo-1"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleRandomize}
                className="px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg border border-gray-300 transition"
              >
                Randomize
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Active Seed: <span className="font-mono font-bold text-blue-700">{status?.seed ?? '42'}</span>
            </p>
          </div>


          {/* Fault Classes List */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Fault Classes in Sequence:
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {['Spike', 'Drift', 'Flatline', 'Oscillation', 'Sensor Swap'].map((fc) => (
                <span
                  key={fc}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-white text-gray-800 border border-gray-200 shadow-2xs"
                >
                  {fc}
                </span>
              ))}
            </div>
          </div>

          {/* Actions & Full Cockpit Link */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <Link
              href="/simulator"
              onClick={onClose}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
            >
              Open Full Simulator Cockpit →
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow transition disabled:opacity-50"
              >
                {loading ? 'Applying...' : 'Apply Seed'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
