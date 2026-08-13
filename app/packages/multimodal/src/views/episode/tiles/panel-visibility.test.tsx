import { act, renderHook } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneSource } from "../../../ir";
import {
  __resetSidebarPreferencesForTests,
  SIDEBAR_PREFERENCES_STORAGE_KEY,
  updateSidebarPreferences,
} from "../settings/sidebar-preferences";
import { semanticSourceKey } from "../settings/semantic-source";
import {
  PanelVisibilityProvider,
  readScene3dTileVisibility,
  useImageTile3dLabelProjection,
  useImageTileLabelStreams,
  useImageTilePointCloudProjection,
  useSidebarPreferencesState,
  writeScene3dTileVisibility,
} from "./panel-visibility";

let tileId = "image-1";
vi.mock("@fiftyone/tiling", () => ({ useTileId: () => tileId }));

const source = (id: string, type: string, sourceName: string): SceneSource => ({
  id,
  label: sourceName,
  sourceName,
  type,
});

const firstSources = [
  source("10", "image", "/camera/front"),
  source("11", "image-annotation", "/camera/front/labels"),
  source("12", "point-cloud", "/lidar"),
  source("13", "scene-annotation", "/boxes"),
];
const shiftedSources = firstSources.map((item, index) => ({
  ...item,
  id: String(50 + index),
}));

