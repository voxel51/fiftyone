import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MultimodalTransformGraphCache } from "./transform-graph-cache";

describe("MultimodalTransformGraphCache", () => {
  it("preserves graph revisions when only future TF samples are appended", () => {
    const transformSampleSets = new Map([
      [
        "/tf",
        {
          version: 1,
          samples: [
            {
              cacheKey: "sample-1",
              timestampNs: 10,
              parentFrameId: "map",
              childFrameId: "base_link",
              translation: [1, 0, 0] as [number, number, number],
              rotation: [0, 0, 0, 1] as [number, number, number, number],
            },
            {
              cacheKey: "sample-2",
              timestampNs: 20,
              parentFrameId: "map",
              childFrameId: "base_link",
              translation: [2, 0, 0] as [number, number, number],
              rotation: [0, 0, 0, 1] as [number, number, number, number],
            },
          ],
        },
      ],
    ]);
    const cache = new MultimodalTransformGraphCache({
      getTransformSampleSet: (streamId) => transformSampleSets.get(streamId)!,
    });

    const firstSnapshot = cache.getSnapshot(["/tf"], 15);
    expect(firstSnapshot.revision).toBe(1);
    expect(
      applyMatrixToOrigin(firstSnapshot.resolveMatrix("base_link", "map"))
    ).toEqual([1, 0, 0]);

    transformSampleSets.set("/tf", {
      version: 2,
      samples: [
        ...transformSampleSets.get("/tf")!.samples,
        {
          cacheKey: "sample-3",
          timestampNs: 30,
          parentFrameId: "map",
          childFrameId: "base_link",
          translation: [3, 0, 0] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
        },
      ],
    });

    const unchangedSnapshot = cache.getSnapshot(["/tf"], 15);
    expect(unchangedSnapshot.revision).toBe(firstSnapshot.revision);
    expect(
      applyMatrixToOrigin(unchangedSnapshot.resolveMatrix("base_link", "map"))
    ).toEqual([1, 0, 0]);

    const advancedSnapshot = cache.getSnapshot(["/tf"], 25);
    expect(advancedSnapshot.revision).toBe(firstSnapshot.revision + 1);
    expect(
      applyMatrixToOrigin(advancedSnapshot.resolveMatrix("base_link", "map"))
    ).toEqual([2, 0, 0]);

    const rewoundSnapshot = cache.getSnapshot(["/tf"], 15);
    expect(rewoundSnapshot.revision).toBe(advancedSnapshot.revision + 1);
    expect(
      applyMatrixToOrigin(rewoundSnapshot.resolveMatrix("base_link", "map"))
    ).toEqual([1, 0, 0]);
  });
});

function applyMatrixToOrigin(matrix: THREE.Matrix4 | null) {
  const origin = new THREE.Vector3(0, 0, 0);
  return matrix
    ? (origin.applyMatrix4(matrix).toArray() as [number, number, number])
    : null;
}
