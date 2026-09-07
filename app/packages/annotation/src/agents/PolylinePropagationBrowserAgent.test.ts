/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { PolylinePropagationBrowserAgent } from "./PolylinePropagationBrowserAgent";
import type { PropagationContext } from "./types";
import { AgentTaskType } from "./types";

type Ring = [number, number][];

const SQUARE: Ring = [
  [0.2, 0.2],
  [0.4, 0.2],
  [0.4, 0.4],
  [0.2, 0.4],
];

/** The same square translated +0.4 in x. */
const SQUARE_MOVED: Ring = SQUARE.map(([x, y]) => [x + 0.4, y]) as Ring;

/** Trim binary-float noise so a midpoint reads as 0.75, not 0.7500000000000001. */
const round = (v: number): number => Math.round(v * 1e6) / 1e6;

const keyframe = (points: Ring[], overrides: Record<string, unknown> = {}) =>
  ({
    id: "label-1",
    _id: "label-1",
    label: "vehicle",
    index: 3,
    points,
    closed: true,
    filled: false,
    keyframe: true,
    ...overrides,
  }) as unknown as PropagationContext["parentKeyframes"][number];

const contextFor = (
  left: Ring[],
  right: Ring[],
  fromFrame = 10,
  toFrame = 20,
): PropagationContext =>
  ({
    sampleDescriptor: { id: "sample-1" },
    taskType: AgentTaskType.PROPAGATE,
    instanceId: "instance-1",
    fromFrame,
    toFrame,
    parentKeyframes: [keyframe(left), keyframe(right)],
  }) as unknown as PropagationContext;

const run = async (left: Ring[], right: Ring[], from = 10, to = 20) => {
  const result = await new PolylinePropagationBrowserAgent().infer(
    contextFor(left, right, from, to),
  );
  return result.response.perFrame;
};

/** Every emitted label, keyed by frame, as the polyline shape the app writes. */
const geometryAt = (
  perFrame: Awaited<ReturnType<typeof run>>,
  frame: number,
): Ring[] =>
  (
    perFrame.find((f) => f.frameNumber === frame)?.detection as unknown as {
      points: Ring[];
    }
  ).points;

/**
 * A closed ring has no canonical start vertex, and the interpolator rotates its
 * output to begin at an anchored vertex. Compare rings as cyclic sequences so
 * these tests assert on *shape*, not on an index order the aligner may rotate.
 * (Open paths do have a canonical order — asserted directly, further down.)
 */
const rotations = (ring: Ring): Ring[] =>
  ring.map((_, i) => [...ring.slice(i), ...ring.slice(0, i)] as Ring);

/** The rotation of `ring` whose first vertex matches `startsAt`, if any. */
const alignedTo = (ring: Ring, startsAt: [number, number]): Ring | null =>
  rotations(ring).find(
    (r) => r[0][0] === startsAt[0] && r[0][1] === startsAt[1],
  ) ?? null;

