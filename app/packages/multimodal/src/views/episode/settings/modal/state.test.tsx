import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetModalSettingsForTests,
  DEFAULT_IMAGE_PROJECTION,
  DEFAULT_PINHOLE_CAMERA,
  DEFAULT_POINT_CLOUD_COLOR,
  DEFAULT_POINT_CLOUD_POINT_SIZE,
  DEFAULT_REFERENCE_GRID,
  DEFAULT_SCENE_BACKGROUND,
  MAX_POINT_CLOUD_POINT_SIZE,
  MAX_SETTINGS_SCOPES,
  defaultPointCloudColorForIndex,
  defaultPointCloudColorForSource,
  readModalSettings,
  useImageLabelStreams,
  useImageProjection,
  useModalSettingsScopeSync,
  usePinholeCameraSettings,
  usePointCloudStyleSettings,
  useReferenceGridSettings,
  useSceneBackgroundSettings,
  writeModalSettings,
} from "./state";

describe("episode-modal-settings", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetModalSettingsForTests();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("returns default settings when nothing is stored", () => {
    expect(DEFAULT_SCENE_BACKGROUND.mode).toBe("abyss");
    expect(readModalSettings()).toEqual({
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_REFERENCE_GRID,
      sceneBackground: DEFAULT_SCENE_BACKGROUND,
      scoped: {},
      showPointCloudColorLegend: false,
    });
  });

  it("ignores v2 storage and writes only the greenfield v3 key", () => {
    localStorage.setItem(
      "fiftyone.episode.modal-settings.v2",
      JSON.stringify({
        fidelityMode: "as-recorded",
        pointCloudPointSize: 9,
        temporalPolicy: { staleMediaWarningMs: 60_000 },
      }),
    );

    expect(readModalSettings()).toEqual({
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_REFERENCE_GRID,
      sceneBackground: DEFAULT_SCENE_BACKGROUND,
      scoped: {},
      showPointCloudColorLegend: false,
    });

    writeModalSettings({
      ...readModalSettings(),
      pointCloudPointSize: 4,
    });
    const stored: unknown = JSON.parse(
      localStorage.getItem("fiftyone.episode.modal-settings.v3") ?? "{}",
    );
    expect(
      typeof stored === "object" && stored !== null
        ? Reflect.get(stored, "pointCloudPointSize")
        : undefined,
    ).toBe(4);
    expect(
      localStorage.getItem("fiftyone.episode.modal-settings.v2"),
    ).not.toBeNull();
  });

  it("migrates the existing unversioned v3 payload in place", () => {
    localStorage.setItem(
      "fiftyone.episode.modal-settings.v3",
      JSON.stringify({
        pointCloudPointSize: 4,
        scoped: {
          "dataset-a": {
            imageLabelStreams: { "/camera/front": ["/labels/front"] },
          },
        },
      }),
    );

    expect(readModalSettings()).toMatchObject({
      pointCloudPointSize: 4,
      scoped: {
        "dataset-a": {
          imageLabelStreams: { "/camera/front": ["/labels/front"] },
        },
      },
    });
  });

  it("round-trips modal appearance and stream settings", () => {
    writeModalSettings({
      scoped: {},
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
    });

    expect(readModalSettings()).toEqual({
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
    });
  });

  it("clamps invalid reference-grid values", () => {
    writeModalSettings({
      scoped: {},
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
      referenceGrid: {
        enabled: true,
        opacityPercent: 250,
        spacingM: Number.NaN,
      },
      sceneBackground: DEFAULT_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
    });

    expect(readModalSettings().referenceGrid).toEqual({
      enabled: true,
      opacityPercent: 100,
      spacingM: DEFAULT_REFERENCE_GRID.spacingM,
    });
  });

  it("clamps invalid pinhole camera values", () => {
    writeModalSettings({
      scoped: {},
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: {
        imagePlaneDepthM: -2,
        opacityPercent: 250,
      },
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_REFERENCE_GRID,
      sceneBackground: DEFAULT_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
    });

    expect(readModalSettings().pinholeCamera).toEqual({
      imagePlaneDepthM: 0.05,
      opacityPercent: 100,
    });
  });

  it("rejects invalid scene background values", () => {
    writeModalSettings({
      scoped: {},
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_REFERENCE_GRID,
      sceneBackground: {
        mode: "plaid" as never,
        solidColor: "not-a-color",
      },
      showPointCloudColorLegend: false,
    });

    expect(readModalSettings().sceneBackground).toEqual(
      DEFAULT_SCENE_BACKGROUND,
    );
  });

  it("round-trips point cloud color settings", () => {
    writeModalSettings({
      scoped: {},
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_PINHOLE_CAMERA,
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
      pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_REFERENCE_GRID,
      sceneBackground: DEFAULT_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
    });

    expect(readModalSettings().pointCloudColors).toEqual({
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
    writeModalSettings({
      scoped: {},
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_PINHOLE_CAMERA,
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
      pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_REFERENCE_GRID,
      sceneBackground: DEFAULT_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
    });

    expect(readModalSettings().pointCloudColors).toEqual({
      "/lidar/points": DEFAULT_POINT_CLOUD_COLOR,
    });
  });

  it("assigns point cloud default colormaps by source index", () => {
    expect(defaultPointCloudColorForIndex(0).colormap).toBe("coolwarm");
    expect(defaultPointCloudColorForIndex(1).colormap).toBe("grayscale");
    expect(defaultPointCloudColorForIndex(9).colormap).toBe("coolwarm");
    expect(defaultPointCloudColorForIndex(Number.NaN).colormap).toBe(
      "coolwarm",
    );
  });

  it("biases turbo to the first lidar point cloud source", () => {
    const sources = [
      { id: "40", label: "radar", sourceName: "/radar/front" },
      { id: "41", label: "points", sourceName: "/lidar/top" },
      { id: "42", label: "lidar left", sourceName: "/lidar/left" },
      {
        id: "43",
        label: "depth",
        sourceName: "/camera/depth_points",
      },
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
    expect(defaultPointCloudColorForSource(sources[3], sources).colormap).toBe(
      "inferno",
    );
  });

  it("keeps index defaults when no lidar source is present", () => {
    const sources = [
      { id: "40", label: "radar", sourceName: "/radar/front" },
      { id: "41", label: "depth", sourceName: "/depth/points" },
    ];

    expect(defaultPointCloudColorForSource(sources[0], sources).colormap).toBe(
      "coolwarm",
    );
    expect(defaultPointCloudColorForSource(sources[1], sources).colormap).toBe(
      "grayscale",
    );
  });

  it("preserves explicit empty label selections", () => {
    writeModalSettings({
      scoped: {},
      imageLabelStreams: {
        "/camera/front": [],
      },
      imageProjection: {},
      pinholeCamera: DEFAULT_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_REFERENCE_GRID,
      sceneBackground: DEFAULT_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
    });

    const read = readModalSettings();
    expect(Object.hasOwn(read.imageLabelStreams, "/camera/front")).toBe(true);
    expect(read.imageLabelStreams["/camera/front"]).toEqual([]);
  });

  it("bounds persisted stream lists through the shared sanitizer", () => {
    const streams = Array.from(
      { length: 130 },
      (_, index) => `/labels/${index}`,
    );
    writeModalSettings({
      ...readModalSettings(),
      imageLabelStreams: {
        "/camera/front": [...streams, "x".repeat(513)],
      },
    });

    expect(readModalSettings().imageLabelStreams["/camera/front"]).toEqual(
      streams.slice(0, 128),
    );
  });

  it("updates settings through domain hooks", () => {
    const { result } = renderHook(() => ({
      imageLabels: useImageLabelStreams("/camera/front"),
      pinhole: usePinholeCameraSettings(),
      pointCloud: usePointCloudStyleSettings(),
      referenceGrid: useReferenceGridSettings(),
      sceneBackground: useSceneBackgroundSettings(),
    }));

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
      result.current.imageLabels.setLabelStreams(["/labels"]);
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
    expect(result.current.sceneBackground.sceneBackground).toEqual({
      mode: "studio",
      solidColor: DEFAULT_SCENE_BACKGROUND.solidColor,
    });
    expect(result.current.imageLabels.labelStreams).toEqual(["/labels"]);
    expect(result.current.imageLabels.hasExplicitLabelStreams).toBe(true);
    expect(result.current.pointCloud.showPointCloudColorLegend).toBe(true);
    expect(result.current.pointCloud.pointCloudPointSize).toBe(4.5);
    expect(readModalSettings()).toMatchObject({
      imageLabelStreams: { "/camera/front": ["/labels"] },
      pinholeCamera: { imagePlaneDepthM: 6, opacityPercent: 35 },
      referenceGrid: {
        enabled: false,
        opacityPercent: DEFAULT_REFERENCE_GRID.opacityPercent,
        spacingM: 10,
      },
      sceneBackground: {
        mode: "studio",
        solidColor: DEFAULT_SCENE_BACKGROUND.solidColor,
      },
      pointCloudPointSize: 4.5,
      showPointCloudColorLegend: true,
    });
  });

  it("updates point cloud colors per stream through the style hook", () => {
    const { result } = renderHook(() => usePointCloudStyleSettings());

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
      uniformColor: DEFAULT_POINT_CLOUD_COLOR.uniformColor,
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
      ...DEFAULT_POINT_CLOUD_COLOR,
      colorBy: "vx_comp",
    });
    expect(Object.keys(result.current.pointCloudColors)).toHaveLength(2);
    expect(readModalSettings().pointCloudColors).toEqual(
      result.current.pointCloudColors,
    );
  });

  it("does not re-render unrelated domain hook consumers", () => {
    let pinholeRenders = 0;
    let sceneBackgroundRenders = 0;

    const PinholeConsumer = () => {
      pinholeRenders += 1;
      const { pinholeCamera } = usePinholeCameraSettings();
      return (
        <span data-testid="pinhole-depth">
          {pinholeCamera.imagePlaneDepthM}
        </span>
      );
    };

    const SceneBackgroundControl = () => {
      sceneBackgroundRenders += 1;
      const { setSceneBackground } = useSceneBackgroundSettings();
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
        <PinholeConsumer />
        <SceneBackgroundControl />
      </>,
    );

    expect(screen.getByTestId("pinhole-depth").textContent).toBe(
      String(DEFAULT_PINHOLE_CAMERA.imagePlaneDepthM),
    );
    const pinholeRendersBeforeUpdate = pinholeRenders;
    const sceneBackgroundRendersBeforeUpdate = sceneBackgroundRenders;

    fireEvent.click(screen.getByRole("button", { name: "Studio" }));

    expect(pinholeRenders).toBe(pinholeRendersBeforeUpdate);
    expect(sceneBackgroundRenders).toBe(sceneBackgroundRendersBeforeUpdate + 1);
    expect(readModalSettings().sceneBackground.mode).toBe("studio");
  });

  it("clamps persisted point size to the supported range", () => {
    writeModalSettings({
      scoped: {},
      imageLabelStreams: {},
      imageProjection: {},
      pinholeCamera: DEFAULT_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: 42,
      referenceGrid: DEFAULT_REFERENCE_GRID,
      sceneBackground: DEFAULT_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
    });

    expect(readModalSettings().pointCloudPointSize).toBe(
      MAX_POINT_CLOUD_POINT_SIZE,
    );
  });

  it("sanitizes invalid lidar projection settings", () => {
    writeModalSettings({
      scoped: {},
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
      pinholeCamera: DEFAULT_PINHOLE_CAMERA,
      pointCloudColors: {},
      pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
      referenceGrid: DEFAULT_REFERENCE_GRID,
      sceneBackground: DEFAULT_SCENE_BACKGROUND,
      showPointCloudColorLegend: false,
    });

    expect(readModalSettings().imageProjection).toEqual({
      "/camera/array": DEFAULT_IMAGE_PROJECTION,
      "/camera/front": {
        calibrationStream: null,
        display: "recorded",
        enabled: false,
        geometry: "auto",
        pointSize: MAX_POINT_CLOUD_POINT_SIZE,
        streams: [],
      },
    });
  });

  it("updates lidar projection per image stream through the hook", () => {
    const { result } = renderHook(() => useImageProjection("/camera/front"));

    expect(result.current.projection).toEqual(DEFAULT_IMAGE_PROJECTION);

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
    expect(readModalSettings().imageProjection).toEqual({
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
    const { result } = renderHook(() => useImageProjection("/camera/front"));

    act(() => {
      result.current.setProjection({
        calibrationStream: " /camera/front/calibration ",
        display: "rectified",
        geometry: "rectified",
      });
    });

    expect(result.current.projection).toEqual({
      ...DEFAULT_IMAGE_PROJECTION,
      calibrationStream: "/camera/front/calibration",
      display: "rectified",
      geometry: "rectified",
    });
    expect(readModalSettings().imageProjection["/camera/front"]).toEqual(
      result.current.projection,
    );
  });

  it("isolates scoped stream styling from unscoped settings", () => {
    const globalHook = renderHook(() => usePointCloudStyleSettings());
    act(() => {
      globalHook.result.current.setPointCloudColor("/lidar_top", {
        colorBy: "height",
      });
    });
    globalHook.unmount();

    const { result, unmount } = renderHook(() => {
      useModalSettingsScopeSync("dataset-a");
      return usePointCloudStyleSettings();
    });

    expect(result.current.pointCloudColors["/lidar_top"]).toBeUndefined();

    act(() => {
      result.current.setPointCloudColor("/lidar_top", { rangeMax: 9 });
    });
    expect(result.current.pointCloudColors["/lidar_top"]).toMatchObject({
      colorBy: DEFAULT_POINT_CLOUD_COLOR.colorBy,
      rangeMax: 9,
    });

    const persisted = readModalSettings();
    expect(
      persisted.scoped["dataset-a"]?.pointCloudColors["/lidar_top"],
    ).toMatchObject({
      colorBy: DEFAULT_POINT_CLOUD_COLOR.colorBy,
      rangeMax: 9,
    });
    expect(persisted.pointCloudColors["/lidar_top"]).toMatchObject({
      colorBy: "height",
      rangeMax: null,
    });

    // Leaving the dataset restores the unscoped (global) view.
    unmount();
    const after = renderHook(() => usePointCloudStyleSettings());
    expect(after.result.current.pointCloudColors["/lidar_top"]).toMatchObject({
      colorBy: "height",
      rangeMax: null,
    });
  });

  it("keeps datasets from styling each other's streams", () => {
    const datasetA = renderHook(() => {
      useModalSettingsScopeSync("dataset-a");
      return useImageLabelStreams("/camera/front");
    });
    act(() => {
      datasetA.result.current.setLabelStreams(["/labels/a"]);
    });
    expect(datasetA.result.current.labelStreams).toEqual(["/labels/a"]);
    datasetA.unmount();

    const datasetB = renderHook(() => {
      useModalSettingsScopeSync("dataset-b");
      return useImageLabelStreams("/camera/front");
    });
    expect(datasetB.result.current.labelStreams).toEqual([]);
    expect(datasetB.result.current.hasExplicitLabelStreams).toBe(false);
  });

  it("switches scoped settings in place and restores each scope", () => {
    const activeScope = { current: "dataset-a" };
    const hook = renderHook(() => {
      useModalSettingsScopeSync(activeScope.current);
      return useImageLabelStreams("/camera/front");
    });

    act(() => hook.result.current.setLabelStreams(["/labels/a"]));
    activeScope.current = "dataset-b";
    hook.rerender();
    expect(hook.result.current.labelStreams).toEqual([]);

    act(() => hook.result.current.setLabelStreams(["/labels/b"]));
    activeScope.current = "dataset-a";
    hook.rerender();
    expect(hook.result.current.labelStreams).toEqual(["/labels/a"]);
  });

  it("persists the latest scoped write before unmount and restores it", () => {
    const first = renderHook(() => {
      useModalSettingsScopeSync("dataset-a");
      return useImageLabelStreams("/camera/front");
    });
    act(() => first.result.current.setLabelStreams(["/labels/latest"]));
    const persistedBeforeUnmount = localStorage.getItem(
      "fiftyone.episode.modal-settings.v3",
    );

    first.unmount();
    expect(localStorage.getItem("fiftyone.episode.modal-settings.v3")).toBe(
      persistedBeforeUnmount,
    );

    __resetModalSettingsForTests();
    const restored = renderHook(() => {
      useModalSettingsScopeSync("dataset-a");
      return useImageLabelStreams("/camera/front");
    });
    expect(restored.result.current.labelStreams).toEqual(["/labels/latest"]);
  });

  it("prunes the least recently written scopes past the retention cap", () => {
    for (let index = 0; index < MAX_SETTINGS_SCOPES + 1; index++) {
      const scope = renderHook(() => {
        useModalSettingsScopeSync(`dataset-${index}`);
        return usePointCloudStyleSettings();
      });
      act(() => {
        scope.result.current.setPointCloudColor("/lidar_top", {
          colorBy: "height",
        });
      });
      scope.unmount();
    }

    const scopes = Object.keys(readModalSettings().scoped);
    expect(scopes).toHaveLength(MAX_SETTINGS_SCOPES);
    expect(scopes).not.toContain("dataset-0");
    expect(scopes).toContain(`dataset-${MAX_SETTINGS_SCOPES}`);
  });

  it("retains a touched old scope when timestamp-LRU pruning runs", () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    for (let index = 0; index < MAX_SETTINGS_SCOPES; index++) {
      const scope = renderHook(() => {
        useModalSettingsScopeSync(`dataset-${index}`);
        return usePointCloudStyleSettings();
      });
      act(() => {
        scope.result.current.setPointCloudColor("/lidar_top", {
          colorBy: "height",
        });
      });
      scope.unmount();
    }

    now = 5_000;
    const touched = renderHook(() => {
      useModalSettingsScopeSync("dataset-0");
      return usePointCloudStyleSettings();
    });
    act(() => {
      touched.result.current.setPointCloudColor("/lidar_top", {
        rangeMax: 42,
      });
    });
    touched.unmount();

    const newest = renderHook(() => {
      useModalSettingsScopeSync(`dataset-${MAX_SETTINGS_SCOPES}`);
      return usePointCloudStyleSettings();
    });
    act(() => {
      newest.result.current.setPointCloudColor("/lidar_top", {
        colorBy: "intensity",
      });
    });
    newest.unmount();

    const scopes = Object.keys(readModalSettings().scoped);
    expect(scopes).toHaveLength(MAX_SETTINGS_SCOPES);
    expect(scopes).toContain("dataset-0");
    expect(scopes).not.toContain("dataset-1");
  });
});
