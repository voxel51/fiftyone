import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { createStore, Provider } from "jotai";
import { describe, expect, it } from "vitest";

import { VISUALIZATION_KIND } from "../../../../visualization";
import type { PointCloudPanelLayer } from "../../../../visualization/scene-3d";
import { hoverEchoAtom } from "../../interaction/point-hover/hover-echo";
import {
  toggleSceneEntitySelection,
  useScene3dPickingLayers,
} from "./use-scene-3d-picking-layers";

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
    const wrapper = ({ children }: { readonly children: ReactNode }) =>
      createElement(Provider, { store }, children);
    const { result, rerender } = renderHook(
      ({ pointLayer }: { readonly pointLayer: PointCloudPanelLayer }) =>
        useScene3dPickingLayers({
          pointCloudLayers: [pointLayer],
          pointCloudSources: [
            {
              id: "/lidar",
              label: "lidar/top",
              sourceName: "/lidar/top/points",
              type: "point-cloud",
            },
          ],
          sceneAnnotationLayers: [],
          worldFrameId: "map",
        }),
      { initialProps: { pointLayer: layer }, wrapper },
    );

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

    rerender({ pointLayer: pointCloudLayer(43n) });
    expect(store.get(hoverEchoAtom)).toBeNull();
  });
});

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
