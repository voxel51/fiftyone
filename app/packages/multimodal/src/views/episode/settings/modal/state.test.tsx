import { act, cleanup, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SceneSource } from "../../../../ir";
import { readSidebarPreferences } from "../sidebar-preferences";
import { SidebarPreferencesProvider } from "../sidebar-preferences-context";
import { semanticSourceKey } from "../semantic-source";
import {
  DEFAULT_IMAGE_PROJECTION,
  DEFAULT_POINT_CLOUD_POINT_SIZE,
  DEFAULT_REFERENCE_GRID,
  MAX_POINT_CLOUD_POINT_SIZE,
  defaultPointCloudColorForIndex,
  defaultPointCloudColorForSource,
  useImageProjection,
  useImageProjectionSettingsByStream,
  usePinholeCameraSettings,
  usePointCloudStyleSettings,
  useReferenceGridSettings,
  useSceneBackgroundSettings,
} from "./state";

describe("dataset-owned episode modal settings", () => {
  beforeEach(() => localStorage.clear());

  afterEach(cleanup);

  it("assigns stable point-cloud colormaps", () => {
    expect(defaultPointCloudColorForIndex(0).colormap).toBe("coolwarm");
    expect(defaultPointCloudColorForIndex(1).colormap).toBe("grayscale");
    expect(defaultPointCloudColorForIndex(Number.NaN).colormap).toBe(
      "coolwarm",
    );

    const sources = [
      { id: "40", label: "radar", sourceName: "/radar/front" },
      { id: "41", label: "points", sourceName: "/lidar/top" },
      { id: "42", label: "lidar left", sourceName: "/lidar/left" },
    ];
    expect(defaultPointCloudColorForSource(sources[0], sources).colormap).toBe(
      "coolwarm",
    );
    expect(defaultPointCloudColorForSource(sources[1], sources).colormap).toBe(
      "turbo",
    );
    expect(defaultPointCloudColorForSource(sources[2], sources).colormap).toBe(
      "grayscale",
    );
  });

  it("updates appearance through the mounted dataset scope", () => {
    const { result } = renderHook(
      () => ({
        pinhole: usePinholeCameraSettings(),
        pointCloud: usePointCloudStyleSettings(),
        referenceGrid: useReferenceGridSettings(),
        sceneBackground: useSceneBackgroundSettings(),
      }),
      { wrapper: settingsWrapper("dataset-a") },
    );

    act(() => {
      result.current.pinhole.setPinholeCamera({
        imagePlaneDepthM: 6,
        opacityPercent: 35,
      });
      result.current.referenceGrid.setReferenceGrid({
        enabled: false,
        spacingM: 10,
      });
      result.current.sceneBackground.setSceneBackground({ mode: "studio" });
      result.current.pointCloud.setShowPointCloudColorLegend(true);
      result.current.pointCloud.setPointCloudPointSize(4.5);
    });

    expect(result.current.pinhole.pinholeCamera).toEqual({
      imagePlaneDepthM: 6,
      opacityPercent: 35,
    });
    expect(result.current.referenceGrid.referenceGrid).toEqual({
      enabled: false,
      opacityPercent: DEFAULT_REFERENCE_GRID.opacityPercent,
      spacingM: 10,
    });
    expect(result.current.sceneBackground.sceneBackground.mode).toBe("studio");
    expect(result.current.pointCloud).toMatchObject({
      pointCloudPointSize: 4.5,
      showPointCloudColorLegend: true,
    });
    expect(readSidebarPreferences("dataset-a").appearance).toMatchObject({
      pinholeCamera: { imagePlaneDepthM: 6, opacityPercent: 35 },
      pointCloudPointSize: 4.5,
      referenceGrid: { enabled: false, spacingM: 10 },
      sceneBackground: { mode: "studio" },
      showPointCloudColorLegend: true,
    });
  });

  it("isolates settings by dataset and clamps point size", () => {
    const datasetA = renderHook(() => usePointCloudStyleSettings(), {
      wrapper: settingsWrapper("dataset-a"),
    });
    act(() => {
      datasetA.result.current.setPointCloudColor("10", { rangeMax: 9 });
      datasetA.result.current.setPointCloudPointSize(42);
    });
    expect(datasetA.result.current.pointCloudColors["10"]).toMatchObject({
      rangeMax: 9,
    });
    expect(datasetA.result.current.pointCloudPointSize).toBe(
      MAX_POINT_CLOUD_POINT_SIZE,
    );

    const datasetB = renderHook(() => usePointCloudStyleSettings(), {
      wrapper: settingsWrapper("dataset-b"),
    });
    expect(datasetB.result.current.pointCloudColors["10"]).toBeUndefined();
    expect(datasetB.result.current.pointCloudPointSize).toBe(
      DEFAULT_POINT_CLOUD_POINT_SIZE,
    );
  });

  it("remaps point-cloud styles across runtime channel ids", () => {
    const first = renderHook(() => usePointCloudStyleSettings(), {
      wrapper: settingsWrapper("dataset-a", "10"),
    });
    act(() =>
      first.result.current.setPointCloudColor("10", { colorBy: "height" }),
    );
    first.unmount();

    const shifted = renderHook(() => usePointCloudStyleSettings(), {
      wrapper: settingsWrapper("dataset-a", "80"),
    });
    expect(shifted.result.current.pointCloudColors["80"]).toMatchObject({
      colorBy: "height",
    });
  });

  it("remaps image geometry, calibration, and projection streams", () => {
    const first = renderHook(() => useImageProjection("20"), {
      wrapper: cameraSettingsWrapper("dataset-a", "20", "21", "22"),
    });
    act(() =>
      first.result.current.setProjection({
        calibrationStream: "21",
        display: "rectified",
        enabled: true,
        geometry: "rectified",
        streams: ["22"],
      }),
    );
    first.unmount();

    const shifted = renderHook(() => useImageProjection("80"), {
      wrapper: cameraSettingsWrapper("dataset-a", "80", "81", "82"),
    });
    expect(shifted.result.current.projection).toMatchObject({
      calibrationStream: "81",
      display: "rectified",
      enabled: true,
      geometry: "rectified",
      streams: ["82"],
    });
  });

  it("reports the same scoped projection to single and aggregate consumers", () => {
    const { result } = renderHook(
      () => ({
        aggregate: useImageProjectionSettingsByStream()["20"],
        single: useImageProjection("20"),
      }),
      { wrapper: cameraSettingsWrapper("dataset-a", "20", "21", "22") },
    );

    expect(result.current.single.projection).toEqual(DEFAULT_IMAGE_PROJECTION);
    act(() =>
      result.current.single.setProjection({ enabled: true, streams: ["22"] }),
    );
    expect(result.current.aggregate).toEqual(result.current.single.projection);
  });

  it("retains the semantic stream selection while projection is disabled", () => {
    const first = renderHook(() => useImageProjection("20"), {
      wrapper: cameraSettingsWrapper("dataset-a", "20", "21", "22"),
    });
    act(() =>
      first.result.current.setProjection({ enabled: true, streams: ["22"] }),
    );
    act(() => first.result.current.setProjection({ enabled: false }));
    first.unmount();

    const shifted = renderHook(() => useImageProjection("80"), {
      wrapper: cameraSettingsWrapper("dataset-a", "80", "81", "82"),
    });
    expect(shifted.result.current.projection).toMatchObject({
      enabled: false,
      streams: ["82"],
    });
    act(() => shifted.result.current.setProjection({ enabled: true }));
    expect(shifted.result.current.projection).toMatchObject({
      enabled: true,
      streams: ["82"],
    });
  });

  it("stores semantic identities instead of runtime channel ids", () => {
    const { result } = renderHook(() => usePointCloudStyleSettings(), {
      wrapper: settingsWrapper("dataset-a", "99"),
    });
    act(() =>
      result.current.setPointCloudColor("99", { uniformColor: "#00ff88" }),
    );

    const key = semanticSourceKey({
      sourceName: "/lidar_top",
      type: "point-cloud",
    });
    expect(readSidebarPreferences("dataset-a").pointCloudColors).toEqual({
      [key]: expect.objectContaining({ uniformColor: "#00ff88" }),
    });
  });
});

function settingsWrapper(scopeKey: string, runtimeId = "10") {
  return wrapper(scopeKey, [source(runtimeId, "point-cloud", "/lidar_top")]);
}

function cameraSettingsWrapper(
  scopeKey: string,
  imageId: string,
  calibrationId: string,
  pointCloudId: string,
) {
  return wrapper(scopeKey, [
    source(imageId, "image", "/camera/front"),
    source(calibrationId, "camera-calibration", "/camera/front/camera_info"),
    source(pointCloudId, "point-cloud", "/lidar_top"),
  ]);
}

function wrapper(scopeKey: string, sources: readonly SceneSource[]) {
  return function SettingsTestWrapper({
    children,
  }: {
    readonly children: React.ReactNode;
  }) {
    return (
      <SidebarPreferencesProvider scopeKey={scopeKey} sources={sources}>
        {children}
      </SidebarPreferencesProvider>
    );
  };
}

function source(id: string, type: string, sourceName: string): SceneSource {
  return { id, label: sourceName, sourceName, type };
}
