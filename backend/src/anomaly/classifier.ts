/**
 * Adaptive Baseline Failure Classifier
 *
 * Classifies incoming metric points into one of five failure modes
 * (spike, drift, flatline, oscillation, sensor_swap) or "normal".
 *
 * Every threshold used here is computed FROM THE DEVICE'S OWN rolling
 * history (median + MAD per metric channel, per device). There is no
 * shared/global numeric threshold applied across devices - a device that
 * naturally runs noisier than another will simply have a larger MAD, and
 * all comparisons scale with it. This is what makes the baseline "genuinely
 * adaptive per device" rather than a hardcoded cutoff.
 */

import { AnomalyEngine, AnomalyResult, MetricPoint } from './engine';

type Channel = 'temperature_c' | 'vibration_g' | 'humidity_pct' | 'voltage_v';
type FailureType = 'spike' | 'drift' | 'flatline' | 'oscillation' | 'sensor_swap';

const CHANNELS: Channel[] = ['temperature_c', 'vibration_g', 'humidity_pct', 'voltage_v'];

// A device-specific noise floor per channel type, used only to avoid
// classifying a device that is naturally near-constant (e.g. voltage) as
// perpetually "flatline". This is a physical-unit floor, not a detection
// threshold - the actual detection thresholds are all relative to the
// device's own measured MAD.
const CHANNEL_NOISE_FLOOR: Record<Channel, number> = {
  temperature_c: 0.03,
  vibration_g: 0.003,
  humidity_pct: 0.03,
  voltage_v: 0.005,
};

const LONG_WINDOW_SIZE = 200;
const SHORT_WINDOW_SIZE = 8;
const MIN_LONG_WINDOW_FOR_DETECTION = 30;

