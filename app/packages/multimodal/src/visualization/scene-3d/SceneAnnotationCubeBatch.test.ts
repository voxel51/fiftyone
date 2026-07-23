import { act, cleanup, renderHook } from "@testing-library/react";
import type { ThreeEvent } from "@react-three/fiber";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import type {
  SceneCubePrimitive,
  SceneEntityVisualization,
  SceneTextPrimitive,
} from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import {
  applySceneCubeBatchRecords,
  applySelectedSceneCubeBatchRecords,
  buildSceneAnnotationCubeRenderPlan,
  createSceneCubeBatchResource,
  createSelectedSceneCubeBatchResource,
  normalCubeIndexForEvent,
  selectedCubeIndexForEvent,
  useCubeBatchInteraction,
} from "./SceneAnnotationCubeBatch";
import { POINT_PICK_BLOCKING_USER_DATA } from "./point-picking";
import type { SceneAnnotationPanelLayer } from "./types";

const disposableResources: Array<{
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly mesh?: THREE.InstancedMesh;
}> = [];

afterEach(() => {
  cleanup();
  for (const resource of disposableResources.splice(0)) {
    resource.mesh?.dispose();
    resource.geometry.dispose();
    resource.material.dispose();
  }
  vi.restoreAllMocks();
});

describe("buildSceneAnnotationCubeRenderPlan", () => {
  it("batches cube-only entities across layers without residual React layers", () => {
    const first = annotationLayer("/boxes-a", sceneEntity("a"));
    const second = annotationLayer("/boxes-b", sceneEntity("b"), {
      onHoverEntity: () => undefined,
      onSelectEntity: () => undefined,
    });

    const plan = buildSceneAnnotationCubeRenderPlan([first, second]);

    expect(plan.normalPassive.map((record) => record.key)).toEqual([
      "/boxes-a:a:cube:0",
    ]);
    expect(plan.normalInteractive.map((record) => record.key)).toEqual([
      "/boxes-b:b:cube:0",
    ]);
    expect(plan.residualLayers).toEqual([]);
    expect(plan.selectedInteractive).toEqual([]);
    expect(plan.selectedPassive).toEqual([]);
  });

  it("keeps tooltip-only text out of the residual render path", () => {
    const text: SceneTextPrimitive = {
      billboard: true,
      color: [1, 1, 1, 1],
      fontSize: 1,
      pose: identityPose(),
      scaleInvariant: false,
      text: "car",
    };
    const selected = annotationLayer(
      "/boxes",
      sceneEntity("selected", { textCount: 1, texts: [text] }),
      { highlighted: true, onHoverEntity: () => undefined },
    );

    const plan = buildSceneAnnotationCubeRenderPlan([selected]);

    expect(plan.selectedInteractive).toHaveLength(1);
    expect(plan.normalInteractive).toEqual([]);
    expect(plan.normalPassive).toEqual([]);
    expect(plan.residualLayers).toEqual([]);
  });

  it("drops invalid cubes instead of mounting the old empty cube subtree", () => {
    const invalid = annotationLayer(
      "/boxes",
      sceneEntity("invalid", {
        cubes: [cube({ size: [0, 1, 1] })],
      }),
    );

    const plan = buildSceneAnnotationCubeRenderPlan([invalid]);

    expect(plan.normalPassive).toEqual([]);
    expect(plan.residualLayers).toEqual([]);
  });
});

