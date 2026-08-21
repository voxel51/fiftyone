import { describe, expect, it } from "vitest";

import type {
  SceneCubePrimitive,
  SceneEntityVisualization,
  SceneUpdateVisualization,
} from "../../../../ir/index";
import {
  hasInterpolatableSceneEntityPair,
  interpolateSceneEntity,
  interpolateSceneUpdate,
} from "./interpolate-scene-entities";

const IDENTITY_QUAT: readonly [number, number, number, number] = [0, 0, 0, 1];
// 90° about +Z.
const QUARTER_TURN_Z: readonly [number, number, number, number] = [
  0,
  0,
  Math.SQRT1_2,
  Math.SQRT1_2,
];

function cube(overrides: Partial<SceneCubePrimitive> = {}): SceneCubePrimitive {
  return {
    color: null,
    pose: { position: [0, 0, 0], quaternion: IDENTITY_QUAT },
    size: [1, 1, 1],
    ...overrides,
  };
}

function entity(
  overrides: Partial<SceneEntityVisualization> = {},
): SceneEntityVisualization {
  return {
    arrowCount: 0,
    arrows: [],
    cubeCount: 0,
    cubes: [],
    cylinderCount: 0,
    cylinders: [],
    frameLocked: false,
    id: "obj-1",
    lineCount: 0,
    lines: [],
    metadata: {},
    modelCount: 0,
    models: [],
    sphereCount: 0,
    spheres: [],
    textCount: 0,
    texts: [],
    triangleCount: 0,
    triangles: [],
    ...overrides,
  };
}

function update(
  entities: readonly SceneEntityVisualization[],
): SceneUpdateVisualization {
  return { kind: "scene-update", deletions: [], entities };
}

describe("interpolateSceneEntity", () => {
  it("lerps cube pose and size at the given fraction", () => {
    const prev = entity({
      cubeCount: 1,
      cubes: [
        cube({
          pose: { position: [0, 0, 0], quaternion: IDENTITY_QUAT },
          size: [1, 1, 1],
        }),
      ],
    });
    const next = entity({
      cubeCount: 1,
      cubes: [
        cube({
          pose: { position: [4, 2, 0], quaternion: IDENTITY_QUAT },
          size: [3, 1, 1],
        }),
      ],
    });

    const out = interpolateSceneEntity(prev, next, 0.5);
    expect(out.cubes[0].pose.position).toEqual([2, 1, 0]);
    expect(out.cubes[0].size).toEqual([2, 1, 1]);
  });

  it("slerps cube orientation", () => {
    const prev = entity({
      cubeCount: 1,
      cubes: [
        cube({ pose: { position: [0, 0, 0], quaternion: IDENTITY_QUAT } }),
      ],
    });
    const next = entity({
      cubeCount: 1,
      cubes: [
        cube({ pose: { position: [0, 0, 0], quaternion: QUARTER_TURN_Z } }),
      ],
    });

    const out = interpolateSceneEntity(prev, next, 0.5);
    const [x, y, z, w] = out.cubes[0].pose.quaternion;
    // Halfway to a 90° Z turn is a 45° Z turn.
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(Math.sin(Math.PI / 8));
    expect(w).toBeCloseTo(Math.cos(Math.PI / 8));
  });

  it("holds a primitive family whose count changed", () => {
    const prev = entity({ cubeCount: 2, cubes: [cube(), cube()] });
    const next = entity({
      cubeCount: 1,
      cubes: [
        cube({ pose: { position: [9, 9, 9], quaternion: IDENTITY_QUAT } }),
      ],
    });

    const out = interpolateSceneEntity(prev, next, 0.5);
    expect(out.cubes).toBe(prev.cubes);
  });

  it("restamps interpolated entities to the synthesized time", () => {
    const prev = entity({ timestampNs: 100n });
    const next = entity({ timestampNs: 200n });

    expect(interpolateSceneEntity(prev, next, 0.5, 150n).timestampNs).toBe(
      150n,
    );
    expect(interpolateSceneEntity(prev, next, 0.5).timestampNs).toBe(100n);
  });
});

