import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import type {
  SceneCubePrimitive,
  SceneEntityVisualization,
  SceneUpdateVisualization,
} from "../../../ir";
import { VISUALIZATION_KIND } from "../../../visualization";
import { prepareImageAnnotations } from "../../../visualization/media-2d/gpu-image-annotation-preparation";
import type { PinholeCameraModel } from "../spatial/camera-geometry/camera-model";
import type { FrameTransformResolver } from "../spatial/frame-transforms/use-frame-transforms";
import type { StreamPlaybackFrame } from "../playback/use-stream-values";
import { projectSceneAnnotationsToImage } from "./project-scene-annotations";

const CAMERA_MODEL: PinholeCameraModel = {
  height: 100,
  kind: "pinhole",
  projection: [100, 0, 50, 0, 0, 100, 50, 0, 0, 0, 1, 0],
  rectification: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  space: "original",
  width: 100,
};

describe("3D scene annotation projection", () => {
  it("projects cuboids into stable, colored GPU image primitives", () => {
    const set = projectSceneAnnotationsToImage({
      cameraFrameId: "camera",
      cameraModel: CAMERA_MODEL,
      imageContentTimeNs: 30n,
      outputHeight: 100,
      outputWidth: 100,
      playbackFrame: playbackFrame(
        entity({
          cubes: [
            cube({
              color: [1, 0.5, 0, 1],
              pose: pose([0, 0, 5]),
            }),
          ],
          frameId: "camera",
          id: "box-1",
          metadata: { classId: "car" },
        }),
      ),
      resolve: missingResolver(),
      stream: "/detections_3d",
    });

    expect(set).not.toBeNull();
    const group = set?.renderMetadata?.lineListGroups[0]?.[0];
    expect(group).toMatchObject({
      color: "#ff8000",
      key: "box-1:cube:0",
      label: "car",
      sceneEntityId: "box-1",
    });
    expect(group?.segments).toHaveLength(12);
    expect(group?.bounds.minX).toBeCloseTo(25);
    expect(group?.bounds.maxX).toBeCloseTo(75);
    expect(group?.bounds.minY).toBeCloseTo(25);
    expect(group?.bounds.maxY).toBeCloseTo(75);

    const prepared = prepareImageAnnotations(set ? [set] : []);
    expect(prepared.segments.count).toBe(12);
    expect(prepared.metadata[0]).toMatchObject({
      color: "#ff8000",
      key: "box-1:cube:0",
      label: "car",
      sceneEntityId: "box-1",
      stream: "/detections_3d",
    });
  });

  it("resolves frame-locked transforms at image content time and scales pixels", () => {
    const resolve = vi.fn<FrameTransformResolver>(() => ({
      sourceFrameId: "lidar",
      status: "resolved",
      targetFrameId: "camera",
      transform: {
        rotation: new THREE.Quaternion(),
        sourceFrameId: "lidar",
        targetFrameId: "camera",
        translation: new THREE.Vector3(0, 0, 5),
      },
    }));
    const set = projectSceneAnnotationsToImage({
      cameraFrameId: "camera",
      cameraModel: CAMERA_MODEL,
      imageContentTimeNs: 30n,
      outputHeight: 200,
      outputWidth: 200,
      playbackFrame: playbackFrame(
        entity({
          cubes: [cube()],
          frameId: "lidar",
          frameLocked: true,
        }),
      ),
      resolve,
      stream: "/detections_3d",
    });

    expect(resolve).toHaveBeenCalledWith("lidar", "camera", 30n);
    const bounds = set?.renderMetadata?.lineListGroups[0]?.[0]?.bounds;
    expect(bounds?.minX).toBeCloseTo(50);
    expect(bounds?.maxX).toBeCloseTo(150);
    expect(bounds?.minY).toBeCloseTo(50);
    expect(bounds?.maxY).toBeCloseTo(150);
  });

  it("preserves source time for non-frame-locked entities", () => {
    const resolve = vi.fn<FrameTransformResolver>(() => ({
      sourceFrameId: "lidar",
      status: "resolved",
      targetFrameId: "camera",
      transform: {
        rotation: new THREE.Quaternion(),
        sourceFrameId: "lidar",
        targetFrameId: "camera",
        translation: new THREE.Vector3(0, 0, 5),
      },
    }));

    projectSceneAnnotationsToImage({
      cameraFrameId: "camera",
      cameraModel: CAMERA_MODEL,
      imageContentTimeNs: 30n,
      outputHeight: 100,
      outputWidth: 100,
      playbackFrame: playbackFrame(
        entity({
          cubes: [cube()],
          frameId: "lidar",
          frameLocked: false,
          timestampNs: 15n,
        }),
      ),
      resolve,
      stream: "/detections_3d",
    });

    expect(resolve).toHaveBeenCalledWith("lidar", "camera", 15n);
  });

  it("clips mixed-validity edges and skips unplaceable entities", () => {
    const straddling = projectSceneAnnotationsToImage({
      cameraFrameId: "camera",
      cameraModel: CAMERA_MODEL,
      imageContentTimeNs: 30n,
      outputHeight: 100,
      outputWidth: 100,
      playbackFrame: playbackFrame(
        entity({
          cubes: [
            cube({
              pose: pose([0, 0, 0.5]),
              size: [0.5, 0.5, 2],
            }),
          ],
          frameId: "camera",
        }),
      ),
      resolve: missingResolver(),
      stream: "/detections_3d",
    });
    const segments =
      straddling?.renderMetadata?.lineListGroups[0]?.[0]?.segments ?? [];
    expect(segments.length).toBeGreaterThan(4);
    expect(
      segments.every((segment) =>
        segment
          .flat()
          .every(
            (coordinate) =>
              Number.isFinite(coordinate) &&
              coordinate >= 0 &&
              coordinate <= 100,
          ),
      ),
    ).toBe(true);

    const unresolved = projectSceneAnnotationsToImage({
      cameraFrameId: "camera",
      cameraModel: CAMERA_MODEL,
      imageContentTimeNs: 30n,
      outputHeight: 100,
      outputWidth: 100,
      playbackFrame: playbackFrame(
        entity({ cubes: [cube()], frameId: "lidar" }),
      ),
      resolve: missingResolver(),
      stream: "/detections_3d",
    });
    expect(unresolved).toBeNull();
  });
});

function cube(overrides: Partial<SceneCubePrimitive> = {}): SceneCubePrimitive {
  return {
    color: null,
    pose: pose([0, 0, 0]),
    size: [2, 2, 2],
    ...overrides,
  };
}

function pose(
  position: readonly [number, number, number],
): SceneCubePrimitive["pose"] {
  return { position, quaternion: [0, 0, 0, 1] };
}

function entity(
  overrides: Partial<SceneEntityVisualization> = {},
): SceneEntityVisualization {
  const cubes = overrides.cubes ?? [];
  return {
    arrowCount: 0,
    arrows: [],
    cubeCount: cubes.length,
    cubes,
    cylinderCount: 0,
    cylinders: [],
    frameLocked: false,
    id: "entity",
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

function playbackFrame(
  ...entities: readonly SceneEntityVisualization[]
): StreamPlaybackFrame<SceneUpdateVisualization> {
  return {
    ageNs: 0n,
    contentTimeNs: 10n,
    frame: {
      deletions: [],
      entities,
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
    },
    requestedTimeNs: 20n,
  };
}

function missingResolver(): FrameTransformResolver {
  return (sourceFrameId, targetFrameId) => ({
    sourceFrameId,
    status: "missing",
    targetFrameId,
  });
}