describe("dataset-owned panel preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetSidebarPreferencesForTests();
    tileId = "image-1";
  });

  it("persists semantic 3D visibility per scope and tile", () => {
    tileId = "3d-1";
    const cloudKey = semanticSourceKey(firstSources[2]);
    writeScene3dTileVisibility("dataset-a", tileId, {
      cameraSelectionCustomized: false,
      enabledSourceKeys: [cloudKey],
      primarySourceKey: cloudKey,
    });

    expect(readScene3dTileVisibility("dataset-a", tileId)).toMatchObject({
      enabledSourceKeys: [cloudKey],
      primarySourceKey: cloudKey,
    });
    expect(readScene3dTileVisibility("dataset-b", tileId)).toBeNull();
    expect(readScene3dTileVisibility("dataset-a", "3d-2")).toBeNull();
  });

  it("keeps mounted scope state reactive to domain-level writes", () => {
    const mounted = renderHook(
      () => useSidebarPreferencesState()[0].appearance.pointCloudPointSize,
      { wrapper: wrapper("dataset-a", firstSources) },
    );

    act(() => {
      updateSidebarPreferences("dataset-a", (current) => ({
        ...current,
        appearance: { ...current.appearance, pointCloudPointSize: 6 },
      }));
    });

    expect(mounted.result.current).toBe(6);
  });

  it("restores 2D labels after every runtime channel id changes", () => {
    const first = renderHook(
      () => useImageTileLabelStreams(firstSources[0].id),
      { wrapper: wrapper("dataset-a", firstSources) },
    );
    act(() => first.result.current.setLabelStreams([firstSources[1].id]));
    expect(first.result.current.labelStreams).toEqual(["11"]);
    first.unmount();

    const shifted = renderHook(
      () => useImageTileLabelStreams(shiftedSources[0].id),
      { wrapper: wrapper("dataset-a", shiftedSources) },
    );
    expect(shifted.result.current.labelStreams).toEqual(["51"]);
  });

  it("persists point-cloud projections across remounts and reload storage", () => {
    const first = renderHook(() => useImageTilePointCloudProjection("10"), {
      wrapper: wrapper("dataset-a", firstSources),
    });
    act(() =>
      first.result.current.setProjection({
        enabled: true,
        pointSize: 8,
        streams: ["12"],
      }),
    );
    first.unmount();

    expect(
      localStorage.getItem(SIDEBAR_PREFERENCES_STORAGE_KEY),
    ).not.toBeNull();
    expect(sessionStorage.length).toBe(0);
    const restored = renderHook(() => useImageTilePointCloudProjection("50"), {
      wrapper: wrapper("dataset-a", shiftedSources),
    });
    expect(restored.result.current.projection).toEqual({
      enabled: true,
      pointSize: 8,
      streams: ["52"],
    });
  });

  it("persists projected 3D labels without leaking into another dataset", () => {
    const first = renderHook(() => useImageTile3dLabelProjection("10"), {
      wrapper: wrapper("dataset-a", firstSources),
    });
    act(() =>
      first.result.current.setProjection({
        enabled: true,
        interpolate: true,
        streams: ["13"],
      }),
    );
    first.unmount();

    const restored = renderHook(() => useImageTile3dLabelProjection("50"), {
      wrapper: wrapper("dataset-a", shiftedSources),
    });
    expect(restored.result.current.projection).toEqual({
      enabled: true,
      interpolate: true,
      streams: ["53"],
    });

    const isolated = renderHook(() => useImageTile3dLabelProjection("50"), {
      wrapper: wrapper("dataset-b", shiftedSources),
    });
    expect(isolated.result.current.projection.enabled).toBe(false);
  });

  it("preserves the explicit all-compatible-sources projection intent", () => {
    const pointCloud = renderHook(
      () => useImageTilePointCloudProjection("10"),
      { wrapper: wrapper("dataset-a", firstSources) },
    );
    act(() =>
      pointCloud.result.current.setProjection({ enabled: true, streams: null }),
    );
    expect(pointCloud.result.current.projection).toMatchObject({
      enabled: true,
      streams: null,
    });

    const labels = renderHook(() => useImageTile3dLabelProjection("10"), {
      wrapper: wrapper("dataset-a", firstSources),
    });
    act(() =>
      labels.result.current.setProjection({ enabled: true, streams: null }),
    );
    expect(labels.result.current.projection).toMatchObject({
      enabled: true,
      streams: null,
    });
  });

  it("retains curated projection streams while a layer is disabled", () => {
    const labels = renderHook(() => useImageTile3dLabelProjection("10"), {
      wrapper: wrapper("dataset-a", firstSources),
    });
    act(() =>
      labels.result.current.setProjection({
        enabled: true,
        streams: ["13"],
      }),
    );
    act(() => labels.result.current.setProjection({ enabled: false }));
    labels.unmount();

    const restoredLabels = renderHook(
      () => useImageTile3dLabelProjection("50"),
      { wrapper: wrapper("dataset-a", shiftedSources) },
    );
    expect(restoredLabels.result.current.projection).toMatchObject({
      enabled: false,
      streams: ["53"],
    });
    act(() => restoredLabels.result.current.setProjection({ enabled: true }));
    expect(restoredLabels.result.current.projection).toMatchObject({
      enabled: true,
      streams: ["53"],
    });

    const pointCloud = renderHook(
      () => useImageTilePointCloudProjection("50"),
      { wrapper: wrapper("dataset-a", shiftedSources) },
    );
    act(() =>
      pointCloud.result.current.setProjection({
        enabled: true,
        streams: ["52"],
      }),
    );
    act(() => pointCloud.result.current.setProjection({ enabled: false }));
    pointCloud.unmount();

    const restoredPointCloud = renderHook(
      () => useImageTilePointCloudProjection("10"),
      { wrapper: wrapper("dataset-a", firstSources) },
    );
    expect(restoredPointCloud.result.current.projection).toMatchObject({
      enabled: false,
      streams: ["12"],
    });
    act(() =>
      restoredPointCloud.result.current.setProjection({ enabled: true }),
    );
    expect(restoredPointCloud.result.current.projection).toMatchObject({
      enabled: true,
      streams: ["12"],
    });
  });
});

function wrapper(scopeKey: string, sources: readonly SceneSource[]) {
  return function PanelVisibilityTestWrapper({
    children,
  }: {
    readonly children: React.ReactNode;
  }) {
    return (
      <PanelVisibilityProvider scopeKey={scopeKey} sources={sources}>
        {children}
      </PanelVisibilityProvider>
    );
  };
}
