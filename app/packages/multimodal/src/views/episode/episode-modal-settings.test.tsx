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
  __resetEpisodeModalSettingsForTests,
  DEFAULT_EPISODE_FIDELITY_MODE,
  DEFAULT_EPISODE_IMAGE_PROJECTION,
  DEFAULT_EPISODE_PINHOLE_CAMERA,
  DEFAULT_EPISODE_POINT_CLOUD_COLOR,
  DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
  DEFAULT_EPISODE_REFERENCE_GRID,
  DEFAULT_EPISODE_SCENE_BACKGROUND,
  DEFAULT_EPISODE_TEMPORAL_POLICY,
  MAX_EPISODE_POINT_CLOUD_POINT_SIZE,
  MAX_EPISODE_SETTINGS_SCOPES,
  defaultEpisodePointCloudColorForIndex,
  defaultEpisodePointCloudColorForSource,
  readEpisodeModalSettings,
  useEpisodeImageLabelStreams,
  useEpisodeImageProjection,
  useEpisodeModalSettingsScopeSync,
  useEpisodePinholeCameraSettings,
  useEpisodePlaybackSettings,
  useEpisodePointCloudStyleSettings,
  useEpisodeReferenceGridSettings,
  useEpisodeSceneBackgroundSettings,
  useEpisodeTemporalPolicySettings,
  writeEpisodeModalSettings,
} from "./episode-modal-settings";

