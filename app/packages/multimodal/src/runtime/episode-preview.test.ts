import { describe, expect, it } from "vitest";

import {
  EPISODE_PREVIEW_MAX_FPS,
  EpisodePreviewPlaybackScheduler,
  episodePreviewPlaybackDelayMs,
} from "./episode-preview";

const DROID_FRAME_INTERVAL_NS = 70_990_566n;
const DROID_LAST_FRAME_NS = 7_525_000_000n;

describe("EpisodePreviewPlaybackScheduler", () => {
  it("fairly caps deterministic 14.2fps input near 12fps at 1x source time", () => {
    const result = scheduleSourceFrames(
      sourceFrames(DROID_LAST_FRAME_NS, DROID_FRAME_INTERVAL_NS),
    );
    const finalWallTimeMs = result.wallTimesMs.at(-1);
    const finalSourceTimeNs = result.sourceTimesNs.at(-1);
    if (finalWallTimeMs === undefined || finalSourceTimeNs === undefined) {
      throw new Error("expected scheduled DROID frames");
    }
    const durationSeconds = finalWallTimeMs / 1_000;
    const presentedFps = (result.sourceTimesNs.length - 1) / durationSeconds;
    const sourceProgress =
      Number(finalSourceTimeNs) / 1_000_000 / finalWallTimeMs;

    expect(presentedFps).toBeGreaterThanOrEqual(10);
    expect(presentedFps).toBeLessThanOrEqual(EPISODE_PREVIEW_MAX_FPS + 0.01);
    expect(sourceProgress).toBeGreaterThanOrEqual(0.98);
    expect(sourceProgress).toBeLessThanOrEqual(1.02);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.skipped).toBeLessThan(result.sourceTimesNs.length);
  });

  it("presents every lower-rate frame at its recorded cadence", () => {
    const frames = sourceFrames(2_000_000_000n, 200_000_000n);
    const result = scheduleSourceFrames(frames);

    expect(result.skipped).toBe(0);
    expect(result.sourceTimesNs).toEqual(frames);
    expect(result.wallTimesMs).toEqual(
      frames.map((frameTimeNs) => Number(frameTimeNs) / 1_000_000),
    );
  });

  it("can flush the final source frame before a wrap", () => {
    const scheduler = new EpisodePreviewPlaybackScheduler();
    scheduler.reset(0n, 0);
    let wallTimeMs = 0;
    let lastDecision: number | null = null;
    for (let index = 1; index <= 7; index += 1) {
      const frameTimeNs = BigInt(index) * DROID_FRAME_INTERVAL_NS;
      lastDecision = scheduler.nextDelayMs(frameTimeNs, wallTimeMs);
      if (lastDecision !== null) {
        wallTimeMs += lastDecision;
        scheduler.markPresented(frameTimeNs, wallTimeMs);
      }
    }
    expect(lastDecision).toBeNull();

    const finalFrameTimeNs = 7n * DROID_FRAME_INTERVAL_NS;
    const flushDelayMs = scheduler.nextDelayMs(
      finalFrameTimeNs,
      wallTimeMs,
      true,
    );
    expect(flushDelayMs).not.toBeNull();
    wallTimeMs += flushDelayMs ?? 0;
    scheduler.markPresented(finalFrameTimeNs, wallTimeMs);
  });

  it("does not reject an isolated sub-cap source interval", () => {
    expect(episodePreviewPlaybackDelayMs(0n, 70_000_000n, 0)).toBeCloseTo(
      1_000 / EPISODE_PREVIEW_MAX_FPS,
    );
  });
});

function sourceFrames(lastFrameNs: bigint, intervalNs: bigint): bigint[] {
  const frames = [0n];
  for (
    let frameTimeNs = intervalNs;
    frameTimeNs < lastFrameNs;
    frameTimeNs += intervalNs
  ) {
    frames.push(frameTimeNs);
  }
  frames.push(lastFrameNs);
  return frames;
}

function scheduleSourceFrames(frames: readonly bigint[]) {
  const firstFrame = frames[0];
  if (firstFrame === undefined) throw new Error("expected source frames");
  const scheduler = new EpisodePreviewPlaybackScheduler();
  const sourceTimesNs = [firstFrame];
  const wallTimesMs = [0];
  let skipped = 0;
  let wallTimeMs = 0;
  scheduler.reset(firstFrame, wallTimeMs);

  for (const frameTimeNs of frames.slice(1)) {
    const delayMs = scheduler.nextDelayMs(frameTimeNs, wallTimeMs);
    if (delayMs === null) {
      skipped += 1;
      continue;
    }
    wallTimeMs += delayMs;
    scheduler.markPresented(frameTimeNs, wallTimeMs);
    sourceTimesNs.push(frameTimeNs);
    wallTimesMs.push(wallTimeMs);
  }

  return { skipped, sourceTimesNs, wallTimesMs };
}
