import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { createStore, Provider } from "jotai";
import { describe, expect, it } from "vitest";

import { VISUALIZATION_KIND } from "../../../../visualization";
import type {
  PointCloudPanelLayer,
  SceneAnnotationPanelLayer,
} from "../../../../visualization/scene-3d";
import { hoverEchoAtom } from "../../interaction/point-hover/hover-echo";
import {
  toggleSceneEntitySelection,
  useScene3dPickingLayers,
} from "./use-scene-3d-picking-layers";

const POINT_SOURCE = {
  id: "/lidar",
  label: "lidar/top",
  sourceName: "/lidar/top/points",
  type: "point-cloud",
} as const;

describe("scene 3D picking layers", () => {
  it("toggles instance selection and widens it to label scope", () => {
    const entity = {
      frameId: "ego",
      id: "car-1",
      label: "vehicle",
      metadata: { score: 0.9 },
    } as never;
    const selected = toggleSceneEntitySelection(
      null,
      entity,
      "/annotations",
      "car-1",
      false,
    );

    expect(selected).toMatchObject({ entityId: "car-1", scope: "instance" });
    expect(
      toggleSceneEntitySelection(
        selected,
        entity,
        "/annotations",
        "car-1",
        false,
      ),
    ).toBeNull();
    expect(
      toggleSceneEntitySelection(
        selected,
        entity,
        "/annotations",
        "car-1",
        true,
      ),
    ).toMatchObject({ scope: "label" });
  });

  it("publishes an exact-frame 3D point with world and safe metadata", () => {
    const store = createStore();
    const layer = pointCloudLayer(42n);
    const { result, rerender } = renderPickingLayers(store, layer);

    act(() => {
      result.current.hoverablePointCloudLayers[0]?.onHoverPoint?.({
        color: [1, 0, 0],
        pointIndex: 0,
        worldPosition: [11, 12, 13],
      });
    });

    expect(store.get(hoverEchoAtom)).toEqual({
      color: [1, 0, 0],
      contentTimeNs: 42n,
      fields: { intensity: 0.5 },
      frameId: "map",
      kind: "point",
      pointIndex: 0,
      position: [1, 2, 3],
      sourceLabel: "lidar/top",
      sourceName: "/lidar/top/points",
      stream: "/lidar",
      worldFrameId: "map",
      worldPosition: [11, 12, 13],
    });
    expect(result.current.hoverablePointCloudLayers[0]?.hoveredPoint).toEqual({
      color: [1, 0, 0],
      position: [1, 2, 3],
    });

    rerender({ pointLayer: pointCloudLayer(43n) });
    expect(store.get(hoverEchoAtom)).toBeNull();
  });

  it("omits the point marker for image-originated ray correspondence", () => {
    const store = createStore();
    const layer = pointCloudLayer(42n);
    store.set(hoverEchoAtom, {
      color: [1, 0, 0],
      contentTimeNs: 42n,
      fields: {},
      frameId: "map",
      kind: "point",
      pointIndex: 0,
      position: [1, 2, 3],
      source: {
        cameraFrameId: "camera",
        imageContentTimeNs: 21n,
        imageStream: "/camera/image",
        kind: "image-projection",
      },
      stream: "/lidar",
    });

    const { result } = renderPickingLayers(store, layer);

    expect(
      result.current.hoverablePointCloudLayers[0]?.hoveredPoint,
    ).toBeNull();
  });

  it("publishes and consumes scene-entity hover correspondence", () => {
    const store = createStore();
    const layer = sceneAnnotationLayer();
    const wrapper = ({ children }: { readonly children: ReactNode }) =>
      createElement(Provider, { store }, children);
    const { result } = renderHook(
      () =>
        useScene3dPickingLayers({
          pointCloudLayers: [],
          pointCloudSources: [],
          sceneAnnotationLayers: [layer],
          worldFrameId: "map",
        }),
      { wrapper },
    );

    expect(result.current.annotationLayers[0]?.hovered).toBe(false);
    act(() => {
      result.current.annotationLayers[0]?.onHoverEntity?.("car-1");
    });
    expect(store.get(hoverEchoAtom)).toEqual({
      entityId: "car-1",
      kind: "scene-annotation",
      stream: "/detections_3d",
    });
    expect(result.current.annotationLayers[0]?.hovered).toBe(true);

    act(() => {
      result.current.annotationLayers[0]?.onHoverEntity?.(null);
    });
    expect(store.get(hoverEchoAtom)).toBeNull();

    act(() => {
      store.set(hoverEchoAtom, {
        entityId: "car-1",
        kind: "scene-annotation",
        stream: "/detections_3d",
      });
    });
    expect(result.current.annotationLayers[0]?.hovered).toBe(true);
  });
});

function renderPickingLayers(
  store: ReturnType<typeof createStore>,
  layer: PointCloudPanelLayer,
) {
  const wrapper = ({ children }: { readonly children: ReactNode }) =>
    createElement(Provider, { store }, children);
  return renderHook(
    ({ pointLayer }: { readonly pointLayer: PointCloudPanelLayer }) =>
      useScene3dPickingLayers({
        pointCloudLayers: [pointLayer],
        pointCloudSources: [POINT_SOURCE],
        sceneAnnotationLayers: [],
        worldFrameId: "map",
      }),
    { initialProps: { pointLayer: layer }, wrapper },
  );
}

function pointCloudLayer(contentTimeNs: bigint): PointCloudPanelLayer {
  return {
    contentTimeNs,
    frame: {
      coordinateFrameId: "map",
      fields: [],
      kind: VISUALIZATION_KIND.POINT_CLOUD,
      pointCount: 1,
      positions: Float32Array.from([1, 2, 3]),
      scalarFields: [
        { name: "intensity", values: Float32Array.from([0.5]) },
        { name: "invalid", values: Float32Array.from([Number.NaN]) },
      ],
    },
    id: "/lidar",
  };
}

function sceneAnnotationLayer(): SceneAnnotationPanelLayer {
  return {
    frame: {
      deletions: [],
      entities: [
        {
          arrowCount: 0,
          arrows: [],
          cubeCount: 1,
          cubes: [
            {
              color: null,
              pose: {
                position: [0, 0, 5],
                quaternion: [0, 0, 0, 1],
              },
              size: [2, 2, 2],
            },
          ],
          cylinderCount: 0,
          cylinders: [],
          frameLocked: false,
          id: "car-1",
          lineCount: 0,
          lines: [],
          metadata: { label: "car" },
          modelCount: 0,
          models: [],
          sphereCount: 0,
          spheres: [],
          textCount: 0,
          texts: [],
          triangleCount: 0,
          triangles: [],
        },
      ],
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
    },
    id: "/detections_3d:car-1",
    sourceId: "/detections_3d",
  };
}
