import { describe, expect, it } from "vitest";
import * as THREE from "three";

import type { SceneEntityVisualization } from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { cameraPoseForBounds, sceneBoundsForLayers } from "./camera-fit-bounds";
import type { SceneAnnotationPanelLayer } from "./types";

describe("sceneBoundsForLayers", () => {
  it("ignores SceneUpdate text when fitting annotation geometry", () => {
    const entity: SceneEntityVisualization = {
      arrowCount: 0,
      arrows: [],
      cubeCount: 1,
      cubes: [
        {
          color: [0.1, 0.78, 0.95, 1],
          pose: {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1],
          },
          size: [2, 2, 2],
        },
      ],
      cylinderCount: 0,
      cylinders: [],
      frameLocked: false,
      id: "pedestrian-1",
      lineCount: 0,
      lines: [],
      metadata: { classId: "pedestrian", score: "0.8100" },
      modelCount: 0,
      models: [],
      sphereCount: 0,
      spheres: [],
      textCount: 1,
      texts: [
        {
          billboard: true,
          color: [1, 1, 1, 1],
          fontSize: 12,
          pose: {
            position: [1_000, 0, 0],
            quaternion: [0, 0, 0, 1],
          },
          scaleInvariant: true,
          text: "pedestrian 0.81",
        },
      ],
      triangleCount: 0,
      triangles: [],
    };
    const annotationLayer: SceneAnnotationPanelLayer = {
      frame: {
        deletions: [],
        entities: [entity],
        kind: VISUALIZATION_KIND.SCENE_UPDATE,
      },
      id: "/detections",
    };

    const bounds = sceneBoundsForLayers([], [annotationLayer]);

    expect(bounds?.min.toArray()).toEqual([-1, -1, -1]);
    expect(bounds?.max.toArray()).toEqual([1, 1, 1]);
  });
});

describe("cameraPoseForBounds", () => {
  it("uses horizontal FOV for portrait viewports", () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(-5, -2, -1),
      new THREE.Vector3(5, 2, 1),
    );
    const portrait = cameraPoseForBounds(bounds, 50, 0.5);
    const square = cameraPoseForBounds(bounds, 50, 1);
    const landscape = cameraPoseForBounds(bounds, 50, 2);
    if (!portrait || !square || !landscape) {
      throw new Error("expected fitted camera poses");
    }

    expect(cameraPoseDistance(portrait)).toBeGreaterThan(
      cameraPoseDistance(square),
    );
    // Vertical FOV remains the tighter axis once the viewport is square or
    // wider, so landscape does not over-zoom the scene.
    expect(cameraPoseDistance(landscape)).toBeCloseTo(
      cameraPoseDistance(square),
    );
  });
});

function cameraPoseDistance(pose: {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}): number {
  return new THREE.Vector3(...pose.position).distanceTo(
    new THREE.Vector3(...pose.target),
  );
}
