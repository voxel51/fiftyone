import {
  getIsPlayPending,
  getIsPlaying,
  getLoopEnd,
  getLoopStart,
  getPlayhead,
  type PlaybackStore,
} from "@fiftyone/playback";

import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceReadProfile,
  type ByteTimelinePoint,
} from "../../../ir";
import { type EpisodeStreamCache, type TimelineIndex } from "../../../runtime";
import { getNetworkHealth } from "./network-health";
import {
  bufferWindowCoverage,
  contiguousBufferedSecondsFromPlayhead,
  type DerivedPlaybackPolicy,
} from "./playback-buffering";
import { setStartupCushionState } from "./startup-cushion-state";

/**
 * Plan against a fraction of the measured throughput: the estimate is a
 * rolling busy-window average that drifts, and re-stalling right after a
 * gated start costs more goodwill than a slightly longer wait.
 */
const THROUGHPUT_PLANNING_DISCOUNT = 0.85;

/**
 * Ceiling on the cushion in content seconds. Forward prefetch remains
 * deliberately time-bounded even though decoded history may now grow into the
 * residual memory budget; a longer startup hold would monopolize foreground
 * decoding and delay the first visible frame.
 */
export const MAX_STARTUP_CUSHION_SECONDS = 6;

/**
 * Ceiling on the estimated wall-clock wait a gated start may ask for. On
 * links far below the content bitrate the full-smoothness cushion grows
 * unbounded — past this budget, start anyway and surface "limited"
 * honestly instead of holding the play press hostage.
 */
export const MAX_STARTUP_CUSHION_WAIT_SECONDS = 8;

/**
 * Nominal wall estimate shown while a remote press is held on an
 * unmeasured link. The pending prefetch the hold triggers produces real
 * samples within a fetch round-trip, after which the plan (and the chip
 * copy) re-resolve from measured throughput.
 */
export const UNMEASURED_LINK_NOMINAL_WAIT_SECONDS = 3;

const NANOSECONDS_PER_SECOND = 1_000_000_000;
const PROVISIONAL_REMOTE_START_COVERAGE_SECONDS = 1.5;

interface RemoteStartupGateDecision {
  readonly coverageSeconds: number;
  readonly mode: "held" | "provisional";
  readonly playheadSec: number;
  readonly sourceEpoch: number;
}

