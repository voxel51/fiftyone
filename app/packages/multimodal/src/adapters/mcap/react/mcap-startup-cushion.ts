import type { McapByteTimelinePoint } from "../types";

/**
 * Plan against a fraction of the measured throughput: the estimate is a
 * rolling busy-window average that drifts, and re-stalling right after a
 * gated start costs more goodwill than a slightly longer wait.
 */
const THROUGHPUT_PLANNING_DISCOUNT = 0.85;

/**
 * Ceiling on the cushion in content seconds. The per-topic tick caches
 * hold ~8s of decoded lookahead; a cushion must fit inside them with room
 * for in-flight batches, or coverage evicts its own head while filling.
 */
export const MAX_STARTUP_CUSHION_SECONDS = 6;

/**
 * Ceiling on the estimated wall-clock wait a gated start may ask for. On
 * links far below the content bitrate the full-smoothness cushion grows
 * unbounded — past this budget, start anyway and surface "limited"
 * honestly instead of holding the play press hostage.
 */
export const MAX_STARTUP_CUSHION_WAIT_SECONDS = 8;

const NANOSECONDS_PER_SECOND = 1_000_000_000;

export interface McapStartupCushionInputs {
  /**
   * Cumulative compressed-byte curve for the recording, ascending by time.
   * Absent (older sources, tests) → the minimum cushion.
   */
  readonly byteTimeline: readonly McapByteTimelinePoint[] | null;

  /**
   * Content-time horizon the gate protects, in timeline seconds (loop end
   * or recording end).
   */
  readonly horizonSec: number;

  /**
   * Floor, in content seconds — the static startup window used when the
   * link needs no cushion.
   */
  readonly minimumSeconds: number;

  /**
   * Playhead position in timeline seconds.
   */
  readonly playheadSec: number;

  /**
   * Timeline origin used to convert curve times to seconds.
   */
  readonly startTimeNs: bigint;

  /**
   * Measured link throughput; null while unmeasured (no cushion yet).
   */
  readonly throughputBytesPerSec: number | null;
}

export interface McapStartupCushion {
  /**
   * Content seconds of blocking-topic coverage to require before starting.
   */
  readonly cushionSeconds: number;

  /**
   * Estimated wall seconds to download the cushion cold. Zero when the
   * link keeps up.
   */
  readonly estimatedWaitSeconds: number;
}

/**
 * Sizes the buffer-then-play cushion for one play press: the smallest
 * pre-buffered window that lets the measured link sustain playback through
 * the horizon without draining dry, from the recording's real byte-time
 * curve. Links at or above the content bitrate get the floor; capped in
 * both content seconds (topic-cache capacity) and estimated wall wait.
 */
export function computeMcapStartupCushion(
  inputs: McapStartupCushionInputs,
): McapStartupCushion {
  const minimumSeconds = Math.max(0, inputs.minimumSeconds);
  const floor: McapStartupCushion = {
    cushionSeconds: minimumSeconds,
    estimatedWaitSeconds: 0,
  };

  const throughput =
    (inputs.throughputBytesPerSec ?? 0) * THROUGHPUT_PLANNING_DISCOUNT;
  const spanSeconds = inputs.horizonSec - inputs.playheadSec;
  const timeline = inputs.byteTimeline;
  if (
    !timeline ||
    timeline.length === 0 ||
    throughput <= 0 ||
    spanSeconds <= minimumSeconds
  ) {
    return floor;
  }

  // Buffer-level candidates at each chunk boundary past the playhead,
  // relative to the playhead: reaching content-time `sec` costs
  // `cumulativeBytes` beyond what playing up to the playhead consumed.
  let bytesAtPlayhead = 0;
  const candidates: {
    readonly cumulativeBytes: number;
    readonly sec: number;
  }[] = [];
  for (const point of timeline) {
    const pointSec =
      Number(point.endTimeNs - inputs.startTimeNs) / NANOSECONDS_PER_SECOND;
    if (pointSec <= inputs.playheadSec) {
      bytesAtPlayhead = point.cumulativeCompressedBytes;
      continue;
    }
    if (pointSec > inputs.horizonSec) break;
    candidates.push({
      cumulativeBytes: point.cumulativeCompressedBytes - bytesAtPlayhead,
      sec: pointSec - inputs.playheadSec,
    });
  }
  if (candidates.length === 0) {
    return floor;
  }

  // Worst arrears the link accrues anywhere in the horizon: bytes the
  // playhead needs by then minus bytes the link can deliver by then. The
  // cushion must pre-bank exactly this much.
  let worstDeficitBytes = 0;
  for (const candidate of candidates) {
    worstDeficitBytes = Math.max(
      worstDeficitBytes,
      candidate.cumulativeBytes - throughput * candidate.sec,
    );
  }
  if (worstDeficitBytes <= 0) {
    return floor;
  }

  const bytesForCushion = (cushionSec: number): number => {
    let bytes = 0;
    for (const candidate of candidates) {
      if (candidate.sec > cushionSec) break;
      bytes = candidate.cumulativeBytes;
    }
    return bytes;
  };

  const maxCushionSeconds = Math.min(MAX_STARTUP_CUSHION_SECONDS, spanSeconds);
  let cushionSeconds = maxCushionSeconds;
  for (const candidate of candidates) {
    if (candidate.cumulativeBytes >= worstDeficitBytes) {
      cushionSeconds = Math.min(cushionSeconds, candidate.sec);
      break;
    }
  }

  // Wall-wait budget: step the cushion down chunk boundaries until its
  // cold download fits the budget (terminates — candidates are finite and
  // each step strictly shrinks the cushion).
  while (
    cushionSeconds > minimumSeconds &&
    bytesForCushion(cushionSeconds) / throughput >
      MAX_STARTUP_CUSHION_WAIT_SECONDS
  ) {
    let below = minimumSeconds;
    for (const candidate of candidates) {
      if (candidate.sec >= cushionSeconds) break;
      below = Math.max(below, candidate.sec);
    }
    cushionSeconds = below;
  }

  cushionSeconds = Math.min(
    Math.max(cushionSeconds, minimumSeconds),
    maxCushionSeconds,
  );

  return {
    cushionSeconds,
    estimatedWaitSeconds: bytesForCushion(cushionSeconds) / throughput,
  };
}
