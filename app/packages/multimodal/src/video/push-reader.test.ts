import { afterEach, describe, expect, it, vi } from "vitest";

import type { EncodedH264VideoVisualization } from "../ir";
import { VISUALIZATION_KIND } from "../ir";
import { PushVideoAccessUnitReader } from "./push-reader";
import type { H264AccessUnit } from "./types";
import { VideoIntentCancelledError } from "./types";

const budget = {
  maxWallTimeMs: Number.POSITIVE_INFINITY,
  maxMessages: 100,
  maxObservedPayloadBytes: 1_024,
};

describe("PushVideoAccessUnitReader", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a complete retained keyframe-to-target span", async () => {
    const reader = new PushVideoAccessUnitReader();
    reader.push("camera", unit(0, true));
    reader.push("camera", unit(2));
    reader.push("camera", unit(1));

    await expect(
      reader.read({
        budget,
        endTimeNs: 2n,
        signal: new AbortController().signal,
        startTimeNs: 0n,
        stream: "camera",
      }),
    ).resolves.toMatchObject({
      complete: true,
      units: [unit(0, true), unit(1), unit(2)],
    });
  });

  it("marks reads across an evicted boundary incomplete", async () => {
    const reader = new PushVideoAccessUnitReader(2, 1_024);
    reader.push("camera", unit(0, true));
    reader.push("camera", unit(1));
    reader.push("camera", unit(2));

    expect(reader.timelineStartTimeNs).toBe(1n);
    await expect(
      reader.read({
        budget,
        endTimeNs: 2n,
        signal: new AbortController().signal,
        startTimeNs: 0n,
        stream: "camera",
      }),
    ).resolves.toMatchObject({
      complete: false,
      stopReason: "push-history",
      units: [unit(1), unit(2)],
    });
  });

  it("honors cancellation without returning buffered data", async () => {
    const reader = new PushVideoAccessUnitReader();
    reader.push("camera", unit(0, true));
    const controller = new AbortController();
    controller.abort();

    await expect(
      reader.read({
        budget,
        endTimeNs: 0n,
        signal: controller.signal,
        startTimeNs: 0n,
        stream: "camera",
      }),
    ).rejects.toBeInstanceOf(VideoIntentCancelledError);
  });

  it("waits for future pushed coverage", async () => {
    const reader = new PushVideoAccessUnitReader();
    reader.push("camera", unit(0, true));
    let settled = false;
    const read = reader
      .read({
        budget,
        endTimeNs: 2n,
        signal: new AbortController().signal,
        startTimeNs: 0n,
        stream: "camera",
      })
      .finally(() => {
        settled = true;
      });

    await Promise.resolve();
    expect(settled).toBe(false);
    reader.push("camera", unit(1));
    await Promise.resolve();
    expect(settled).toBe(false);
    reader.push("camera", unit(2));

    await expect(read).resolves.toMatchObject({
      complete: true,
      units: [unit(0, true), unit(1), unit(2)],
    });
  });

  it("returns an incomplete read when its deadline expires", async () => {
    vi.useFakeTimers();
    const reader = new PushVideoAccessUnitReader();
    reader.push("camera", unit(0, true));
    const read = reader.read({
      budget: { ...budget, maxWallTimeMs: 10 },
      endTimeNs: 2n,
      signal: new AbortController().signal,
      startTimeNs: 0n,
      stream: "camera",
    });

    await vi.advanceTimersByTimeAsync(11);

    await expect(read).resolves.toMatchObject({
      complete: false,
      stopReason: "push-history",
      units: [unit(0, true)],
    });
  });

  it("does not restart one stream's quiescence window for another stream", async () => {
    vi.useFakeTimers();
    const reader = new PushVideoAccessUnitReader();
    reader.push("camera-a", unit(0, true));
    let settled = false;
    const read = reader
      .read({
        budget,
        endTimeNs: 2n,
        signal: new AbortController().signal,
        startTimeNs: 0n,
        stream: "camera-a",
      })
      .finally(() => {
        settled = true;
      });

    await vi.advanceTimersByTimeAsync(50);
    reader.push("camera-b", unit(0, true));
    await vi.advanceTimersByTimeAsync(51);

    expect(settled).toBe(true);
    await expect(read).resolves.toMatchObject({
      complete: false,
      stopReason: "push-history",
      units: [unit(0, true)],
    });
  });

  it("returns retained history when the producer becomes quiescent", async () => {
    vi.useFakeTimers();
    const reader = new PushVideoAccessUnitReader();
    reader.push("camera", unit(0, true));
    const read = reader.read({
      budget,
      endTimeNs: 2n,
      signal: new AbortController().signal,
      startTimeNs: 0n,
      stream: "camera",
    });

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(read).resolves.toMatchObject({
      complete: false,
      stopReason: "push-history",
      units: [unit(0, true)],
    });
  });

  it("cancels a read waiting for future pushed coverage", async () => {
    const reader = new PushVideoAccessUnitReader();
    const controller = new AbortController();
    reader.push("camera", unit(0, true));
    const read = reader.read({
      budget,
      endTimeNs: 2n,
      signal: controller.signal,
      startTimeNs: 0n,
      stream: "camera",
    });

    controller.abort();

    await expect(read).rejects.toBeInstanceOf(VideoIntentCancelledError);
  });

  it("reports whether a retained keyframe can bootstrap a target", () => {
    const reader = new PushVideoAccessUnitReader();
    reader.push("camera", unit(2));

    expect(reader.hasRetainedKeyframeAtOrBefore("camera", 2n)).toBe(false);
    reader.push("camera", unit(3, true));
    expect(reader.hasRetainedKeyframeAtOrBefore("camera", 2n)).toBe(false);
    expect(reader.hasRetainedKeyframeAtOrBefore("camera", 3n)).toBe(true);
    reader.push("camera", unit(4));
    expect(reader.hasRetainedKeyframeAtOrBefore("camera", 4n)).toBe(true);
  });

  it("bounds replacements and reports a truncated read budget", async () => {
    const reader = new PushVideoAccessUnitReader(2, 1_024);
    reader.push("camera", unit(0, true));
    for (let replacement = 0; replacement < 100; replacement += 1) {
      reader.push("camera", unit(0, true));
    }
    reader.push("camera", unit(1));
    expect(reader.retainedUnitCount).toBe(2);
    expect(reader.retainedBytes).toBe(10);

    await expect(
      reader.read({
        budget: { ...budget, maxMessages: 1 },
        endTimeNs: 1n,
        signal: new AbortController().signal,
        startTimeNs: 0n,
        stream: "camera",
      }),
    ).resolves.toMatchObject({
      complete: false,
      stopReason: "push-budget",
      units: [unit(0, true)],
    });

    await expect(
      reader.read({
        budget: { ...budget, maxObservedPayloadBytes: 5 },
        endTimeNs: 1n,
        signal: new AbortController().signal,
        startTimeNs: 0n,
        stream: "camera",
      }),
    ).resolves.toMatchObject({
      complete: false,
      stopReason: "push-budget",
      units: [unit(0, true)],
    });
  });

  it("isolates stream spans under global eviction", async () => {
    const reader = new PushVideoAccessUnitReader(2, 1_024);
    reader.push("a", unit(0, true));
    reader.push("b", unit(0, true));
    reader.push("a", unit(1));

    await expect(
      reader.read({
        budget,
        endTimeNs: 0n,
        signal: new AbortController().signal,
        startTimeNs: 0n,
        stream: "unknown",
      }),
    ).resolves.toMatchObject({ complete: false, units: [] });
    await expect(
      reader.read({
        budget,
        endTimeNs: 0n,
        signal: new AbortController().signal,
        startTimeNs: 0n,
        stream: "b",
      }),
    ).resolves.toMatchObject({ complete: true, units: [unit(0, true)] });
    await expect(
      reader.read({
        budget,
        endTimeNs: 1n,
        signal: new AbortController().signal,
        startTimeNs: 0n,
        stream: "a",
      }),
    ).resolves.toMatchObject({
      complete: false,
      stopReason: "push-history",
      units: [unit(1)],
    });
  });
});

function unit(time: number, keyframe = false): H264AccessUnit {
  const timeNs = BigInt(time);
  return {
    frame: {
      bytes: Uint8Array.of(0, 0, 1, keyframe ? 0x65 : 0x41, time),
      codec: "h264",
      format: "h264",
      h264: keyframe
        ? {
            codecString: "avc1.4D001F",
            hasFrame: true,
            pps: Uint8Array.of(0x68),
            sps: Uint8Array.of(0x67),
          }
        : { hasFrame: true },
      keyframe,
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
      timestampNs: timeNs,
    } satisfies EncodedH264VideoVisualization,
    timeNs,
  };
}