describe("interpolateSceneUpdate", () => {
  it("matches entities by id and leaves unmatched prev entities in place", () => {
    const moving = entity({
      cubeCount: 1,
      cubes: [cube()],
      id: "car-1",
    });
    const movingNext = entity({
      cubeCount: 1,
      cubes: [
        cube({ pose: { position: [2, 0, 0], quaternion: IDENTITY_QUAT } }),
      ],
      id: "car-1",
    });
    const leaving = entity({ cubeCount: 1, cubes: [cube()], id: "car-2" });
    const arriving = entity({ cubeCount: 1, cubes: [cube()], id: "car-3" });

    const out = interpolateSceneUpdate(
      update([moving, leaving]),
      update([movingNext, arriving]),
      0.5,
    );

    expect(out.entities).toHaveLength(2);
    expect(out.entities[0].cubes[0].pose.position).toEqual([1, 0, 0]);
    // car-2 has no match in next: unchanged. car-3 does not appear early.
    expect(out.entities[1]).toBe(leaving);
    expect(out.entities.some((e) => e.id === "car-3")).toBe(false);
  });

  it("does not interpolate across a coordinate-frame change", () => {
    const prev = entity({ cubeCount: 1, cubes: [cube()], frameId: "map" });
    const next = entity({
      cubeCount: 1,
      cubes: [
        cube({ pose: { position: [2, 0, 0], quaternion: IDENTITY_QUAT } }),
      ],
      frameId: "base_link",
    });

    const out = interpolateSceneUpdate(update([prev]), update([next]), 0.5);
    expect(out.entities[0]).toBe(prev);
  });

  it("does not pair unidentified entities", () => {
    const prev = entity({ cubeCount: 1, cubes: [cube()], id: "" });
    const next = entity({
      cubeCount: 1,
      cubes: [
        cube({ pose: { position: [2, 0, 0], quaternion: IDENTITY_QUAT } }),
      ],
      id: "",
    });

    const out = interpolateSceneUpdate(update([prev]), update([next]), 0.5);
    expect(out.entities[0]).toBe(prev);
  });

  it("requires a stable id, matching frame, and compatible primitive family", () => {
    const compatiblePrev = entity({
      cubeCount: 1,
      cubes: [cube()],
      frameId: "map",
      id: "car-1",
    });
    const compatibleNext = entity({
      cubeCount: 1,
      cubes: [cube()],
      frameId: "map",
      id: "car-1",
    });
    expect(
      hasInterpolatableSceneEntityPair(
        update([compatiblePrev]),
        update([compatibleNext]),
      ),
    ).toBe(true);
    expect(
      hasInterpolatableSceneEntityPair(
        update([compatiblePrev]),
        update([{ ...compatibleNext, id: "" }]),
      ),
    ).toBe(false);
    expect(
      hasInterpolatableSceneEntityPair(
        update([compatiblePrev]),
        update([{ ...compatibleNext, frameId: "base_link" }]),
      ),
    ).toBe(false);
    expect(
      hasInterpolatableSceneEntityPair(
        update([compatiblePrev]),
        update([
          {
            ...compatibleNext,
            cubeCount: 2,
            cubes: [cube(), cube()],
          },
        ]),
      ),
    ).toBe(false);
  });

  it("uses the same first duplicate id for safety checks and interpolation", () => {
    const prev = entity({
      cubeCount: 1,
      cubes: [
        cube({
          pose: { position: [0, 0, 0], quaternion: IDENTITY_QUAT },
        }),
      ],
      frameId: "map",
      id: "car-1",
    });
    const incompatibleFirst = {
      ...prev,
      cubeCount: 0,
      cubes: [],
    };
    const compatibleSecond = {
      ...prev,
      cubes: [
        cube({
          pose: { position: [10, 0, 0], quaternion: IDENTITY_QUAT },
        }),
      ],
    };
    const previous = update([prev]);
    const next = update([incompatibleFirst, compatibleSecond]);

    expect(hasInterpolatableSceneEntityPair(previous, next)).toBe(false);
    expect(interpolateSceneUpdate(previous, next, 0.5).entities[0]).toBe(prev);
  });
});
