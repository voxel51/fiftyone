import { describe, expect, it } from "vitest";
import type { FrameTable } from "./frameTable";
import { frameAtTableTime, timeAtTableFrame } from "./frameTable";

// A 30fps source with two dropped frames: presentation carries on at
// frames 1-3 (0, 1/30, 2/30), then jumps to 5/30 — so frames 4 and 5 of
// the table sit where `time × fps` says frames 6 and 7 live. This is the
// exact shape where clock-based numbering drifts ahead of `to_frames`.
const FPS = 30;
const GAPPED: FrameTable = {
  timesSec: [0, 1 / FPS, 2 / FPS, 5 / FPS, 6 / FPS],
};

const EMPTY: FrameTable = { timesSec: [] };

describe("frameAtTableTime", () => {
  it("numbers frames by presentation order, not time × fps", () => {
    // 3/30s is inside the dropped-frame gap: the picture still shows the
    // last pre-gap frame (table frame 3), while time × fps would say 4.
    expect(frameAtTableTime(GAPPED, 3 / FPS)).toBe(3);
    expect(Math.floor((3 / FPS) * FPS) + 1).toBe(4);
  });

  it("holds the last pre-gap frame across the whole gap", () => {
    expect(frameAtTableTime(GAPPED, 2 / FPS)).toBe(3);
    expect(frameAtTableTime(GAPPED, 3.5 / FPS)).toBe(3);
    expect(frameAtTableTime(GAPPED, 4.999 / FPS)).toBe(3);
    expect(frameAtTableTime(GAPPED, 5 / FPS)).toBe(4);
  });

  it("lands exactly on a boundary within the float epsilon", () => {
    // A start time reconstructed with float error just below the boundary
    // must still resolve to the boundary's frame, not the one before it.
    expect(frameAtTableTime(GAPPED, 5 / FPS - 5e-7)).toBe(4);
    expect(frameAtTableTime(GAPPED, 1 / FPS - 5e-7)).toBe(2);
    // ...but a genuinely earlier time (beyond the epsilon) must not.
    expect(frameAtTableTime(GAPPED, 5 / FPS - 1e-3)).toBe(3);
  });

  it("clamps below the first frame and past the last", () => {
    expect(frameAtTableTime(GAPPED, -1)).toBe(1);
    expect(frameAtTableTime(GAPPED, 100)).toBe(GAPPED.timesSec.length);
  });

  it("returns frame 1 for an empty table", () => {
    expect(frameAtTableTime(EMPTY, 0.5)).toBe(1);
  });
});

describe("timeAtTableFrame", () => {
  it("round-trips every frame through frameAtTableTime", () => {
    for (let frame = 1; frame <= GAPPED.timesSec.length; frame++) {
      expect(frameAtTableTime(GAPPED, timeAtTableFrame(GAPPED, frame))).toBe(
        frame,
      );
    }
  });

  it("clamps out-of-range frames to the table", () => {
    expect(timeAtTableFrame(GAPPED, 0)).toBe(0);
    expect(timeAtTableFrame(GAPPED, -3)).toBe(0);
    expect(timeAtTableFrame(GAPPED, 99)).toBe(6 / FPS);
  });

  it("returns 0 for an empty table", () => {
    expect(timeAtTableFrame(EMPTY, 3)).toBe(0);
  });
});
