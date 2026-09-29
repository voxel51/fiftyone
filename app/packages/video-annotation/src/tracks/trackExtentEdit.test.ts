import { describe, expect, it } from "vitest";
import {
  resolveTemporalDetectionSupport,
  resolveTrackExtentEdit,
  type ResolveTrackExtentEditInput,
} from "./trackExtentEdit";

const FPS = 30;

// A segment covering frames [11, 31] inclusive:
//   startSec = (11 - 1) / 30, endSec = 31 / 30.
const SEG_FIRST = 11;
const SEG_LAST = 31;
const origStartSec = (SEG_FIRST - 1) / FPS;
const origEndSec = SEG_LAST / FPS;

const base = (
  over: Partial<ResolveTrackExtentEditInput>,
): ResolveTrackExtentEditInput => ({
  mode: "resize-end",
  origStartSec,
  origEndSec,
  newStartSec: origStartSec,
  newEndSec: origEndSec,
  fps: FPS,
  totalFrames: 120,
  ...over,
});

// Convert a frame to the end-second its bar edge would sit at.
const endSecOf = (frame: number) => frame / FPS;
// Convert a frame to the start-second its bar edge would sit at.
const startSecOf = (frame: number) => (frame - 1) / FPS;

describe("resolveTrackExtentEdit", () => {
  it("returns none for degenerate fps", () => {
    expect(resolveTrackExtentEdit(base({ fps: 0 })).op).toBe("none");
  });

  it("returns none when the drag snaps back to the original extent", () => {
    expect(resolveTrackExtentEdit(base({ mode: "resize-end" })).op).toBe(
      "none",
    );
    expect(resolveTrackExtentEdit(base({ mode: "resize-start" })).op).toBe(
      "none",
    );
    expect(resolveTrackExtentEdit(base({ mode: "move" })).op).toBe("none");
  });

  describe("resize-end", () => {
    it("extends forward, copying the last frame onto the grown frames", () => {
      const edit = resolveTrackExtentEdit(
        base({ mode: "resize-end", newEndSec: endSecOf(45) }),
      );
      expect(edit).toEqual({
        op: "extend",
        sourceFrame: SEG_LAST,
        targetFrames: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
      });
    });

    it("clamps growth to totalFrames", () => {
      const edit = resolveTrackExtentEdit(
        base({ mode: "resize-end", newEndSec: endSecOf(200), totalFrames: 40 }),
      );
      expect(edit).toEqual({
        op: "extend",
        sourceFrame: SEG_LAST,
        targetFrames: [32, 33, 34, 35, 36, 37, 38, 39, 40],
      });
    });

    it("trims from the end when dragged inward", () => {
      const edit = resolveTrackExtentEdit(
        base({ mode: "resize-end", newEndSec: endSecOf(28) }),
      );
      expect(edit).toEqual({ op: "trim", frames: [29, 30, 31] });
    });
  });

  describe("resize-start", () => {
    it("extends backward, copying the first frame onto the grown frames", () => {
      const edit = resolveTrackExtentEdit(
        base({ mode: "resize-start", newStartSec: startSecOf(8) }),
      );
      expect(edit).toEqual({
        op: "extend",
        sourceFrame: SEG_FIRST,
        targetFrames: [8, 9, 10],
      });
    });

    it("clamps backward growth to frame 1", () => {
      const edit = resolveTrackExtentEdit(
        base({ mode: "resize-start", newStartSec: startSecOf(-5) }),
      );
      expect(edit).toEqual({
        op: "extend",
        sourceFrame: SEG_FIRST,
        targetFrames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      });
    });

    it("trims from the start when dragged inward", () => {
      const edit = resolveTrackExtentEdit(
        base({ mode: "resize-start", newStartSec: startSecOf(14) }),
      );
      expect(edit).toEqual({ op: "trim", frames: [11, 12, 13] });
    });
  });

  describe("move", () => {
    it("shifts the whole segment by the dragged delta", () => {
      const edit = resolveTrackExtentEdit(
        base({ mode: "move", newStartSec: startSecOf(SEG_FIRST + 1) }),
      );
      expect(edit).toEqual({
        op: "shift",
        frames: Array.from({ length: 21 }, (_, i) => SEG_FIRST + i),
        delta: 1,
      });
    });

    it("clamps a backward shift to the clip start", () => {
      const edit = resolveTrackExtentEdit(
        base({ mode: "move", newStartSec: startSecOf(1) }),
      );
      // first is 11, so the most it can move left is -10.
      expect(edit).toMatchObject({ op: "shift", delta: -10 });
    });

    it("clamps a forward shift so it can't overrun a right neighbour", () => {
      const edit = resolveTrackExtentEdit(
        base({
          mode: "move",
          newStartSec: startSecOf(SEG_FIRST + 20),
          // Neighbour occupies [40, 50]; segment end is 31, so the bar
          // can move forward at most to end at 39 → delta +8.
          neighborSegments: [[40, 50]],
        }),
      );
      expect(edit).toMatchObject({ op: "shift", delta: 8 });
    });
  });
});

describe("resolveTemporalDetectionSupport", () => {
  const TOTAL = 120;
  const td = (
    mode: ResolveTrackExtentEditInput["mode"],
    first: number,
    last: number,
  ) =>
    resolveTemporalDetectionSupport({
      mode,
      newStartSec: startSecOf(first),
      newEndSec: endSecOf(last),
      fps: FPS,
      totalFrames: TOTAL,
    });

  it("returns null for degenerate fps", () => {
    expect(
      resolveTemporalDetectionSupport({
        mode: "move",
        newStartSec: 0,
        newEndSec: 1,
        fps: 0,
        totalFrames: TOTAL,
      }),
    ).toBeNull();
  });

  it("returns null for a non-positive clip length", () => {
    for (const totalFrames of [0, -3, Number.NaN]) {
      expect(
        resolveTemporalDetectionSupport({
          mode: "resize-end",
          newStartSec: 0,
          newEndSec: 1,
          fps: FPS,
          totalFrames,
        }),
      ).toBeNull();
    }
  });

  it("inverts the build's seconds mapping for an in-range drag", () => {
    expect(td("resize-end", SEG_FIRST, 50)).toEqual([SEG_FIRST, 50]);
    expect(td("resize-start", 5, SEG_LAST)).toEqual([5, SEG_LAST]);
    expect(td("move", 20, 40)).toEqual([20, 40]);
  });

  it("stops a resize-end at the clip's last frame", () => {
    expect(td("resize-end", SEG_FIRST, TOTAL + 15)).toEqual([SEG_FIRST, TOTAL]);
  });

  it("stops a resize-start at frame 1", () => {
    expect(td("resize-start", -4, SEG_LAST)).toEqual([1, SEG_LAST]);
  });

  it("slides a move back onto the clip, keeping its width", () => {
    // [111, 131] is 21 frames wide and overruns by 11 → [100, 120]
    expect(td("move", TOTAL - 9, TOTAL + 11)).toEqual([TOTAL - 20, TOTAL]);
    // [-5, 15] → [1, 21]
    expect(td("move", -5, 15)).toEqual([1, 21]);
  });

  it("pins a move of a span wider than the clip to the whole clip", () => {
    expect(td("move", 10, 10 + TOTAL + 30)).toEqual([1, TOTAL]);
  });

  it("never produces a zero-width or inverted support", () => {
    expect(td("resize-end", 50, 40)).toEqual([50, 50]);
    expect(td("resize-end", TOTAL + 5, TOTAL + 9)).toEqual([TOTAL, TOTAL]);
  });
});
