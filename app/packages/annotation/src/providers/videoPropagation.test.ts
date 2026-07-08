import { describe, expect, it, vi } from "vitest";
import type { BrowserAnnotationProvider } from "./BrowserAnnotationProvider";
import { PointLabel, type InferenceResult } from "./types";
import { pointsFromBox, propagate } from "./videoPropagation";

/** A 2×2 all-on mask at a fixed bbox — enough for centroid sampling. */
const fakeResult = (): InferenceResult => ({
  mask: new Float32Array([1, 1, 1, 1]),
  maskWidth: 2,
  maskHeight: 2,
  bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
});

const fakeProvider = (impl = vi.fn(async () => fakeResult())) =>
  ({ inferBitmap: impl }) as unknown as BrowserAnnotationProvider & {
    inferBitmap: ReturnType<typeof vi.fn>;
  };

const seedPoints = [{ x: 0.5, y: 0.5, label: PointLabel.POSITIVE }];

describe("pointsFromBox", () => {
  it("centres on the box and samples interior points", () => {
    const pts = pointsFromBox([0.2, 0.4, 0.4, 0.2]);
    // centre first
    expect(pts[0]).toEqual({ x: 0.4, y: 0.5, label: PointLabel.POSITIVE });
    expect(pts).toHaveLength(5);
    // all positive, all inside the box
    for (const p of pts) {
      expect(p.label).toBe(PointLabel.POSITIVE);
      expect(p.x).toBeGreaterThanOrEqual(0.2);
      expect(p.x).toBeLessThanOrEqual(0.6);
      expect(p.y).toBeGreaterThanOrEqual(0.4);
      expect(p.y).toBeLessThanOrEqual(0.6);
    }
  });

  it("honours the requested point count", () => {
    expect(pointsFromBox([0, 0, 1, 1], 1)).toHaveLength(1);
    expect(pointsFromBox([0, 0, 1, 1], 3)).toHaveLength(3);
  });
});

describe("propagate", () => {
  it("walks [A, B] inclusive, seeding the first frame from keyframe A", async () => {
    const infer = vi.fn(async () => fakeResult());
    const provider = fakeProvider(infer);
    const getFrameBitmap = vi.fn(async () => ({}) as ImageBitmap);
    const onProgress = vi.fn();

    const results = await propagate(provider, {
      getFrameBitmap,
      keyframeA: { frameIdx: 1, points: seedPoints },
      keyframeB: { frameIdx: 4, points: seedPoints },
      videoKey: "vid",
      onProgress,
    });

    // frames 1,2,3,4
    expect([...results.keys()]).toEqual([1, 2, 3, 4]);
    expect(getFrameBitmap.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4]);
    // first inference is seeded by keyframe A's points
    expect(infer.mock.calls[0][0].points).toEqual(seedPoints);
    // cache key carries the frame index
    expect(infer.mock.calls[1][0].cacheKey).toBe("vid#frame=2");
    // progress reaches the full span
    expect(onProgress).toHaveBeenLastCalledWith(4, 4);
  });

  it("stops early when shouldAbort returns true", async () => {
    const provider = fakeProvider();
    let calls = 0;
    const results = await propagate(provider, {
      getFrameBitmap: async () => ({}) as ImageBitmap,
      keyframeA: { frameIdx: 1, points: seedPoints },
      keyframeB: { frameIdx: 10, points: seedPoints },
      videoKey: "vid",
      shouldAbort: () => calls++ >= 2,
    });

    expect(results.size).toBe(2);
  });

  it("rejects a non-increasing keyframe range", async () => {
    await expect(
      propagate(fakeProvider(), {
        getFrameBitmap: async () => ({}) as ImageBitmap,
        keyframeA: { frameIdx: 5, points: seedPoints },
        keyframeB: { frameIdx: 5, points: seedPoints },
        videoKey: "vid",
      }),
    ).rejects.toThrow(/keyframeA must precede keyframeB/);
  });
});