/** Timeline, cache, and throughput inputs used to size the startup gate. */
export interface StartupCushionInputs {
  /**
   * Cumulative compressed-byte curve for the recording, ascending by time.
   * Absent (older sources, tests) → the minimum cushion.
   */
  readonly byteTimeline: readonly ByteTimelinePoint[] | null;

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

/** Content coverage and estimated wall wait required before playback starts. */
export interface StartupCushion {
  /**
   * Content seconds of blocking-stream coverage to require before starting.
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
 * both content seconds (stream-cache capacity) and estimated wall wait.
 */
export function computeStartupCushion(
  inputs: StartupCushionInputs,
): StartupCushion {
  const minimumSeconds = Math.max(0, inputs.minimumSeconds);
  const floor: StartupCushion = {
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

/**
 * Stateful bandwidth planner for one mounted data stream. It owns the
 * pessimistic press-time throughput envelope and the one-shot remote-start
 * decision so React lifecycle code cannot accidentally release a held press.
 */
export class StartupCushionPlanner {
  private pendingPlanThroughputFloor: number | null = null;
  private remoteDecision: RemoteStartupGateDecision | null = null;

  /** Ends the current press plan after play commits, cancels, or seeks. */
  resetPendingPlan(): void {
    this.pendingPlanThroughputFloor = null;
    this.remoteDecision = null;
  }

  /** Resolves the required blocking-stream runway from current source state. */
  resolve({
    activeBlockingStreams,
    byteTimeline,
    caches,
    index,
    policy,
    sourceEpoch,
    sourceReadProfile,
    store,
  }: {
    readonly activeBlockingStreams: readonly string[];
    readonly byteTimeline: readonly ByteTimelinePoint[] | null;
    readonly caches: Map<string, EpisodeStreamCache>;
    readonly index: TimelineIndex | null;
    readonly policy: DerivedPlaybackPolicy;
    readonly sourceEpoch: number;
    readonly sourceReadProfile: ByteSourceReadProfile | undefined;
    readonly store: PlaybackStore;
  }): StartupCushion {
    if (!index) {
      return {
        cushionSeconds: policy.startupLookaheadSeconds,
        estimatedWaitSeconds: 0,
      };
    }

    const loopStartSec = getLoopStart(store);
    const loopEndSec = getLoopEnd(store);
    const horizonSec =
      loopEndSec > loopStartSec
        ? Math.min(index.durationSec, loopEndSec)
        : index.durationSec;
    const playheadSec = getPlayhead(store);
    const health = getNetworkHealth(store);
    const spanSeconds = horizonSec - playheadSec;

    if (
      sourceReadProfile === BYTE_SOURCE_READ_PROFILE.REMOTE &&
      !health.throughputPlannable &&
      byteTimeline !== null &&
      byteTimeline.length > 0 &&
      spanSeconds > policy.startupLookaheadSeconds
    ) {
      if (this.remoteDecision?.sourceEpoch !== sourceEpoch) {
        this.remoteDecision = null;
      }
      if (this.remoteDecision === null) {
        const coverageSeconds = contiguousBufferedSecondsFromPlayhead({
          activeStreams: activeBlockingStreams,
          caches,
          index,
          maxSeconds: PROVISIONAL_REMOTE_START_COVERAGE_SECONDS,
          timeSec: playheadSec,
        });
        this.remoteDecision = {
          coverageSeconds,
          mode:
            coverageSeconds >= PROVISIONAL_REMOTE_START_COVERAGE_SECONDS
              ? "provisional"
              : "held",
          playheadSec,
          sourceEpoch,
        };
      }
      if (this.remoteDecision.mode === "provisional") {
        return {
          cushionSeconds: policy.startupLookaheadSeconds,
          estimatedWaitSeconds: 0,
        };
      }
      return {
        cushionSeconds: Math.min(MAX_STARTUP_CUSHION_SECONDS, spanSeconds),
        estimatedWaitSeconds: UNMEASURED_LINK_NOMINAL_WAIT_SECONDS,
      };
    }

    let planThroughput =
      health.busyThroughputBytesPerSec ?? health.throughputBytesPerSec;
    if (planThroughput !== null && !getIsPlaying(store)) {
      planThroughput = Math.min(
        this.pendingPlanThroughputFloor ?? planThroughput,
        planThroughput,
      );
      this.pendingPlanThroughputFloor = planThroughput;
    }

    return computeStartupCushion({
      byteTimeline,
      horizonSec,
      minimumSeconds: policy.startupLookaheadSeconds,
      playheadSec,
      startTimeNs: index.startTimeNs,
      throughputBytesPerSec: planThroughput,
    });
  }
}

/** Publishes progress for a play press held behind a bandwidth cushion. */
export function publishStartupCushionProgress({
  activeBlockingStreams,
  caches,
  index,
  playheadSec,
  policy,
  resolveStartupCushion,
  store,
  tick,
}: {
  readonly activeBlockingStreams: readonly string[];
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly index: TimelineIndex | null;
  readonly playheadSec: number;
  readonly policy: DerivedPlaybackPolicy;
  readonly resolveStartupCushion: () => StartupCushion;
  readonly store: PlaybackStore;
  readonly tick: bigint | null;
}): void {
  if (
    !getIsPlayPending(store) ||
    index === null ||
    tick === null ||
    activeBlockingStreams.length === 0
  ) {
    setStartupCushionState(store, null);
    return;
  }

  const cushion = resolveStartupCushion();
  if (
    cushion.cushionSeconds <= policy.startupLookaheadSeconds ||
    cushion.estimatedWaitSeconds <= 0
  ) {
    setStartupCushionState(store, null);
    return;
  }

  const coverage = bufferWindowCoverage({
    activeStreams: activeBlockingStreams,
    caches,
    index,
    lookaheadSeconds: cushion.cushionSeconds,
    maxTicks: Math.max(
      policy.startupMinTicks,
      Math.ceil(index.tickRateHz * cushion.cushionSeconds),
    ),
    timeSec: playheadSec,
  });
  const missingFraction = coverage?.total
    ? (coverage.total - coverage.covered) / coverage.total
    : 1;
  setStartupCushionState(store, {
    estimatedWaitSeconds: cushion.estimatedWaitSeconds * missingFraction,
    progressFraction: 1 - missingFraction,
    targetSeconds: cushion.cushionSeconds,
  });
}
