import type { McapLaneTransportSnapshot } from "../worker/transport-meter";

/**
 * Network-health verdict for the active MCAP source, shown in modal chrome
 * so buffering is attributed honestly: when playback pauses because the
 * link cannot keep up, the user should learn it is their network — not a
 * broken viewer.
 *
 * "Limited" means the playback engine has been buffering for a sustained
 * moment while the transport was busy moving bytes nearly the whole time.
 * A stall with an idle link is deliberately NOT network-limited (that is a
 * scheduling or decode gap and blaming the network would be a lie).
 */
export interface McapNetworkHealth {
  /**
   * True while buffering is attributable to constrained network throughput.
   */
  readonly limited: boolean;

  /**
   * Observed fetch throughput over the rolling window, or null before any
   * transport traffic lands.
   */
  readonly throughputBytesPerSec: number | null;

  /**
   * Main-thread timestamp of the last evaluation.
   */
  readonly updatedAtMs: number;
}

/**
 * Tuning for the health estimator. Enter/exit are asymmetric on purpose:
 * the pill should not flap with each lookahead batch boundary.
 */
export interface McapNetworkHealthEstimatorOptions {
  /**
   * Minimum link-busy fraction for buffering to count as network-limited.
   */
  readonly enterBusyFraction?: number;

  /**
   * Busy fraction under which an existing limited verdict clears even while
   * buffering continues (the link went idle, so it is not the bottleneck).
   */
  readonly exitBusyFraction?: number;

  /**
   * Continuous non-buffering time required to clear a limited verdict.
   */
  readonly exitCalmMs?: number;

  /**
   * Continuous buffering time required before a limited verdict can enter.
   */
  readonly minBufferingMs?: number;

  /**
   * Rolling window over which throughput and busy fraction are measured.
   */
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
 * Pure rolling-window estimator over per-lane cumulative transport
 * snapshots and playback buffering edges. Callers push signals with a
 * main-thread timestamp and read verdicts via `evaluate`.
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
      // Counters are cumulative per worker; a lower clock means the lane's
      // worker was replaced (source change), so this snapshot only
      // re-baselines the lane.
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

      // Lanes share one physical link, so the busiest lane bounds how busy
      // the link itself was from below.
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
        limited,
        throughputBytesPerSec,
        updatedAtMs: atMs,
      };
    },
  };
}

/**
 * Publish policy: the pill only shows while limited, so avoid re-render
 * churn from every worker response — write on verdict flips, and while
 * limited refresh the displayed throughput only on material change.
 */
export function shouldPublishMcapNetworkHealth(
  previous: McapNetworkHealth,
  next: McapNetworkHealth,
): boolean {
  if (previous.limited !== next.limited) {
    return true;
  }
  if (!next.limited) {
    return false;
  }
  const previousThroughput = previous.throughputBytesPerSec ?? 0;
  const nextThroughput = next.throughputBytesPerSec ?? 0;
  if (previousThroughput === 0) {
    return nextThroughput !== 0;
  }

  return (
    Math.abs(nextThroughput - previousThroughput) / previousThroughput > 0.15
  );
}