const SPIKE_Z_THRESHOLD = 4.5;
const FLATLINE_MAD_RATIO = 0.15;
const OSCILLATION_CROSSING_RATIO = 0.7;
const OSCILLATION_AMPLITUDE_RATIO = 1.6;
const DRIFT_CORRELATION_THRESHOLD = 0.6;
const DRIFT_MAGNITUDE_MADS = 3;
const SWAP_JUMP_MADS = 6;
const SWAP_STABLE_MAD_RATIO = 0.6;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mad(values: number[], center: number): number {
  const deviations = values.map((v) => Math.abs(v - center));
  return median(deviations);
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function zeroCrossings(diffs: number[]): number {
  let crossings = 0;
  for (let i = 1; i < diffs.length; i++) {
    if ((diffs[i] > 0 && diffs[i - 1] < 0) || (diffs[i] < 0 && diffs[i - 1] > 0)) {
      crossings++;
    }
  }
  return crossings;
}

interface ChannelState {
  longWindow: number[];
  shortWindow: number[];
}

interface ChannelResult {
  isAnomaly: boolean;
  failureType?: FailureType;
  score: number;
}

class DeviceChannelTracker {
  private channels: Map<Channel, ChannelState> = new Map();

  private getState(channel: Channel): ChannelState {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, { longWindow: [], shortWindow: [] });
    }
    return this.channels.get(channel)!;
  }

  /**
   * Classify a single new value for one channel, then update the rolling
   * windows. Classification always happens against the PRIOR long window
   * (established baseline), never against a window contaminated by the
   * point currently being scored.
   */
  observe(channel: Channel, value: number): ChannelResult {
    const state = this.getState(channel);
    const floor = CHANNEL_NOISE_FLOOR[channel];

    // Push into short window first so it reflects "current behavior including this point"
    state.shortWindow.push(value);
    if (state.shortWindow.length > SHORT_WINDOW_SIZE) {
      state.shortWindow.shift();
    }

    const notEnoughHistory = state.longWindow.length < MIN_LONG_WINDOW_FOR_DETECTION;

    if (notEnoughHistory) {
      state.longWindow.push(value);
      return { isAnomaly: false, score: 0 };
    }

    const longMedian = median(state.longWindow);
    const longMad = Math.max(mad(state.longWindow, longMedian), floor);

    const shortMedian = median(state.shortWindow);
    const shortMad = mad(state.shortWindow, shortMedian);

    const result = this.classify(state, value, longMedian, longMad, shortMedian, shortMad, floor);

    // Only feed non-anomalous points into the long window, so the baseline
    // stays a robust "healthy" reference even while a sustained fault
    // (drift/flatline/oscillation/sensor_swap) is ongoing. It naturally
    // re-adapts once the device recovers and produces normal points again.
    if (!result.isAnomaly) {
      state.longWindow.push(value);
      if (state.longWindow.length > LONG_WINDOW_SIZE) {
        state.longWindow.shift();
      }
    }

    return result;
  }

  private classify(
    state: ChannelState,
    current: number,
    longMedian: number,
    longMad: number,
    shortMedian: number,
    shortMad: number,
    floor: number
  ): ChannelResult {
    // 1) Sensor swap: an abrupt jump to a new level that has already stabilized
    //    (low internal spread) rather than reverting - a discrete regime change.
    //    Checked before flatline because a swap that lands on a perfectly steady
    //    new value would otherwise also look like zero short-term variance.
    const jumpMagnitude = Math.abs(shortMedian - longMedian) / longMad;
    if (
      state.shortWindow.length >= SHORT_WINDOW_SIZE &&
      jumpMagnitude >= SWAP_JUMP_MADS &&
      shortMad <= longMad * SWAP_STABLE_MAD_RATIO * (jumpMagnitude / SWAP_JUMP_MADS)
    ) {
      return { isAnomaly: true, failureType: 'sensor_swap', score: jumpMagnitude };
    }

    // 2) Flatline: short-term variance collapsed relative to established baseline
    //    variance (which must be non-trivial above floor), WITHOUT having jumped to a new level.
    if (
      longMad > floor * 1.5 &&
      shortMad <= longMad * FLATLINE_MAD_RATIO &&
      state.shortWindow.length >= SHORT_WINDOW_SIZE
    ) {
      return { isAnomaly: true, failureType: 'flatline', score: longMad / Math.max(shortMad, floor / 10) };
    }

    // 3) Spike: current point is far from baseline, but the rest of the short
    //    window (excluding current) is still close to baseline - isolated, reverting.
    const zCurrent = Math.abs(current - longMedian) / longMad;
    const restOfShort = state.shortWindow.slice(0, -1);
    if (zCurrent >= SPIKE_Z_THRESHOLD && restOfShort.length >= 3) {
      const restMedian = median(restOfShort);
      const restDeviation = Math.abs(restMedian - longMedian) / longMad;
      if (restDeviation < SPIKE_Z_THRESHOLD / 2) {
        return { isAnomaly: true, failureType: 'spike', score: zCurrent };
      }
    }

    // 4) Oscillation: short window is flapping up/down rapidly with elevated amplitude,
    //    rather than smooth noise around the baseline.
    if (state.shortWindow.length >= SHORT_WINDOW_SIZE) {
      const diffs: number[] = [];
      for (let i = 1; i < state.shortWindow.length; i++) {
        diffs.push(state.shortWindow[i] - state.shortWindow[i - 1]);
      }
      const crossings = zeroCrossings(diffs);
      const maxPossibleCrossings = diffs.length - 1;
      const crossingRate = maxPossibleCrossings > 0 ? crossings / maxPossibleCrossings : 0;
      const amplitudeRatio = shortMad / longMad;
      if (crossingRate >= OSCILLATION_CROSSING_RATIO && amplitudeRatio >= OSCILLATION_AMPLITUDE_RATIO) {
        return { isAnomaly: true, failureType: 'oscillation', score: amplitudeRatio };
      }
    }

    // 5) Drift: short window has moved steadily away from the long baseline
    //    (consistent direction, not a single jump).
    if (state.shortWindow.length >= SHORT_WINDOW_SIZE) {
      const indices = state.shortWindow.map((_, i) => i);
      const correlation = pearsonCorrelation(indices, state.shortWindow);
      const magnitude = Math.abs(shortMedian - longMedian) / longMad;
      if (Math.abs(correlation) >= DRIFT_CORRELATION_THRESHOLD && magnitude >= DRIFT_MAGNITUDE_MADS) {
        return { isAnomaly: true, failureType: 'drift', score: magnitude };
      }
    }

    return { isAnomaly: false, score: zCurrent };
  }
}

export class AdaptiveBaselineClassifier implements AnomalyEngine {
  private devices: Map<string, DeviceChannelTracker> = new Map();

  getType(): string {
    return 'adaptive-baseline';
  }

  async scoreBatch(deviceId: string, points: MetricPoint[]): Promise<AnomalyResult[]> {
    if (!this.devices.has(deviceId)) {
      this.devices.set(deviceId, new DeviceChannelTracker());
    }
    const tracker = this.devices.get(deviceId)!;

    return points.map((point, idx) => {
      let best: (ChannelResult & { channel: Channel }) | null = null;

      for (const channel of CHANNELS) {
        const result = tracker.observe(channel, point[channel]);
        if (result.isAnomaly && (!best || result.score > best.score)) {
          best = { ...result, channel };
        } else if (!result.isAnomaly && !best) {
          // Keep the best "normal" score around in case nothing is anomalous
          best = { ...result, channel };
        }
      }

      if (best && best.isAnomaly) {
        return {
          pointIndex: idx,
          score: best.score,
          isAnomaly: true,
          failureType: best.failureType,
          metric: best.channel,
        };
      }

      return {
        pointIndex: idx,
        score: best?.score ?? 0,
        isAnomaly: false,
      };
    });
  }
}
