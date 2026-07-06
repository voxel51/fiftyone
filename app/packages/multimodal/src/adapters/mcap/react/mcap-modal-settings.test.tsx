import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MCAP_FIDELITY_MODE,
  DEFAULT_MCAP_PINHOLE_CAMERA,
  DEFAULT_MCAP_POINT_CLOUD_COLOR,
  DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
  DEFAULT_MCAP_REFERENCE_GRID,
  DEFAULT_MCAP_SCENE_BACKGROUND,
  DEFAULT_MCAP_TEMPORAL_POLICY,
  MAX_MCAP_POINT_CLOUD_POINT_SIZE,
  McapModalSettingsProvider,
  defaultMcapPointCloudColorForIndex,
  defaultMcapPointCloudColorForSource,
  readMcapModalSettings,
  useMcapModalSettings,
  writeMcapModalSettings,
} from "./mcap-modal-settings";

const STORAGE_KEY = "fiftyone.mcap.modal-settings";

describe("mcap-modal-settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it("returns default settings when nothing is stored", () => {
    expect(readMcapModalSettings()).toEqual({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });
  });

  it("round-trips fidelity mode and image label topics", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: "as-recorded",
      imageLabelTopics: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      pinholeCamera: { imagePlaneDepthM: 4, opacityPercent: 45 },
      pointCloudColors: {},
      pointCloudPointSize: 4,
      referenceGrid: { enabled: false, opacityPercent: 50, spacingM: 5 },
      sceneBackground: { mode: "abyss", solidColor: "#112233" },
      showPointCloudColorLegend: true,
      temporalPolicy: {
        boundaryClampMs: 0,
        maxInterpolationGapMs: 500,
        staleMediaWarningMs: 250,
        transformGapWarningMs: 1500,
      },
    });

    expect(readMcapModalSettings()).toEqual({
      version: 2,
      fidelityMode: "as-recorded",
      imageLabelTopics: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      pinholeCamera: { imagePlaneDepthM: 4, opacityPercent: 45 },
      pointCloudColors: {},
      pointCloudPointSize: 4,
      referenceGrid: { enabled: false, opacityPercent: 50, spacingM: 5 },
      sceneBackground: { mode: "abyss", solidColor: "#112233" },
      showPointCloudColorLegend: true,
      temporalPolicy: {
        boundaryClampMs: 0,
        maxInterpolationGapMs: 500,
        staleMediaWarningMs: 250,
        transformGapWarningMs: 1500,
      },
    });
  });

  it("rejects unknown fidelity modes", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: "plaid" as never,
      imageLabelTopics: {},
      pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    expect(readMcapModalSettings().fidelityMode).toBe(
      DEFAULT_MCAP_FIDELITY_MODE,
    );
  });

  it("migrates v1 payloads with interpolation enabled to smooth", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        imageLabelTopics: { "/camera/front": ["/labels/front"] },
        interpolate2dAnnotations: true,
        interpolate3dAnnotations: true,
        temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
      }),
    );

    const read = readMcapModalSettings();
    expect(read.version).toBe(2);
    expect(read.fidelityMode).toBe("smooth");
    expect(read.imageLabelTopics["/camera/front"]).toEqual(["/labels/front"]);
    expect(read.pinholeCamera).toEqual(DEFAULT_MCAP_PINHOLE_CAMERA);
    expect(read.pointCloudColors).toEqual({});
    expect(read.pointCloudPointSize).toBe(DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE);
    expect(read.referenceGrid).toEqual(DEFAULT_MCAP_REFERENCE_GRID);
    expect(read.sceneBackground).toEqual(DEFAULT_MCAP_SCENE_BACKGROUND);
    expect(read.showPointCloudColorLegend).toBe(false);
  });

  it("migrates v1 payloads with any interpolation opt-out to as-recorded", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        imageLabelTopics: {},
        interpolate2dAnnotations: false,
        interpolate3dAnnotations: true,
        temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
      }),
    );

    expect(readMcapModalSettings().fidelityMode).toBe("as-recorded");
  });

  it("clamps invalid reference-grid values", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
      referenceGrid: {
        enabled: true,
        opacityPercent: 250,
        spacingM: Number.NaN,
      },
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    expect(readMcapModalSettings().referenceGrid).toEqual({
      enabled: true,
      opacityPercent: 100,
      spacingM: DEFAULT_MCAP_REFERENCE_GRID.spacingM,
    });
  });

  it("clamps invalid pinhole camera values", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      pinholeCamera: {
        imagePlaneDepthM: -2,
        opacityPercent: 250,
      },
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    expect(readMcapModalSettings().pinholeCamera).toEqual({
      imagePlaneDepthM: 0.05,
      opacityPercent: 100,
    });
  });

  it("rejects invalid scene background values", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: {
        mode: "plaid" as never,
        solidColor: "not-a-color",
      },
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
      showPointCloudColorLegend: false,
    });

    expect(readMcapModalSettings().sceneBackground).toEqual(
      DEFAULT_MCAP_SCENE_BACKGROUND,
    );
  });

  it("round-trips point cloud color settings", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
      pointCloudColors: {
        "/lidar/points": {
          colorBy: "intensity",
          colormap: "turbo",
          rangeMax: 255,
          rangeMin: 0,
          uniformColor: "#123456",
        },
        "/radar/points": {
          colorBy: "vx_comp",
          colormap: "viridis",
          rangeMax: null,
          rangeMin: null,
          uniformColor: "#BADA55",
        },
      },
      pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    expect(readMcapModalSettings().pointCloudColors).toEqual({
      "/lidar/points": {
        colorBy: "intensity",
        colormap: "turbo",
        rangeMax: 255,
        rangeMin: 0,
        uniformColor: "#123456",
      },
      "/radar/points": {
        colorBy: "vx_comp",
        colormap: "viridis",
        rangeMax: null,
        rangeMin: null,
        uniformColor: "#bada55",
      },
    });
  });

  it("sanitizes invalid point cloud color settings", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
      pointCloudColors: {
        "  ": {
          colorBy: "intensity",
          colormap: "turbo",
          rangeMax: null,
          rangeMin: null,
          uniformColor: "#123456",
        },
        "/lidar/points": {
          colorBy: "   ",
          colormap: "plaid" as never,
          rangeMax: Number.POSITIVE_INFINITY,
          rangeMin: Number.NaN,
          uniformColor: "nope",
        },
      },
      pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    expect(readMcapModalSettings().pointCloudColors).toEqual({
      "/lidar/points": DEFAULT_MCAP_POINT_CLOUD_COLOR,
    });
  });

  it("assigns point cloud default colormaps by source index", () => {
    expect(defaultMcapPointCloudColorForIndex(0).colormap).toBe("coolwarm");
    expect(defaultMcapPointCloudColorForIndex(1).colormap).toBe("grayscale");
    expect(defaultMcapPointCloudColorForIndex(9).colormap).toBe("coolwarm");
    expect(defaultMcapPointCloudColorForIndex(Number.NaN).colormap).toBe(
      "coolwarm",
    );
  });

  it("biases turbo to the first lidar point cloud source", () => {
    const sources = [
      { id: "/radar/front", label: "radar" },
      { id: "/lidar/top", label: "points" },
      { id: "/lidar/left", label: "lidar left" },
      { id: "/camera/depth_points", label: "depth" },
    ];

    expect(
      defaultMcapPointCloudColorForSource(sources[0], sources).colormap,
    ).toBe("coolwarm");
    expect(
      defaultMcapPointCloudColorForSource(sources[1], sources).colormap,
    ).toBe("turbo");
    expect(
      defaultMcapPointCloudColorForSource(sources[2], sources).colormap,
    ).toBe("grayscale");
    expect(
      defaultMcapPointCloudColorForSource(sources[3], sources).colormap,
    ).toBe("inferno");
  });

  it("keeps index defaults when no lidar source is present", () => {
    const sources = [
      { id: "/radar/front", label: "radar" },
      { id: "/depth/points", label: "depth" },
    ];

    expect(
      defaultMcapPointCloudColorForSource(sources[0], sources).colormap,
    ).toBe("coolwarm");
    expect(
      defaultMcapPointCloudColorForSource(sources[1], sources).colormap,
    ).toBe("grayscale");
  });

  it("preserves explicit empty label selections", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {
        "/camera/front": [],
      },
      pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    const read = readMcapModalSettings();
    expect(Object.hasOwn(read.imageLabelTopics, "/camera/front")).toBe(true);
    expect(read.imageLabelTopics["/camera/front"]).toEqual([]);
  });

  it("updates settings through the provider hook", () => {
    const { result } = renderHook(() => useMcapModalSettings(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <McapModalSettingsProvider>{children}</McapModalSettingsProvider>
      ),
    });

    act(() => {
      result.current.setFidelityMode("as-recorded");
      result.current.setPinholeCamera({
        imagePlaneDepthM: 6,
        opacityPercent: 35,
      });
      result.current.setReferenceGrid({ enabled: false, spacingM: 10 });
      result.current.setSceneBackground({ mode: "studio" });
      result.current.setShowPointCloudColorLegend(true);
      result.current.setPointCloudPointSize(4.5);
      result.current.setImageLabelTopics("/camera/front", ["/labels"]);
      result.current.setTemporalPolicy({
        boundaryClampMs: 75,
        maxInterpolationGapMs: 125,
        staleMediaWarningMs: 500,
        transformGapWarningMs: 1500,
      });
    });

    expect(result.current.fidelityMode).toBe("as-recorded");
    expect(result.current.pinholeCamera).toEqual({
      imagePlaneDepthM: 6,
      opacityPercent: 35,
    });
    expect(result.current.referenceGrid).toEqual({
      enabled: false,
      opacityPercent: DEFAULT_MCAP_REFERENCE_GRID.opacityPercent,
      spacingM: 10,
    });
    expect(result.current.sceneBackground).toEqual({
      mode: "studio",
      solidColor: DEFAULT_MCAP_SCENE_BACKGROUND.solidColor,
    });
    expect(result.current.imageLabelTopics["/camera/front"]).toEqual([
      "/labels",
    ]);
    expect(result.current.showPointCloudColorLegend).toBe(true);
    expect(result.current.pointCloudPointSize).toBe(4.5);
    expect(result.current.temporalPolicy).toEqual({
      boundaryClampMs: 75,
      maxInterpolationGapMs: 125,
      staleMediaWarningMs: 500,
      transformGapWarningMs: 1500,
    });
    expect(readMcapModalSettings()).toMatchObject({
      fidelityMode: "as-recorded",
      imageLabelTopics: { "/camera/front": ["/labels"] },
      pinholeCamera: { imagePlaneDepthM: 6, opacityPercent: 35 },
      referenceGrid: {
        enabled: false,
        opacityPercent: DEFAULT_MCAP_REFERENCE_GRID.opacityPercent,
        spacingM: 10,
      },
      sceneBackground: {
        mode: "studio",
        solidColor: DEFAULT_MCAP_SCENE_BACKGROUND.solidColor,
      },
      pointCloudPointSize: 4.5,
      showPointCloudColorLegend: true,
      temporalPolicy: {
        boundaryClampMs: 75,
        maxInterpolationGapMs: 125,
        staleMediaWarningMs: 500,
        transformGapWarningMs: 1500,
      },
    });

    act(() => {
      result.current.resetTemporalPolicy();
    });

    expect(result.current.temporalPolicy).toEqual(DEFAULT_MCAP_TEMPORAL_POLICY);
  });

  it("updates point cloud colors per topic through the provider hook", () => {
    const { result } = renderHook(() => useMcapModalSettings(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <McapModalSettingsProvider>{children}</McapModalSettingsProvider>
      ),
    });

    act(() => {
      result.current.setPointCloudColor("/lidar/points", {
        colorBy: "intensity",
        colormap: "turbo",
      });
    });

    // Partial updates merge over the default entry.
    expect(result.current.pointCloudColors["/lidar/points"]).toEqual({
      colorBy: "intensity",
      colormap: "turbo",
      rangeMax: null,
      rangeMin: null,
      uniformColor: DEFAULT_MCAP_POINT_CLOUD_COLOR.uniformColor,
    });

    act(() => {
      result.current.setPointCloudColor("/lidar/points", { rangeMin: 5 });
      result.current.setPointCloudColor("/lidar/points", {
        uniformColor: "#00ff88",
      });
      result.current.setPointCloudColor("/radar/points", {
        colorBy: "vx_comp",
      });
      result.current.setPointCloudColor("   ", { colorBy: "ignored" });
    });

    expect(result.current.pointCloudColors["/lidar/points"]).toEqual({
      colorBy: "intensity",
      colormap: "turbo",
      rangeMax: null,
      rangeMin: 5,
      uniformColor: "#00ff88",
    });
    expect(result.current.pointCloudColors["/radar/points"]).toEqual({
      ...DEFAULT_MCAP_POINT_CLOUD_COLOR,
      colorBy: "vx_comp",
    });
    expect(Object.keys(result.current.pointCloudColors)).toHaveLength(2);
    expect(readMcapModalSettings().pointCloudColors).toEqual(
      result.current.pointCloudColors,
    );
  });

  it("clamps persisted point size to the supported range", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: 42,
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    expect(readMcapModalSettings().pointCloudPointSize).toBe(
      MAX_MCAP_POINT_CLOUD_POINT_SIZE,
    );
  });

  it("clamps invalid temporal policy values", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: Number.POSITIVE_INFINITY,
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: {
        boundaryClampMs: -10,
        maxInterpolationGapMs: 100_000,
        staleMediaWarningMs: Number.NaN,
        transformGapWarningMs: Number.POSITIVE_INFINITY,
      },
    });

    expect(readMcapModalSettings()).toMatchObject({
      pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
      temporalPolicy: {
        boundaryClampMs: 0,
        maxInterpolationGapMs: 60_000,
        staleMediaWarningMs: DEFAULT_MCAP_TEMPORAL_POLICY.staleMediaWarningMs,
        transformGapWarningMs:
          DEFAULT_MCAP_TEMPORAL_POLICY.transformGapWarningMs,
      },
    });
  });
});