describe("scene cube instance buffers", () => {
  it("composes frame, pose, and size into one instance matrix with per-instance RGBA", () => {
    const layer = annotationLayer(
      "/boxes",
      sceneEntity("box", {
        cubes: [
          cube({
            color: [1, 0.25, 0.5, 0.8],
            pose: {
              position: [1, 2, 3],
              quaternion: [0, 0, 0, 1],
            },
            size: [4, 5, 6],
          }),
        ],
      }),
      {
        frameTransform: {
          rotation: new THREE.Quaternion(0, 0, 0, 1),
          sourceFrameId: "lidar",
          targetFrameId: "map",
          translation: new THREE.Vector3(10, 0, 0),
        },
      },
    );
    const plan = buildSceneAnnotationCubeRenderPlan([layer]);
    const resource = createSceneCubeBatchResource(1);
    disposableResources.push(resource);

    applySceneCubeBatchRecords(resource, plan.normalPassive);

    const matrix = new THREE.Matrix4().fromArray(
      resource.mesh.instanceMatrix.array,
    );
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);

    expect(resource.mesh.count).toBe(1);
    expect(position.toArray()).toEqual([11, 2, 3]);
    expect(quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(scale.toArray()).toEqual([4, 5, 6]);
    expect(Array.from(resource.colorAttribute.array.slice(0, 3))).toEqual([
      1, 0.25, 0.5,
    ]);
    expect(resource.opacityAttribute.getX(0)).toBeCloseTo(0.8);
    expect(resource.material.colorNode).not.toBeNull();
    expect(resource.material.opacityNode).not.toBeNull();
  });

  it("writes hovered emphasis into the same instance attributes", () => {
    const layer = annotationLayer("/boxes", sceneEntity("box"));
    const plan = buildSceneAnnotationCubeRenderPlan([layer]);
    const record = plan.normalPassive[0];
    const resource = createSceneCubeBatchResource(1);
    disposableResources.push(resource);

    applySceneCubeBatchRecords(resource, [record], record.key);

    expect(Array.from(resource.colorAttribute.array.slice(0, 3))).toEqual([
      1, 1, 1,
    ]);
    expect(resource.opacityAttribute.getX(0)).toBe(1);
  });

  it("keeps solid-box instance raycasts and reports the owning instance id", () => {
    const layer = annotationLayer("/boxes", sceneEntity("box"));
    const plan = buildSceneAnnotationCubeRenderPlan([layer]);
    const resource = createSceneCubeBatchResource(1);
    disposableResources.push(resource);
    applySceneCubeBatchRecords(resource, plan.normalPassive);
    resource.mesh.updateMatrixWorld(true);

    const intersections = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 5),
      new THREE.Vector3(0, 0, -1),
    ).intersectObject(resource.mesh);

    expect(intersections.length).toBeGreaterThan(0);
    expect(intersections[0].instanceId).toBe(0);

    const movedLayer = annotationLayer(
      "/boxes",
      sceneEntity("box", {
        cubes: [
          cube({
            pose: {
              position: [100, 0, 0],
              quaternion: [0, 0, 0, 1],
            },
          }),
        ],
      }),
    );
    const moved = buildSceneAnnotationCubeRenderPlan([movedLayer]);
    applySceneCubeBatchRecords(resource, moved.normalPassive);

    expect(resource.mesh.boundingSphere).toBeNull();
    const movedIntersections = new THREE.Raycaster(
      new THREE.Vector3(100, 0, 5),
      new THREE.Vector3(0, 0, -1),
    ).intersectObject(resource.mesh);
    expect(movedIntersections.length).toBeGreaterThan(0);
    expect(movedIntersections[0].instanceId).toBe(0);
  });
});