describe("episode-modal-settings", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetEpisodeModalSettingsForTests();
  });

  afterEach(() => cleanup());

  it("returns default settings when nothing is stored", () => {
    expect(DEFAULT_EPISODE_SCENE_BACKGROUND.mode).toBe("abyss");
    expect(readEpisodeModalSettings()).toEqual({
      fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
      sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
      scoped: {},
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
    });
  });

  it("restores the legacy key and stream field names", () => {
    localStorage.setItem(
      "fiftyone.mcap.modal-settings",
      JSON.stringify({
        imageLabelTopics: {
          "/camera/front": ["/labels/front"],
        },
        imageProjection: {
          "/camera/front": {
            calibrationTopic: "/camera/front/camera_info",
            enabled: true,
            topics: ["/lidar/top"],
          },
        },
      }),
    );

    expect(readEpisodeModalSettings()).toMatchObject({
      imageLabelStreams: {
        "/camera/front": ["/labels/front"],
      },
      imageProjection: {
        "/camera/front": {
          calibrationStream: "/camera/front/camera_info",
          enabled: true,
          streams: ["/lidar/top"],
        },
      },
    });
  });

  it("round-trips fidelity mode and image label streams", () => {
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: "as-recorded",
      imageLabelStreams: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      imageProjection: {
        "/camera/front": {
          calibrationStream: "/camera/front/camera_info",
          display: "rectified",
          enabled: true,
          geometry: "original",
          pointSize: 4,
          streams: ["/lidar/points"],
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

    expect(readEpisodeModalSettings()).toEqual({
      fidelityMode: "as-recorded",
      imageLabelStreams: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      imageProjection: {
        "/camera/front": {
          calibrationStream: "/camera/front/camera_info",
          display: "rectified",
          enabled: true,
          geometry: "original",
          pointSize: 4,
          streams: ["/lidar/points"],
        },
      },
      pinholeCamera: { imagePlaneDepthM: 4, opacityPercent: 45 },
      pointCloudColors: {},
      pointCloudPointSize: 4,
      referenceGrid: { enabled: false, opacityPercent: 50, spacingM: 5 },
      sceneBackground: { mode: "abyss", solidColor: "#112233" },
      scoped: {},
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
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: "plaid" as never,
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
      sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
    });

    expect(readEpisodeModalSettings().fidelityMode).toBe(
      DEFAULT_EPISODE_FIDELITY_MODE,
    );
  });

  it("clamps invalid reference-grid values", () => {
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
      referenceGrid: {
        enabled: true,
        opacityPercent: 250,
        spacingM: Number.NaN,
      },
      sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
    });

    expect(readEpisodeModalSettings().referenceGrid).toEqual({
      enabled: true,
      opacityPercent: 100,
      spacingM: DEFAULT_EPISODE_REFERENCE_GRID.spacingM,
    });
  });

  it("clamps invalid pinhole camera values", () => {
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: {
        imagePlaneDepthM: -2,
        opacityPercent: 250,
      },
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
      sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
    });

    expect(readEpisodeModalSettings().pinholeCamera).toEqual({
      imagePlaneDepthM: 0.05,
      opacityPercent: 100,
    });
  });

  it("rejects invalid scene background values", () => {
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
      sceneBackground: {
        mode: "plaid" as never,
        solidColor: "not-a-color",
      },
      temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
      showPointCloudColorLegend: false,
    });

    expect(readEpisodeModalSettings().sceneBackground).toEqual(
      DEFAULT_EPISODE_SCENE_BACKGROUND,
    );
  });

  it("round-trips point cloud color settings", () => {
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
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
      pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
      sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
    });

    expect(readEpisodeModalSettings().pointCloudColors).toEqual({
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
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
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
      pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
      sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
    });

    expect(readEpisodeModalSettings().pointCloudColors).toEqual({
      "/lidar/points": DEFAULT_EPISODE_POINT_CLOUD_COLOR,
    });
  });

  it("assigns point cloud default colormaps by source index", () => {
    expect(defaultEpisodePointCloudColorForIndex(0).colormap).toBe("coolwarm");
    expect(defaultEpisodePointCloudColorForIndex(1).colormap).toBe("grayscale");
    expect(defaultEpisodePointCloudColorForIndex(9).colormap).toBe("coolwarm");
    expect(defaultEpisodePointCloudColorForIndex(Number.NaN).colormap).toBe(
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
      defaultEpisodePointCloudColorForSource(sources[0], sources).colormap,
    ).toBe("coolwarm");
    expect(
      defaultEpisodePointCloudColorForSource(sources[1], sources).colormap,
    ).toBe("turbo");
    expect(
      defaultEpisodePointCloudColorForSource(sources[2], sources).colormap,
    ).toBe("grayscale");
    expect(
      defaultEpisodePointCloudColorForSource(sources[3], sources).colormap,
    ).toBe("inferno");
  });

  it("keeps index defaults when no lidar source is present", () => {
    const sources = [
      { id: "/radar/front", label: "radar" },
      { id: "/depth/points", label: "depth" },
    ];

    expect(
      defaultEpisodePointCloudColorForSource(sources[0], sources).colormap,
    ).toBe("coolwarm");
    expect(
      defaultEpisodePointCloudColorForSource(sources[1], sources).colormap,
    ).toBe("grayscale");
  });

  it("preserves explicit empty label selections", () => {
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
      imageLabelStreams: {
        "/camera/front": [],
      },
      imageProjection: {},
      pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
      sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
    });

    const read = readEpisodeModalSettings();
    expect(Object.hasOwn(read.imageLabelStreams, "/camera/front")).toBe(true);
    expect(read.imageLabelStreams["/camera/front"]).toEqual([]);
  });

  it("updates settings through domain hooks", () => {
    const { result } = renderHook(() => ({
      imageLabels: useEpisodeImageLabelStreams("/camera/front"),
      pinhole: useEpisodePinholeCameraSettings(),
      playback: useEpisodePlaybackSettings(),
      pointCloud: useEpisodePointCloudStyleSettings(),
      referenceGrid: useEpisodeReferenceGridSettings(),
      sceneBackground: useEpisodeSceneBackgroundSettings(),
      temporalPolicy: useEpisodeTemporalPolicySettings(),
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
      result.current.imageLabels.setLabelStreams(["/labels"]);
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
      opacityPercent: DEFAULT_EPISODE_REFERENCE_GRID.opacityPercent,
      spacingM: 10,
    });
    expect(result.current.sceneBackground.sceneBackground).toEqual({
      mode: "studio",
      solidColor: DEFAULT_EPISODE_SCENE_BACKGROUND.solidColor,
    });
    expect(result.current.imageLabels.labelStreams).toEqual(["/labels"]);
    expect(result.current.imageLabels.hasExplicitLabelStreams).toBe(true);
    expect(result.current.pointCloud.showPointCloudColorLegend).toBe(true);
    expect(result.current.pointCloud.pointCloudPointSize).toBe(4.5);
    expect(result.current.temporalPolicy.temporalPolicy).toEqual({
      boundaryClampMs: 75,
      maxInterpolationGapMs: 125,
      staleMediaWarningMs: 500,
      transformGapWarningMs: 1500,
    });
    expect(readEpisodeModalSettings()).toMatchObject({
      fidelityMode: "as-recorded",
      imageLabelStreams: { "/camera/front": ["/labels"] },
      pinholeCamera: { imagePlaneDepthM: 6, opacityPercent: 35 },
      referenceGrid: {
        enabled: false,
        opacityPercent: DEFAULT_EPISODE_REFERENCE_GRID.opacityPercent,
        spacingM: 10,
      },
      sceneBackground: {
        mode: "studio",
        solidColor: DEFAULT_EPISODE_SCENE_BACKGROUND.solidColor,
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
      DEFAULT_EPISODE_TEMPORAL_POLICY,
    );
  });

  it("updates point cloud colors per stream through the style hook", () => {
    const { result } = renderHook(() => useEpisodePointCloudStyleSettings());

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
      uniformColor: DEFAULT_EPISODE_POINT_CLOUD_COLOR.uniformColor,
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
      ...DEFAULT_EPISODE_POINT_CLOUD_COLOR,
      colorBy: "vx_comp",
    });
    expect(Object.keys(result.current.pointCloudColors)).toHaveLength(2);
    expect(readEpisodeModalSettings().pointCloudColors).toEqual(
      result.current.pointCloudColors,
    );
  });

  it("does not re-render unrelated domain hook consumers", () => {
    let playbackRenders = 0;
    let sceneBackgroundRenders = 0;

    const PlaybackConsumer = () => {
      playbackRenders += 1;
      const { fidelityMode } = useEpisodePlaybackSettings();
      return <span data-testid="fidelity-mode">{fidelityMode}</span>;
    };

    const SceneBackgroundControl = () => {
      sceneBackgroundRenders += 1;
      const { setSceneBackground } = useEpisodeSceneBackgroundSettings();
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
    expect(readEpisodeModalSettings().sceneBackground.mode).toBe("studio");
  });

  it("clamps persisted point size to the supported range", () => {
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: 42,
      referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
      sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
    });

    expect(readEpisodeModalSettings().pointCloudPointSize).toBe(
      MAX_EPISODE_POINT_CLOUD_POINT_SIZE,
    );
  });

  it("clamps invalid temporal policy values", () => {
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: Number.POSITIVE_INFINITY,
      referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
      sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: {
        boundaryClampMs: -10,
        maxInterpolationGapMs: 100_000,
        staleMediaWarningMs: Number.NaN,
        transformGapWarningMs: Number.POSITIVE_INFINITY,
      },
    });

    expect(readEpisodeModalSettings()).toMatchObject({
      pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
      temporalPolicy: {
        boundaryClampMs: 0,
        maxInterpolationGapMs: 60_000,
        staleMediaWarningMs:
          DEFAULT_EPISODE_TEMPORAL_POLICY.staleMediaWarningMs,
        transformGapWarningMs:
          DEFAULT_EPISODE_TEMPORAL_POLICY.transformGapWarningMs,
      },
    });
  });

  it("sanitizes invalid lidar projection settings", () => {
    writeEpisodeModalSettings({
      scoped: {},
      fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
      imageLabelStreams: {},
      imageProjection: {
        "  ": {
          calibrationStream: null,
          display: "recorded",
          enabled: true,
          geometry: "auto",
          pointSize: 6,
          streams: null,
        },
        "/camera/array": [] as never,
        "/camera/front": {
          calibrationStream: "  ",
          display: "magic" as never,
          enabled: "yes" as never,
          geometry: "magic" as never,
          pointSize: 900,
          streams: ["/lidar", "", "/lidar", 42 as never],
        },
      },
      pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
      sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
      temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
    });

    expect(readEpisodeModalSettings().imageProjection).toEqual({
      "/camera/array": DEFAULT_EPISODE_IMAGE_PROJECTION,
      "/camera/front": {
        calibrationStream: null,
        display: "recorded",
        enabled: false,
        geometry: "auto",
        pointSize: MAX_EPISODE_POINT_CLOUD_POINT_SIZE,
        streams: [],
      },
    });
  });

  it("updates lidar projection per image stream through the hook", () => {
    const { result } = renderHook(() =>
      useEpisodeImageProjection("/camera/front"),
    );

    expect(result.current.projection).toEqual(DEFAULT_EPISODE_IMAGE_PROJECTION);

    act(() => {
      result.current.setProjection({ enabled: true, pointSize: 8 });
    });
    expect(result.current.projection).toEqual({
      calibrationStream: null,
      display: "recorded",
      enabled: true,
      geometry: "auto",
      pointSize: 8,
      streams: null,
    });

    act(() => {
      result.current.setProjection({ streams: ["/lidar/points"] });
    });
    expect(result.current.projection.streams).toEqual(["/lidar/points"]);
    expect(readEpisodeModalSettings().imageProjection).toEqual({
      "/camera/front": {
        calibrationStream: null,
        display: "recorded",
        enabled: true,
        geometry: "auto",
        pointSize: 8,
        streams: ["/lidar/points"],
      },
    });

    act(() => {
      result.current.setProjection({ enabled: false });
    });
    expect(result.current.projection).toEqual({
      calibrationStream: null,
      display: "recorded",
      enabled: false,
      geometry: "auto",
      pointSize: 8,
      streams: [],
    });
  });

  it("persists image geometry and calibration overrides per image stream", () => {
    const { result } = renderHook(() =>
      useEpisodeImageProjection("/camera/front"),
    );

    act(() => {
      result.current.setProjection({
        calibrationStream: " /camera/front/calibration ",
        display: "rectified",
        geometry: "rectified",
      });
    });

    expect(result.current.projection).toEqual({
      ...DEFAULT_EPISODE_IMAGE_PROJECTION,
      calibrationStream: "/camera/front/calibration",
      display: "rectified",
      geometry: "rectified",
    });
    expect(readEpisodeModalSettings().imageProjection["/camera/front"]).toEqual(
      result.current.projection,
    );
  });

  it("scopes stream-keyed styling to the synced dataset with global fallback", () => {
    const globalHook = renderHook(() => useEpisodePointCloudStyleSettings());
    act(() => {
      globalHook.result.current.setPointCloudColor("/lidar_top", {
        colorBy: "height",
      });
    });
    globalHook.unmount();

    const { result, unmount } = renderHook(() => {
      useEpisodeModalSettingsScopeSync("dataset-a");
      return useEpisodePointCloudStyleSettings();
    });

    // Unwritten streams resolve through the global fallback.
    expect(result.current.pointCloudColors["/lidar_top"]?.colorBy).toBe(
      "height",
    );

    // A scoped edit starts from the resolved value and shadows the global.
    act(() => {
      result.current.setPointCloudColor("/lidar_top", { rangeMax: 9 });
    });
    expect(result.current.pointCloudColors["/lidar_top"]).toMatchObject({
      colorBy: "height",
      rangeMax: 9,
    });

    const persisted = readEpisodeModalSettings();
    expect(
      persisted.scoped["dataset-a"]?.pointCloudColors["/lidar_top"],
    ).toMatchObject({ colorBy: "height", rangeMax: 9 });
    expect(persisted.pointCloudColors["/lidar_top"]).toMatchObject({
      colorBy: "height",
      rangeMax: null,
    });

    // Leaving the dataset restores the unscoped (global) view.
    unmount();
    const after = renderHook(() => useEpisodePointCloudStyleSettings());
    expect(after.result.current.pointCloudColors["/lidar_top"]).toMatchObject({
      colorBy: "height",
      rangeMax: null,
    });
  });

  it("keeps datasets from styling each other's streams", () => {
    const datasetA = renderHook(() => {
      useEpisodeModalSettingsScopeSync("dataset-a");
      return useEpisodeImageLabelStreams("/camera/front");
    });
    act(() => {
      datasetA.result.current.setLabelStreams(["/labels/a"]);
    });
    expect(datasetA.result.current.labelStreams).toEqual(["/labels/a"]);
    datasetA.unmount();

    const datasetB = renderHook(() => {
      useEpisodeModalSettingsScopeSync("dataset-b");
      return useEpisodeImageLabelStreams("/camera/front");
    });
    expect(datasetB.result.current.labelStreams).toEqual([]);
    expect(datasetB.result.current.hasExplicitLabelStreams).toBe(false);
  });

  it("prunes the least recently written scopes past the retention cap", () => {
    for (let index = 0; index < MAX_EPISODE_SETTINGS_SCOPES + 1; index++) {
      const scope = renderHook(() => {
        useEpisodeModalSettingsScopeSync(`dataset-${index}`);
        return useEpisodePointCloudStyleSettings();
      });
      act(() => {
        scope.result.current.setPointCloudColor("/lidar_top", {
          colorBy: "height",
        });
      });
      scope.unmount();
    }

    const scopes = Object.keys(readEpisodeModalSettings().scoped);
    expect(scopes).toHaveLength(MAX_EPISODE_SETTINGS_SCOPES);
    expect(scopes).not.toContain("dataset-0");
    expect(scopes).toContain(`dataset-${MAX_EPISODE_SETTINGS_SCOPES}`);
  });
});