describe("PolylinePropagationBrowserAgent", () => {
  it("emits one label per in-between frame, exclusive of both keyframes", async () => {
    const perFrame = await run([SQUARE], [SQUARE_MOVED], 10, 20);

    expect(perFrame.map((f) => f.frameNumber)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
  });

  it("marks every emitted label as filler, never a keyframe", async () => {
    const perFrame = await run([SQUARE], [SQUARE_MOVED]);

    for (const { detection } of perFrame) {
      expect((detection as unknown as { keyframe: boolean }).keyframe).toBe(
        false,
      );
    }
  });

  it("carries the track's identity onto every filler label", async () => {
    const perFrame = await run([SQUARE], [SQUARE_MOVED]);

    for (const { detection } of perFrame) {
      const label = detection as unknown as {
        _cls: string;
        label: string;
        index: number;
        instance: { _id: string };
        closed: boolean;
        filled: boolean;
      };
      expect(label._cls).toBe("Polyline");
      expect(label.label).toBe("vehicle");
      expect(label.index).toBe(3);
      // the shared instance id is what makes these one track
      expect(label.instance._id).toBe("instance-1");
      expect(label.closed).toBe(true);
      expect(label.filled).toBe(false);
    }
  });

  it("gives every filler label a distinct id", async () => {
    const perFrame = await run([SQUARE], [SQUARE_MOVED]);
    const ids = perFrame.map(
      ({ detection }) => (detection as unknown as { _id: string })._id,
    );

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{24}$/);
    }
  });

  it("steps uniformly across the span — no snap at either end", async () => {
    // The endpoint-snap bug: a span interpolating between *resampled* copies of
    // the keyframes lands short of the real keyframes, so it jumps at t=0 and
    // t=1 while the interior steps evenly. Measure the whole sequence, keyframes
    // included: 10 -> 11 -> ... -> 19 -> 20.
    //
    // Under a pure translation every vertex moves alike, so track one vertex —
    // but a closed ring's output may be rotated, so re-align each frame to the
    // ring's own bottom-left corner (unique here) before measuring.
    const perFrame = await run([SQUARE], [SQUARE_MOVED], 10, 20);
    const corner = (ring: Ring): [number, number] => {
      const sorted = [...ring].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return sorted[0] as [number, number];
    };

    const track: [number, number][] = [
      corner(SQUARE),
      ...perFrame.map(({ frameNumber }) =>
        corner(geometryAt(perFrame, frameNumber)[0]),
      ),
      corner(SQUARE_MOVED),
    ];

    const steps = track
      .slice(1)
      .map((p, i) => Math.hypot(p[0] - track[i][0], p[1] - track[i][1]));

    // a translation of 0.4 over 10 frames = 0.04 per frame, everywhere
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(1e-9);
    expect(steps[0]).toBeCloseTo(0.04, 6);
  });

  it("interpolates a pure translation as the midpoint shape", async () => {
    const perFrame = await run([SQUARE], [SQUARE_MOVED], 10, 20);
    const mid = geometryAt(perFrame, 15)[0];

    // halfway through a +0.4 translation
    mid.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(SQUARE[i][0] + 0.2, 6);
      expect(y).toBeCloseTo(SQUARE[i][1], 6);
    });
  });

  it("holds vertices identical in both keyframes exactly still", async () => {
    // The untouched-vertices bug: the annotator moved one corner, so the other
    // three must not drift by even a rounding error on any frame.
    const moved: Ring = [
      [0.9, 0.9],
      [0.4, 0.2],
      [0.4, 0.4],
      [0.2, 0.4],
    ];
    const perFrame = await run([SQUARE], [moved], 10, 20);

    for (const { frameNumber } of perFrame) {
      const ring = geometryAt(perFrame, frameNumber)[0];
      // re-align to the vertex that didn't move, then the other two untouched
      // vertices must follow it bit-for-bit — not merely close
      const aligned = alignedTo(ring, SQUARE[1] as [number, number]);
      expect(aligned, `frame ${frameNumber} lost vertex ${SQUARE[1]}`).not.toBe(
        null,
      );
      expect(aligned?.[1]).toEqual(SQUARE[2]);
      expect(aligned?.[2]).toEqual(SQUARE[3]);
    }
  });

  it("emits a stable vertex count when the keyframes disagree", async () => {
    // 4 vertices -> 5: every frame must render the denser count, so the shape
    // doesn't pop a vertex partway through the span.
    const denser: Ring = [
      [0.6, 0.2],
      [0.8, 0.2],
      [0.9, 0.3],
      [0.8, 0.4],
      [0.6, 0.4],
    ];
    const perFrame = await run([SQUARE], [denser], 10, 20);
    const counts = perFrame.map(
      ({ frameNumber }) => geometryAt(perFrame, frameNumber)[0].length,
    );

    expect(new Set(counts)).toEqual(new Set([5]));
  });

  it("interpolates each ring of a multi-ring shape", async () => {
    const secondRing: Ring = [
      [0.1, 0.7],
      [0.2, 0.7],
      [0.2, 0.8],
    ];
    const secondMoved: Ring = secondRing.map(([x, y]) => [x, y + 0.1]) as Ring;
    const perFrame = await run(
      [SQUARE, secondRing],
      [SQUARE_MOVED, secondMoved],
      10,
      20,
    );
    const mid = geometryAt(perFrame, 15);

    expect(mid).toHaveLength(2);
    // rings stay paired and each lands halfway; compare as point sets so a
    // rotated closed ring still passes
    const midFirst = [...mid[0]].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const midSecond = [...mid[1]].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    expect(midFirst.map(([x, y]) => [round(x), round(y)])).toEqual([
      [0.4, 0.2],
      [0.4, 0.4],
      [0.6, 0.2],
      [0.6, 0.4],
    ]);
    expect(midSecond.map(([x, y]) => [round(x), round(y)])).toEqual([
      [0.1, 0.75],
      [0.2, 0.75],
      [0.2, 0.85],
    ]);
  });

  it("keeps an open path's vertex order — start and end stay put", async () => {
    // A closed ring may be rotated freely (no canonical start), but rotating an
    // OPEN path rewrites the shape: its first and last vertices are the ends of
    // the stroke. Move one end and the rest must stay in place, in order.
    const movedEnd: Ring = [
      [0.9, 0.9],
      [0.4, 0.2],
      [0.4, 0.4],
      [0.2, 0.4],
    ];
    const openLeft = keyframe([SQUARE], { closed: false });
    const openRight = keyframe([movedEnd], { closed: false });
    const result = await new PolylinePropagationBrowserAgent().infer({
      sampleDescriptor: { id: "sample-1" },
      taskType: AgentTaskType.PROPAGATE,
      instanceId: "instance-1",
      fromFrame: 10,
      toFrame: 20,
      parentKeyframes: [openLeft, openRight],
    } as unknown as PropagationContext);

    for (const { detection } of result.response.perFrame) {
      const ring = (detection as unknown as { points: Ring[] }).points[0];
      // index order preserved exactly, no rotation
      expect(ring[1]).toEqual(SQUARE[1]);
      expect(ring[2]).toEqual(SQUARE[2]);
      expect(ring[3]).toEqual(SQUARE[3]);
      // and the moving end travels along the diagonal
      expect(ring[0][0]).toBeCloseTo(ring[0][1], 6);
      expect(ring[0][0]).toBeGreaterThan(0.2);
      expect(ring[0][0]).toBeLessThan(0.9);
    }
  });

  it("rejects a span that runs backwards", async () => {
    await expect(run([SQUARE], [SQUARE_MOVED], 20, 10)).rejects.toThrow(
      /must be less than/,
    );
  });

  it("emits nothing for adjacent keyframes", async () => {
    // Frames 10 and 11 bracket no filler at all.
    expect(await run([SQUARE], [SQUARE_MOVED], 10, 11)).toEqual([]);
  });

  it("returns to idle after inferring, and after a rejection", async () => {
    const agent = new PolylinePropagationBrowserAgent();

    await agent.infer(contextFor([SQUARE], [SQUARE_MOVED]));
    expect(agent.getLifecycleStatus?.()).toBe("idle");

    await expect(
      agent.infer(contextFor([SQUARE], [SQUARE_MOVED], 20, 10)),
    ).rejects.toThrow();
    expect(agent.getLifecycleStatus?.()).toBe("idle");
  });

  it("reports itself as a propagation agent", async () => {
    const agent = new PolylinePropagationBrowserAgent();

    expect(await agent.listSupportedTasks()).toEqual([AgentTaskType.PROPAGATE]);
    expect(await agent.getModelMetadata(AgentTaskType.PROPAGATE)).toEqual({
      name: "Linear interpolation (polyline)",
    });
  });
});