describe("scene cube batch interaction", () => {
  it("hovers instances without rerendering and transfers hover between layers", () => {
    const firstHover = vi.fn();
    const secondHover = vi.fn();
    const records = buildSceneAnnotationCubeRenderPlan([
      annotationLayer("/boxes-a", sceneEntity("a"), {
        onHoverEntity: firstHover,
      }),
      annotationLayer("/boxes-b", sceneEntity("b"), {
        onHoverEntity: secondHover,
      }),
    ]).normalInteractive;
    const object = new THREE.Object3D();
    const onHoverChange = vi.fn();
    let renderCount = 0;
    const { result, unmount } = renderHook(() => {
      renderCount++;
      return useCubeBatchInteraction({
        enabled: true,
        object,
        onHoverChange,
        resolveIndex: normalCubeIndexForEvent,
      });
    });

    act(() => {
      result.current.commitRecords(records);
    });
    expect(object.userData).toEqual(POINT_PICK_BLOCKING_USER_DATA);

    const firstEvent = cubePointerEvent({ instanceId: 0 });
    act(() => {
      result.current.onPointerMove(firstEvent.event);
    });
    expect(firstEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(firstHover).toHaveBeenCalledWith("a");
    expect(document.body.style.cursor).toBe("pointer");

    const secondEvent = cubePointerEvent({ instanceId: 1 });
    act(() => {
      result.current.onPointerMove(secondEvent.event);
    });
    expect(firstHover).toHaveBeenLastCalledWith(null);
    expect(secondHover).toHaveBeenCalledWith("b");
    expect(onHoverChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: "/boxes-a:a:cube:0" }),
      expect.objectContaining({ key: "/boxes-b:b:cube:0" }),
    );

    act(() => {
      result.current.onPointerOut(cubePointerEvent().event);
    });
    expect(secondHover).toHaveBeenLastCalledWith(null);
    expect(document.body.style.cursor).toBe("");
    expect(renderCount).toBe(1);

    unmount();
    expect(firstHover).toHaveBeenCalledTimes(2);
    expect(secondHover).toHaveBeenCalledTimes(2);
  });

  it("selects the owning instance, forwards shift, and ignores drags", () => {
    const onSelectEntity = vi.fn();
    const records = buildSceneAnnotationCubeRenderPlan([
      annotationLayer("/boxes", sceneEntity("box"), { onSelectEntity }),
    ]).normalInteractive;
    const object = new THREE.Object3D();
    const { result } = renderHook(() =>
      useCubeBatchInteraction({
        enabled: true,
        object,
        onHoverChange: vi.fn(),
        resolveIndex: normalCubeIndexForEvent,
      }),
    );
    act(() => {
      result.current.commitRecords(records);
    });

    const click = cubeClickEvent({ instanceId: 0, shiftKey: true });
    act(() => {
      result.current.onClick(click.event);
    });
    expect(click.stopPropagation).toHaveBeenCalledOnce();
    expect(onSelectEntity).toHaveBeenCalledWith("box", { shiftKey: true });

    const drag = cubeClickEvent({ delta: 10, instanceId: 0 });
    act(() => {
      result.current.onClick(drag.event);
    });
    expect(drag.stopPropagation).not.toHaveBeenCalled();
    expect(onSelectEntity).toHaveBeenCalledTimes(1);
  });

  it("clears hover and event blocking when scene picking is disabled", () => {
    const onHoverEntity = vi.fn();
    const records = buildSceneAnnotationCubeRenderPlan([
      annotationLayer("/boxes", sceneEntity("box"), { onHoverEntity }),
    ]).normalInteractive;
    const object = new THREE.Object3D();
    const onHoverChange = vi.fn();
    const { rerender, result } = renderHook(
      ({ enabled }) =>
        useCubeBatchInteraction({
          enabled,
          object,
          onHoverChange,
          resolveIndex: normalCubeIndexForEvent,
        }),
      { initialProps: { enabled: true } },
    );
    act(() => {
      result.current.commitRecords(records);
      result.current.onPointerMove(cubePointerEvent({ instanceId: 0 }).event);
    });

    rerender({ enabled: false });

    expect(result.current.enabled).toBe(false);
    expect(onHoverEntity).toHaveBeenLastCalledWith(null);
    expect(onHoverChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: "/boxes:box:cube:0" }),
      null,
    );
    expect(object.userData).toEqual({});
    expect(document.body.style.cursor).toBe("");
  });
});

