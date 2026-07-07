import type { McapLaneTransportSnapshot } from "../worker/transport-meter";

/**
 * Network-health verdict for the active MCAP source, shown in modal chrome so
 * buffering is attributed honestly.
 *
 * "Limited" means playback has been buffering for a sustained moment while
 * transport was busy moving bytes nearly the whole time. A stall with an idle
 * link is deliberately not network-limited; that points at scheduling or
 * decode instead.
 */
export interface McapNetworkHealth {
  readonly busyFraction: number;
  /**
   * Bytes per second while transport was actually moving bytes — window
   * bytes over transfer-busy time instead of wall time. Wall throughput
   * dilutes toward zero across idle spans (a press seconds after a fill
   * would plan from a figure far below the link); this figure is the one
   * safe to size a start gate from. Null while the window is empty.
   */
  readonly busyThroughputBytesPerSec: number | null;
  readonly limited: boolean;
  readonly throughputBytesPerSec: number | null;
  /**
   * Whether the window is trustworthy enough to plan a start gate
   * against: samples are fresh and hold enough evidence (real wire
   * bytes, or a clearly cache-served read pattern). A stale or thin
   * window measures idle time and bursts, not the link — planning
   * against it both under- and over-gates.
   */
  readonly throughputPlannable: boolean;
  readonly updatedAtMs: number;
}

export interface McapNetworkHealthEstimatorOptions {
  readonly enterBusyFraction?: number;
  readonly exitBusyFraction?: number;
  readonly exitCalmMs?: number;
  readonly minBufferingMs?: number;
  readonly windowMs?: number;
}

interface TransportDelta {
  readonly atMs: number;
  readonly busyMs: number;
  readonly bytes: number;
  readonly lane: McapLaneTransportSnapshot["lane"];
  readonly reads: number;
  readonly wallMs: number;
}

/**
 * A rolling window is plannable once its newest sample is at most this old.
 * Anything staler measures the idle gap since transfers stopped, not the
 * link.
 */
const PLANNABLE_SAMPLE_MAX_AGE_MS = 2_500;

/**
 * Minimum wire bytes in the window before its throughput is planning-grade.
 * One block-sized fill clears it in well under a second on any link that
 * could sustain playback at all.
 */
const PLANNABLE_MIN_WINDOW_BYTES = 4 * 1024 * 1024;

/**
 * Minimum transfer-busy time in the window before its busy-rate is
 * planning-grade. One short sequential burst (a startup fill through a
 * shaped or contended path) can read several times the sustainable
 * concurrent rate; sustained observation under load is what playback
 * will actually get.
 */
const PLANNABLE_MIN_WINDOW_BUSY_MS = 1_500;

/**
 * Reads completing with (almost) no wire bytes mean a cache is serving the
 * source; the link is not the constraint, so the floor plan is correct even
 * though wire throughput reads as ~zero.
 */
const PLANNABLE_CACHE_SERVED_MIN_READS = 8;
const PLANNABLE_CACHE_SERVED_MAX_BYTES = 256 * 1024;

/**
 * Pure rolling-window estimator over per-lane cumulative transport snapshots
 * and playback buffering edges.
 */
