import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import {
  __resetModalSettingsForTests,
  DEFAULT_IMAGE_PROJECTION,
  DEFAULT_PINHOLE_CAMERA,
  DEFAULT_POINT_CLOUD_COLOR,
  DEFAULT_POINT_CLOUD_POINT_SIZE,
  DEFAULT_REFERENCE_GRID,
  DEFAULT_SCENE_BACKGROUND,
  MAX_POINT_CLOUD_POINT_SIZE,
  defaultPointCloudColorForIndex,
  defaultPointCloudColorForSource,
  readModalSettings,
  useImageLabelStreams,
  useImageProjection,
  useImageProjectionSettingsByStream,
  usePinholeCameraSettings,
  usePointCloudStyleSettings,
  useReferenceGridSettings,
  useSceneBackgroundSettings,
  writeModalSettings,
} from "./state";
import type { SceneSource } from "../../../../ir";
import { SidebarPreferencesProvider } from "../sidebar-preferences-context";

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
    expect(
      JSON.parse(
        localStorage.getItem("fiftyone.episode.modal-settings.v3") ?? "{}",
      ).pointCloudPointSize,
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

  it("isolates point-cloud style and appearance in mounted dataset scopes", () => {
    const datasetA = renderHook(() => usePointCloudStyleSettings(), {
      wrapper: settingsWrapper("dataset-a"),
    });
    act(() => {
      datasetA.result.current.setPointCloudColor("10", { rangeMax: 9 });
      datasetA.result.current.setPointCloudPointSize(7);
    });
    expect(datasetA.result.current.pointCloudColors["10"]).toMatchObject({
      rangeMax: 9,
    });
    expect(datasetA.result.current.pointCloudPointSize).toBe(7);

    const datasetB = renderHook(() => usePointCloudStyleSettings(), {
      wrapper: settingsWrapper("dataset-b"),
    });
    expect(datasetB.result.current.pointCloudColors["10"]).toBeUndefined();
    expect(datasetB.result.current.pointCloudPointSize).toBe(
      DEFAULT_POINT_CLOUD_POINT_SIZE,
    );
  });

  it("remaps scoped style when a recording assigns a different runtime id", () => {
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

  it("persists image geometry and semantic calibration across channel ids", () => {
    const first = renderHook(() => useImageProjection("20"), {
      wrapper: cameraSettingsWrapper("dataset-a", "20", "21"),
    });
    act(() =>
      first.result.current.setProjection({
        calibrationStream: "21",
        display: "rectified",
        geometry: "rectified",
      }),
    );
    first.unmount();

    const shifted = renderHook(() => useImageProjection("80"), {
      wrapper: cameraSettingsWrapper("dataset-a", "80", "81"),
    });
    expect(shifted.result.current.projection).toMatchObject({
      calibrationStream: "81",
      display: "rectified",
      geometry: "rectified",
    });
  });

  it("reports legacy image projections through scoped aggregate reads", () => {
    const legacyProjection = {
      ...DEFAULT_IMAGE_PROJECTION,
      enabled: true,
      streams: null,
    };
    writeModalSettings({
      ...readModalSettings(),
      imageProjection: { "20": legacyProjection },
    });
    __resetModalSettingsForTests();

    const { result } = renderHook(
      () => ({
        aggregate: useImageProjectionSettingsByStream()["20"],
        single: useImageProjection("20").projection,
      }),
      { wrapper: cameraSettingsWrapper("dataset-a", "20", "21") },
    );

    expect(result.current.single).toEqual(legacyProjection);
    expect(result.current.aggregate).toEqual(legacyProjection);
  });

  it("retains semantic projection streams while projection is disabled", () => {
    const first = renderHook(() => useImageProjection("20"), {
      wrapper: cameraSettingsWrapper("dataset-a", "20", "21", "22"),
    });
    act(() =>
      first.result.current.setProjection({
        enabled: true,
        streams: ["22"],
      }),
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
    act(() => shifted.result.current.setProjection({ streams: null }));
    expect(shifted.result.current.projection.streams).toBeNull();
  });
});

function settingsWrapper(scopeKey: string, runtimeId = "10") {
  const sources: readonly SceneSource[] = [
    {
      id: runtimeId,
      label: "/lidar_top",
      sourceName: "/lidar_top",
      type: "point-cloud",
    },
  ];
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

function cameraSettingsWrapper(
  scopeKey: string,
  imageId: string,
  calibrationId: string,
  pointCloudId?: string,
) {
  const sources: readonly SceneSource[] = [
    {
      id: imageId,
      label: "/camera/front",
      sourceName: "/camera/front",
      type: "image",
    },
    {
      id: calibrationId,
      label: "/camera/front/camera_info",
      sourceName: "/camera/front/camera_info",
      type: "camera-calibration",
    },
    ...(pointCloudId
      ? [
          {
            id: pointCloudId,
            label: "/lidar_top",
            sourceName: "/lidar_top",
            type: "point-cloud",
          },
        ]
      : []),
  ];
  return function CameraSettingsTestWrapper({
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
