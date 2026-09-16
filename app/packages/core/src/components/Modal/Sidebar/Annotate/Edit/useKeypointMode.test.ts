import { describe, expect, it } from "vitest";
import { computeTargetIndex, resolveTargetIndex } from "./useKeypointMode";
import { skeletonNodeCount } from "./useAnnotationContext/createNew";

const overlayWith = (points: [number, number][]) => ({
  getRelativePoints: () => points,
});

const HOLE: [number, number] = [NaN, NaN];

describe("computeTargetIndex", () => {
  it("targets the first hole in node order", () => {
    const overlay = overlayWith([[0.1, 0.1], HOLE, HOLE]);
    expect(computeTargetIndex(overlay, 3, [])).toBe(1);
  });

  it("starts at node 0 when nothing is placed", () => {
    const overlay = overlayWith([HOLE, HOLE]);
    expect(computeTargetIndex(overlay, 2, [])).toBe(0);
  });

  it("passes over skipped nodes", () => {
    const overlay = overlayWith([[0.1, 0.1], HOLE, HOLE]);
    expect(computeTargetIndex(overlay, 3, [1])).toBe(2);
  });

  it("returns null when every node is placed or skipped", () => {
    const overlay = overlayWith([[0.1, 0.1], HOLE, [0.9, 0.9]]);
    expect(computeTargetIndex(overlay, 3, [1])).toBeNull();
  });

  it("re-targets a node whose point was cleared back to a hole (undo)", () => {
    const overlay = overlayWith([[0.1, 0.1], HOLE, [0.9, 0.9]]);
    expect(computeTargetIndex(overlay, 3, [])).toBe(1);
  });

  it("returns null for free-form overlays (no skeleton)", () => {
    const overlay = overlayWith([[0.1, 0.1]]);
    expect(computeTargetIndex(overlay, 0, [])).toBeNull();
  });
});

describe("resolveTargetIndex", () => {
  it("honors a Place-forced hole over strict order", () => {
    const overlay = overlayWith([HOLE, HOLE, HOLE]);
    expect(resolveTargetIndex(overlay, 3, [], 2)).toBe(2);
  });

  it("honors a forced hole even when it was skipped", () => {
    const overlay = overlayWith([[0.1, 0.1], HOLE, HOLE]);
    expect(resolveTargetIndex(overlay, 3, [1], 1)).toBe(1);
  });

  it("ignores a forced node once it is placed", () => {
    const overlay = overlayWith([HOLE, [0.5, 0.5], HOLE]);
    expect(resolveTargetIndex(overlay, 3, [], 1)).toBe(0);
  });

  it("falls back to strict order without a force", () => {
    const overlay = overlayWith([[0.1, 0.1], HOLE]);
    expect(resolveTargetIndex(overlay, 2, [], null)).toBe(1);
  });

  it("forces re-placement on a fully-resolved label (occlusion return)", () => {
    const overlay = overlayWith([[0.1, 0.1], HOLE, [0.9, 0.9]]);
    // node 1 was skipped (cleared), so strict order says "complete"…
    expect(resolveTargetIndex(overlay, 3, [1], null)).toBeNull();
    // …until Place forces it
    expect(resolveTargetIndex(overlay, 3, [1], 1)).toBe(1);
  });
});

describe("skeletonNodeCount", () => {
  it("uses the node-label count when labels are present", () => {
    expect(
      skeletonNodeCount({ labels: ["nose", "left eye"], edges: [[0, 1]] }),
    ).toBe(2);
  });

  it("infers the count from edges when labels are absent (optional in the SDK)", () => {
    expect(
      skeletonNodeCount({
        labels: undefined as unknown as string[],
        edges: [
          [0, 1],
          [3, 2],
        ],
      }),
    ).toBe(4);
  });

  it("returns 0 without a skeleton (free-form)", () => {
    expect(skeletonNodeCount(null)).toBe(0);
  });
});