export function createMcapNetworkHealthEstimator(
  options: McapNetworkHealthEstimatorOptions = {},
): {
  onTransportSample(sample: McapLaneTransportSnapshot, atMs: number): void;
  setBuffering(buffering: boolean, atMs: number): void;
  evaluate(atMs: number): McapNetworkHealth;
} {
  const enterBusyFraction = options.enterBusyFraction ?? 0.5;
  const exitBusyFraction = options.exitBusyFraction ?? 0.25;
  const exitCalmMs = options.exitCalmMs ?? 2_500;
  const minBufferingMs = options.minBufferingMs ?? 1_250;
  const windowMs = options.windowMs ?? 8_000;

  const lastSnapshots = new Map<
    McapLaneTransportSnapshot["lane"],
    McapLaneTransportSnapshot["snapshot"]
  >();
  let deltas: TransportDelta[] = [];
  let bufferingSinceMs: number | null = null;
  let calmSinceMs: number | null = null;
  let limited = false;

  const prune = (atMs: number) => {
    deltas = deltas.filter((delta) => atMs - delta.atMs <= windowMs);
  };

  return {
    onTransportSample(sample, atMs) {
      const previous = lastSnapshots.get(sample.lane);
      lastSnapshots.set(sample.lane, sample.snapshot);
      if (!previous || sample.snapshot.capturedAtMs < previous.capturedAtMs) {
        return;
      }

      const wallMs = sample.snapshot.capturedAtMs - previous.capturedAtMs;
      if (wallMs <= 0) {
        return;
      }

      deltas.push({
        atMs,
        busyMs: Math.max(0, sample.snapshot.busyMs - previous.busyMs),
        bytes: Math.max(
          0,
          sample.snapshot.fetchedBytes - previous.fetchedBytes,
        ),
        lane: sample.lane,
        reads: Math.max(0, sample.snapshot.reads - previous.reads),
        wallMs,
      });
      prune(atMs);
    },

    setBuffering(buffering, atMs) {
      if (buffering) {
        bufferingSinceMs ??= atMs;
        calmSinceMs = null;
      } else if (bufferingSinceMs !== null) {
        bufferingSinceMs = null;
        calmSinceMs = atMs;
      }
    },

    evaluate(atMs) {
      prune(atMs);

      let totalBytes = 0;
      let totalBusyMs = 0;
      let totalReads = 0;
      let oldestAtMs = atMs;
      let newestSampleAtMs: number | null = null;
      const busyByLane = new Map<string, { busyMs: number; wallMs: number }>();
      for (const delta of deltas) {
        totalBytes += delta.bytes;
        totalBusyMs += delta.busyMs;
        totalReads += delta.reads;
        oldestAtMs = Math.min(oldestAtMs, delta.atMs);
        newestSampleAtMs = Math.max(newestSampleAtMs ?? delta.atMs, delta.atMs);
        const lane = busyByLane.get(delta.lane) ?? { busyMs: 0, wallMs: 0 };
        lane.busyMs += delta.busyMs;
        lane.wallMs += delta.wallMs;
        busyByLane.set(delta.lane, lane);
      }

      let busyFraction = 0;
      for (const lane of busyByLane.values()) {
        if (lane.wallMs > 0) {
          busyFraction = Math.max(
            busyFraction,
            Math.min(1, lane.busyMs / lane.wallMs),
          );
        }
      }

      const spanMs = Math.min(windowMs, Math.max(1_000, atMs - oldestAtMs));
      const throughputBytesPerSec =
        deltas.length > 0 ? (totalBytes / spanMs) * 1_000 : null;
      // Lanes transfer concurrently, so summing per-lane busy time can
      // exceed link-level busy wall time; the resulting underestimate is
      // the conservative direction for gate sizing. The floor keeps one
      // sub-millisecond burst from reading as an absurd rate.
      const busyThroughputBytesPerSec =
        deltas.length > 0
          ? (totalBytes / Math.max(totalBusyMs, 100)) * 1_000
          : null;

      const bufferingForMs =
        bufferingSinceMs === null ? 0 : atMs - bufferingSinceMs;
      const calmForMs = calmSinceMs === null ? 0 : atMs - calmSinceMs;

      if (
        bufferingForMs >= minBufferingMs &&
        busyFraction >= enterBusyFraction &&
        totalBytes > 0
      ) {
        limited = true;
      } else if (limited) {
        const linkWentIdle = busyFraction < exitBusyFraction;
        const stayedCalm =
          bufferingSinceMs === null &&
          calmSinceMs !== null &&
          calmForMs >= exitCalmMs;
        if (linkWentIdle || stayedCalm) {
          limited = false;
        }
      }

      const fresh =
        newestSampleAtMs !== null &&
        atMs - newestSampleAtMs <= PLANNABLE_SAMPLE_MAX_AGE_MS;
      const cacheServed =
        totalReads >= PLANNABLE_CACHE_SERVED_MIN_READS &&
        totalBytes <= PLANNABLE_CACHE_SERVED_MAX_BYTES;
      const throughputPlannable =
        fresh &&
        ((totalBytes >= PLANNABLE_MIN_WINDOW_BYTES &&
          totalBusyMs >= PLANNABLE_MIN_WINDOW_BUSY_MS) ||
          cacheServed);

      return {
        busyFraction,
        busyThroughputBytesPerSec,
        limited,
        throughputBytesPerSec,
        throughputPlannable,
        updatedAtMs: atMs,
      };
    },
  };
}

/**
 * Publish policy: avoid re-render churn from every worker response. Write on
 * verdict flips, and while limited refresh throughput only on material change.
 */
export function shouldPublishMcapNetworkHealth(
  previous: McapNetworkHealth,
  next: McapNetworkHealth,
): boolean {
  if (previous.limited !== next.limited) {
    return true;
  }

  // The start gate keys on measurement trust; a flip must reach the atom
  // even when the throughput figure itself hasn't moved materially.
  if (previous.throughputPlannable !== next.throughputPlannable) {
    return true;
  }

  if (
    (previous.throughputBytesPerSec === null) !==
    (next.throughputBytesPerSec === null)
  ) {
    return true;
  }

  if (
    previous.throughputBytesPerSec !== null &&
    next.throughputBytesPerSec !== null &&
    throughputChangedMaterially(
      previous.throughputBytesPerSec,
      next.throughputBytesPerSec,
    )
  ) {
    return true;
  }

  if (!next.limited) {
    return false;
  }

  return false;
}

function throughputChangedMaterially(previous: number, next: number): boolean {
  if (previous === 0) {
    return next !== 0;
  }

  return Math.abs(next - previous) / previous > 0.15;
}

export interface McapIdleWorkGateSignals {
  readonly buffering: boolean;
  readonly limited: boolean;
  readonly msSinceSeek: number | null;
  readonly playPending: boolean;
  readonly seekCooldownMs?: number;
}

const DEFAULT_SEEK_COOLDOWN_MS = 1_500;

export function shouldDeferMcapIdleWork(
  signals: McapIdleWorkGateSignals,
): boolean {
  if (!signals.limited) {
    return false;
  }
  if (signals.buffering || signals.playPending) {
    return true;
  }

  const seekCooldownMs = signals.seekCooldownMs ?? DEFAULT_SEEK_COOLDOWN_MS;
  return signals.msSinceSeek !== null && signals.msSinceSeek < seekCooldownMs;
}
