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
  readonly limited: boolean;
  readonly throughputBytesPerSec: number | null;
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
  readonly wallMs: number;
}

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
      let oldestAtMs = atMs;
      const busyByLane = new Map<string, { busyMs: number; wallMs: number }>();
      for (const delta of deltas) {
        totalBytes += delta.bytes;
        oldestAtMs = Math.min(oldestAtMs, delta.atMs);
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

      return {
        busyFraction,
        limited,
        throughputBytesPerSec,
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
