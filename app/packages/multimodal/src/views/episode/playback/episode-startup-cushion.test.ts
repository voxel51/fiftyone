import { describe, expect, it } from "vitest";
import type { ByteTimelinePoint } from "../../../ir";
import {
  computeEpisodeStartupCushion,
  MAX_STARTUP_CUSHION_SECONDS,
  MAX_STARTUP_CUSHION_WAIT_SECONDS,
} from "./episode-startup-cushion";

const SECOND_NS = 1_000_000_000n;
const MINIMUM_SECONDS = 0.5;

/**
 * Uniform curve: one chunk per second, `bytesPerSecond` each, over
 * `durationSec` seconds starting at t=0.
 */
function uniformByteTimeline(
  bytesPerSecond: number,
  durationSec: number,
): ByteTimelinePoint[] {
  const points: ByteTimelinePoint[] = [];
  for (let second = 1; second <= durationSec; second++) {
    points.push({
      cumulativeCompressedBytes: second * bytesPerSecond,
      endTimeNs: BigInt(second) * SECOND_NS,
      startOffsetBytes: BigInt((second - 1) * bytesPerSecond),
    });
  }
  return points;
}

function compute(
  overrides: Partial<Parameters<typeof computeEpisodeStartupCushion>[0]>,
) {
  return computeEpisodeStartupCushion({
    byteTimeline: uniformByteTimeline(27, 20),
    horizonSec: 20,
    minimumSeconds: MINIMUM_SECONDS,
    playheadSec: 0,
    startTimeNs: 0n,
    throughputBytesPerSec: null,
    ...overrides,
  });
}

describe("computeEpisodeStartupCushion", () => {
  it("returns the floor without a byte timeline", () => {
    expect(compute({ byteTimeline: null, throughputBytesPerSec: 100 })).toEqual(
      {
        cushionSeconds: MINIMUM_SECONDS,
        estimatedWaitSeconds: 0,
      },
    );
  });

  it("returns the floor while throughput is unmeasured", () => {
    expect(compute({ throughputBytesPerSec: null })).toEqual({
      cushionSeconds: MINIMUM_SECONDS,
      estimatedWaitSeconds: 0,
    });
  });

  it("returns the floor when the link outruns the content bitrate", () => {
    // 27 B/s content vs 100 B/s link: even discounted, no deficit.
    expect(compute({ throughputBytesPerSec: 100 })).toEqual({
      cushionSeconds: MINIMUM_SECONDS,
      estimatedWaitSeconds: 0,
    });
  });

  it("sizes the cushion to the deficit on a slower link", () => {
    // 27 B/s content, 25 B/s measured → 21.25 effective. Worst deficit
    // accrues at the horizon: 20s × (27 − 21.25) = 115 bytes ≈ 4.26s of
    // content; chunk granularity rounds up to the 5s boundary.
    const cushion = compute({ throughputBytesPerSec: 25 });
    expect(cushion.cushionSeconds).toBe(5);
    // 5 content-seconds = 135 bytes over the effective 21.25 B/s link.
    expect(cushion.estimatedWaitSeconds).toBeCloseTo(135 / 21.25, 5);
  });

  it("caps the cushion at the content ceiling", () => {
    // Long recording on an 80% link: the deficit wants an 8s cushion, but
    // the stream caches cannot hold that much decoded lookahead. The wait
    // for the capped cushion (6s × 100B / 80B/s = 7.5s) stays in budget.
    const cushion = compute({
      byteTimeline: uniformByteTimeline(100, 40),
      horizonSec: 40,
      throughputBytesPerSec: 80 / 0.85,
    });
    expect(cushion.cushionSeconds).toBe(MAX_STARTUP_CUSHION_SECONDS);
    expect(cushion.estimatedWaitSeconds).toBeLessThanOrEqual(
      MAX_STARTUP_CUSHION_WAIT_SECONDS,
    );
  });

  it("caps the estimated wait on badly underprovisioned links", () => {
    // 1000 B/s content vs 100 B/s effective: every chunk costs 10s of
    // wall time, so the wait budget forces the cushion to the floor.
    const cushion = compute({
      byteTimeline: uniformByteTimeline(1000, 20),
      throughputBytesPerSec: 100 / 0.85,
    });
    expect(cushion.cushionSeconds).toBe(MINIMUM_SECONDS);
    expect(cushion.estimatedWaitSeconds).toBeLessThanOrEqual(
      MAX_STARTUP_CUSHION_WAIT_SECONDS,
    );
  });

  it("only protects the window up to the horizon", () => {
    // Loop over the first 4s of a 20s file: within the loop the deficit
    // is 4 × (27 − 21.25) = 23 bytes, banked by the first chunk.
    const cushion = compute({ horizonSec: 4, throughputBytesPerSec: 25 });
    expect(cushion.cushionSeconds).toBe(1);
  });

  it("measures the deficit from the playhead, not the file start", () => {
    // Identical uniform curve → identical cushion when starting mid-file.
    const fromStart = compute({ throughputBytesPerSec: 25 });
    const midFile = compute({
      horizonSec: 20,
      playheadSec: 10,
      throughputBytesPerSec: 25,
    });
    // Half the remaining duration → half the deficit (2.13s → 3s boundary).
    expect(midFile.cushionSeconds).toBe(3);
    expect(midFile.cushionSeconds).toBeLessThan(fromStart.cushionSeconds);
  });

  it("handles front-loaded recordings with the worst-window deficit", () => {
    // 200 bytes in the first 2 seconds, then 10 B/s: the front burst is
    // the binding constraint even though the average bitrate is low.
    const byteTimeline: ByteTimelinePoint[] = [
      {
        cumulativeCompressedBytes: 100,
        endTimeNs: 1n * SECOND_NS,
        startOffsetBytes: 0n,
      },
      {
        cumulativeCompressedBytes: 200,
        endTimeNs: 2n * SECOND_NS,
        startOffsetBytes: 100n,
      },
      {
        cumulativeCompressedBytes: 210,
        endTimeNs: 3n * SECOND_NS,
        startOffsetBytes: 200n,
      },
      {
        cumulativeCompressedBytes: 220,
        endTimeNs: 4n * SECOND_NS,
        startOffsetBytes: 210n,
      },
    ];
    const cushion = compute({
      byteTimeline,
      horizonSec: 4,
      throughputBytesPerSec: 50 / 0.85,
    });
    // Deficit at t=2: 200 − 50×2 = 100 bytes → first boundary banking
    // ≥100 is t=1.
    expect(cushion.cushionSeconds).toBe(1);
    expect(cushion.estimatedWaitSeconds).toBeCloseTo(100 / 50, 5);
  });
});
