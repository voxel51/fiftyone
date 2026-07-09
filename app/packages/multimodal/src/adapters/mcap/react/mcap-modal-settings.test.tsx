import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetMcapModalSettingsForTests,
  DEFAULT_MCAP_FIDELITY_MODE,
  DEFAULT_MCAP_IMAGE_PROJECTION,
  DEFAULT_MCAP_PINHOLE_CAMERA,
  DEFAULT_MCAP_POINT_CLOUD_COLOR,
  DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
  DEFAULT_MCAP_REFERENCE_GRID,
  DEFAULT_MCAP_SCENE_BACKGROUND,
  DEFAULT_MCAP_TEMPORAL_POLICY,
  MAX_MCAP_POINT_CLOUD_POINT_SIZE,
  defaultMcapPointCloudColorForIndex,
  defaultMcapPointCloudColorForSource,
  readMcapModalSettings,
  useMcapImageLabelTopics,
  useMcapImageProjection,
  useMcapPinholeCameraSettings,
  useMcapPlaybackSettings,
  useMcapPointCloudStyleSettings,
  useMcapReferenceGridSettings,
  useMcapSceneBackgroundSettings,
  useMcapTemporalPolicySettings,
  writeMcapModalSettings,
} from "./mcap-modal-settings";

describe("mcap-modal-settings", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetMcapModalSettingsForTests();
  });

  afterEach(() => cleanup());

  it("returns default settings when nothing is stored", () => {
    expect(DEFAULT_MCAP_SCENE_BACKGROUND.mode).toBe("abyss");
    expect(readMcapModalSettings()).toEqual({
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      imageProjection: {},
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
      fidelityMode: "as-recorded",
      imageLabelTopics: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      imageProjection: {
        "/camera/front": {
          enabled: true,
          pointSize: 4,
          topics: ["/lidar/points"],
        },
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
      fidelityMode: "as-recorded",
      imageLabelTopics: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      imageProjection: {
        "/camera/front": {
          enabled: true,
          pointSize: 4,
          topics: ["/lidar/points"],
        },
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
      fidelityMode: "plaid" as never,
      imageLabelTopics: {},
      imageProjection: {},
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

  it("clamps invalid reference-grid values", () => {
    writeMcapModalSettings({
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      imageProjection: {},
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
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      imageProjection: {},
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
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      imageProjection: {},
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
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      imageProjection: {},
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
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      imageProjection: {},
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
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {
        "/camera/front": [],
      },
      imageProjection: {},
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

  it("updates settings through domain hooks", () => {
    const { result } = renderHook(() => ({
      imageLabels: useMcapImageLabelTopics("/camera/front"),
      pinhole: useMcapPinholeCameraSettings(),
      playback: useMcapPlaybackSettings(),
      pointCloud: useMcapPointCloudStyleSettings(),
      referenceGrid: useMcapReferenceGridSettings(),
      sceneBackground: useMcapSceneBackgroundSettings(),
      temporalPolicy: useMcapTemporalPolicySettings(),
    }));

    act(() => {
      result.current.playback.setFidelityMode("as-recorded");
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
      result.current.imageLabels.setLabelTopics(["/labels"]);
      result.current.temporalPolicy.setTemporalPolicy({
        boundaryClampMs: 75,
        maxInterpolationGapMs: 125,
        staleMediaWarningMs: 500,
        transformGapWarningMs: 1500,
      });
    });

    expect(result.current.playback.fidelityMode).toBe("as-recorded");
    expect(result.current.pinhole.pinholeCamera).toEqual({
      imagePlaneDepthM: 6,
      opacityPercent: 35,
    });
    expect(result.current.referenceGrid.referenceGrid).toEqual({
      enabled: false,
      opacityPercent: DEFAULT_MCAP_REFERENCE_GRID.opacityPercent,
      spacingM: 10,
    });
    expect(result.current.sceneBackground.sceneBackground).toEqual({
      mode: "studio",
      solidColor: DEFAULT_MCAP_SCENE_BACKGROUND.solidColor,
    });
    expect(result.current.imageLabels.labelTopics).toEqual(["/labels"]);
    expect(result.current.imageLabels.hasExplicitLabelTopics).toBe(true);
    expect(result.current.pointCloud.showPointCloudColorLegend).toBe(true);
    expect(result.current.pointCloud.pointCloudPointSize).toBe(4.5);
    expect(result.current.temporalPolicy.temporalPolicy).toEqual({
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
      result.current.temporalPolicy.resetTemporalPolicy();
    });

    expect(result.current.temporalPolicy.temporalPolicy).toEqual(
      DEFAULT_MCAP_TEMPORAL_POLICY,
    );
  });

  it("updates point cloud colors per topic through the style hook", () => {
    const { result } = renderHook(() => useMcapPointCloudStyleSettings());

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

  it("does not re-render unrelated domain hook consumers", () => {
    let playbackRenders = 0;
    let sceneBackgroundRenders = 0;

    const PlaybackConsumer = () => {
      playbackRenders += 1;
      const { fidelityMode } = useMcapPlaybackSettings();
      return <span data-testid="fidelity-mode">{fidelityMode}</span>;
    };

    const SceneBackgroundControl = () => {
      sceneBackgroundRenders += 1;
      const { setSceneBackground } = useMcapSceneBackgroundSettings();
      return (
        <button
          onClick={() => setSceneBackground({ mode: "studio" })}
          type="button"
        >
          Studio
        </button>
      );
    };

    render(
      <>
        <PlaybackConsumer />
        <SceneBackgroundControl />
      </>,
    );

    expect(screen.getByTestId("fidelity-mode").textContent).toBe("smooth");
    const playbackRendersBeforeUpdate = playbackRenders;
    const sceneBackgroundRendersBeforeUpdate = sceneBackgroundRenders;

    fireEvent.click(screen.getByRole("button", { name: "Studio" }));

    expect(playbackRenders).toBe(playbackRendersBeforeUpdate);
    expect(sceneBackgroundRenders).toBe(sceneBackgroundRendersBeforeUpdate + 1);
    expect(readMcapModalSettings().sceneBackground.mode).toBe("studio");
  });

  it("clamps persisted point size to the supported range", () => {
    writeMcapModalSettings({
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      imageProjection: {},
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
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      imageProjection: {},
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

  it("sanitizes invalid lidar projection settings", () => {
    writeMcapModalSettings({
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      imageProjection: {
        "  ": { enabled: true, pointSize: 6, topics: null },
        "/camera/front": {
          enabled: "yes" as never,
          pointSize: 900,
          topics: ["/lidar", "", "/lidar", 42 as never],
        },
      },
      pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    expect(readMcapModalSettings().imageProjection).toEqual({
      "/camera/front": {
        enabled: false,
        pointSize: MAX_MCAP_POINT_CLOUD_POINT_SIZE,
        topics: ["/lidar"],
      },
    });
  });

  it("updates lidar projection per image topic through the hook", () => {
    const { result } = renderHook(() =>
      useMcapImageProjection("/camera/front"),
    );

    expect(result.current.projection).toEqual(DEFAULT_MCAP_IMAGE_PROJECTION);

    act(() => {
      result.current.setProjection({ enabled: true, pointSize: 8 });
    });
    expect(result.current.projection).toEqual({
      enabled: true,
      pointSize: 8,
      topics: null,
    });

    act(() => {
      result.current.setProjection({ topics: ["/lidar/points"] });
    });
    expect(result.current.projection.topics).toEqual(["/lidar/points"]);
    expect(readMcapModalSettings().imageProjection).toEqual({
      "/camera/front": {
        enabled: true,
        pointSize: 8,
        topics: ["/lidar/points"],
      },
    });
  });
});
