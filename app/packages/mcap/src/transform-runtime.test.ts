import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyTransformToScene3dFrame,
  applyTransformToScene3dPrimitive,
  buildTransformGraph,
  mergeScene3dFrames,
  resolveTransformMatrix,
} from "./transform-runtime";

describe("transform-runtime", () => {
  it("resolves FrameTransform matrices from child to parent", () => {
    const graph = buildTransformGraph([
      {
        cacheKey: "tf-1",
        timestampNs: 10,
        parentFrameId: "base_link",
        childFrameId: "lidar",
        translation: [1, 2, 3],
        rotation: [0, 0, 0, 1],
      },
    ]);

    const matrix = resolveTransformMatrix(graph, "lidar", "base_link");
    const transformed = applyTransformToScene3dPrimitive(
      {
        kind: "points",
        id: "points",
        frameId: "lidar",
        pointCount: 1,
        positions: new Float32Array([0, 0, 0]),
        intensity: null,
        colors: null,
        solidColor: null,
        pointSize: null,
      },
      matrix!,
      "base_link"
    );

    expect(Array.from(transformed.positions)).toEqual([1, 2, 3]);
  });

  it("preserves TF rotation direction when targeting a parent frame", () => {
    const quarterTurn = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2
    );
    const graph = buildTransformGraph([
      {
        cacheKey: "tf-1",
        timestampNs: 10,
        parentFrameId: "base_link",
        childFrameId: "lidar",
        translation: [0, 0, 0],
        rotation: [quarterTurn.x, quarterTurn.y, quarterTurn.z, quarterTurn.w],
      },
    ]);

    const matrix = resolveTransformMatrix(graph, "lidar", "base_link");
    const transformed = applyTransformToScene3dPrimitive(
      {
        kind: "points",
        id: "points",
        frameId: "lidar",
        pointCount: 1,
        positions: new Float32Array([1, 0, 0]),
        intensity: null,
        colors: null,
        solidColor: null,
        pointSize: null,
      },
      matrix!,
      "base_link"
    );

    expect(transformed.positions[0]).toBeCloseTo(0);
    expect(transformed.positions[1]).toBeCloseTo(1);
    expect(transformed.positions[2]).toBeCloseTo(0);
  });

  it("preserves a shared frame id when merging transformed scenes", () => {
    const matrix = new THREE.Matrix4().makeTranslation(1, 0, 0);
    const firstFrame = applyTransformToScene3dFrame(
      {
        id: "cloud-1",
        pointCount: 1,
        bounds: { min: [0, 0, 0], max: [0, 0, 0] },
        frameId: "lidar_a",
        primitives: [
          {
            kind: "points",
            id: "points-a",
            frameId: "lidar_a",
            pointCount: 1,
            positions: new Float32Array([0, 0, 0]),
            intensity: null,
            colors: null,
            solidColor: null,
            pointSize: null,
          },
        ],
      },
      matrix,
      "base_link"
    );
    const secondFrame = applyTransformToScene3dFrame(
      {
        id: "cloud-2",
        pointCount: 1,
        bounds: { min: [1, 0, 0], max: [1, 0, 0] },
        frameId: "lidar_b",
        primitives: [
          {
            kind: "points",
            id: "points-b",
            frameId: "lidar_b",
            pointCount: 1,
            positions: new Float32Array([1, 0, 0]),
            intensity: null,
            colors: null,
            solidColor: null,
            pointSize: null,
          },
        ],
      },
      matrix,
      "base_link"
    );

    const merged = mergeScene3dFrames([
      { frame: firstFrame, streamId: "/a", color: "#fff" },
      { frame: secondFrame, streamId: "/b", color: "#0ff" },
    ]);

    expect(merged.frame?.frameId).toBe("base_link");
  });

  it("preserves semantic SceneUpdate colors when merging multiple streams", () => {
    const merged = mergeScene3dFrames([
      {
        frame: {
          id: "scene-update",
          pointCount: 2,
          bounds: { min: [0, 0, 0], max: [1, 0, 0] },
          frameId: "map",
          primitives: [
            {
              kind: "line-strip",
              id: "annotation-1",
              frameId: "map",
              positions: new Float32Array([0, 0, 0, 1, 0, 0]),
              colors: null,
              semantic: {
                title: "car",
                entries: [{ label: "id", value: "entity-1" }],
              },
              solidColor: "hsl(21deg 74% 60%)",
            },
          ],
        },
        streamId: "/annotations",
        color: "#ff7a59",
      },
      {
        frame: {
          id: "points",
          pointCount: 1,
          bounds: { min: [0, 0, 0], max: [0, 0, 0] },
          frameId: "map",
          primitives: [
            {
              kind: "points",
              id: "cloud",
              frameId: "map",
              pointCount: 1,
              positions: new Float32Array([0, 0, 0]),
              intensity: null,
              colors: null,
              pointSize: null,
              solidColor: null,
            },
          ],
        },
        streamId: "/lidar",
        color: "#5ec2ff",
      },
    ]);

    expect(merged.frame?.primitives[0].solidColor).toBe("hsl(21deg 74% 60%)");
    expect(merged.frame?.primitives[1].solidColor).toBe("#5ec2ff");
  });
});