describe("selected scene cube buffers", () => {
  it("writes clean transformed 12-edge boxes into one dashed line draw", () => {
    const layer = annotationLayer(
      "/boxes",
      sceneEntity("box", {
        cubes: [
          cube({
            pose: {
              position: [1, 2, 3],
              quaternion: [0, 0, 0, 1],
            },
            size: [4, 5, 6],
          }),
        ],
      }),
      {
        frameTransform: {
          rotation: new THREE.Quaternion(0, 0, 0, 1),
          sourceFrameId: "lidar",
          targetFrameId: "map",
          translation: new THREE.Vector3(10, 0, 0),
        },
        highlighted: true,
      },
    );
    const plan = buildSceneAnnotationCubeRenderPlan([layer]);
    const resource = createSelectedSceneCubeBatchResource(1);
    disposableResources.push(resource);

    applySelectedSceneCubeBatchRecords(resource, plan.selectedPassive);

    expect(resource.geometry.drawRange.count).toBe(24);
    expect(Array.from(resource.positions.array.slice(0, 6))).toEqual([
      9, -0.5, 0, 13, -0.5, 0,
    ]);
    expect(Array.from(resource.lineDistances.array.slice(0, 2))).toEqual([
      0, 4,
    ]);
  });

  it("maps a dashed-edge ray hit back to the selected box for clicking", () => {
    const firstSelect = vi.fn();
    const secondSelect = vi.fn();
    const records = buildSceneAnnotationCubeRenderPlan([
      annotationLayer("/boxes-a", sceneEntity("a"), {
        highlighted: true,
        onSelectEntity: firstSelect,
      }),
      annotationLayer(
        "/boxes-b",
        sceneEntity("b", {
          cubes: [
            cube({
              pose: {
                position: [10, 0, 0],
                quaternion: [0, 0, 0, 1],
              },
            }),
          ],
        }),
        { highlighted: true, onSelectEntity: secondSelect },
      ),
    ]).selectedInteractive;
    const resource = createSelectedSceneCubeBatchResource(2);
    disposableResources.push(resource);
    applySelectedSceneCubeBatchRecords(resource, records);
    resource.lines.updateMatrixWorld(true);

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(10.5, -0.5, 5),
      new THREE.Vector3(0, 0, -1),
    );
    raycaster.params.Line.threshold = 0.01;
    const intersection = raycaster.intersectObject(resource.lines)[0];
    expect(intersection?.index).toBeGreaterThanOrEqual(24);

    const { result } = renderHook(() =>
      useCubeBatchInteraction({
        enabled: true,
        object: resource.lines,
        onHoverChange: vi.fn(),
        resolveIndex: selectedCubeIndexForEvent,
      }),
    );
    act(() => {
      result.current.commitRecords(records);
    });
    const click = cubeClickEvent({
      index: intersection.index,
      shiftKey: false,
    });
    act(() => {
      result.current.onClick(click.event);
    });

    expect(click.stopPropagation).toHaveBeenCalledOnce();
    expect(firstSelect).not.toHaveBeenCalled();
    expect(secondSelect).toHaveBeenCalledWith("b", { shiftKey: false });
  });
});

function cubePointerEvent(
  overrides: {
    readonly index?: number;
    readonly instanceId?: number;
  } = {},
) {
  const stopPropagation = vi.fn();
  return {
    event: {
      ...overrides,
      stopPropagation,
    } as unknown as ThreeEvent<PointerEvent>,
    stopPropagation,
  };
}

function cubeClickEvent(
  overrides: {
    readonly delta?: number;
    readonly index?: number;
    readonly instanceId?: number;
    readonly shiftKey?: boolean;
  } = {},
) {
  const stopPropagation = vi.fn();
  const { delta = 0, shiftKey = false, ...intersection } = overrides;
  return {
    event: {
      ...intersection,
      delta,
      nativeEvent: { shiftKey },
      stopPropagation,
    } as unknown as ThreeEvent<MouseEvent>,
    stopPropagation,
  };
}

function annotationLayer(
  id: string,
  entity: SceneEntityVisualization,
  overrides: Partial<SceneAnnotationPanelLayer> = {},
): SceneAnnotationPanelLayer {
  return {
    frame: {
      deletions: [],
      entities: [entity],
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
    },
    id,
    ...overrides,
  };
}

function sceneEntity(
  id: string,
  overrides: Partial<SceneEntityVisualization> = {},
): SceneEntityVisualization {
  return {
    arrowCount: 0,
    arrows: [],
    cubeCount: 1,
    cubes: [cube()],
    cylinderCount: 0,
    cylinders: [],
    frameLocked: false,
    id,
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

function cube(overrides: Partial<SceneCubePrimitive> = {}): SceneCubePrimitive {
  return {
    color: [0.1, 0.78, 0.95, 1],
    pose: identityPose(),
    size: [1, 1, 1],
    ...overrides,
  };
}

function identityPose() {
  return {
    position: [0, 0, 0] as const,
    quaternion: [0, 0, 0, 1] as const,
  };
}
