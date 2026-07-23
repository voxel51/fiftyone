import { PlaybackProvider } from "@fiftyone/playback";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { DecodedDiagnostic } from "../../../../ir/index";
import type { SceneSource } from "../../../../scene-inventory/index";
import { SCENE_SOURCE_TYPE } from "../../../../ir/index";
import Scene3dTileSettings, {
  type Scene3dTileSettingsProps,
} from "./Scene3dTileSettings";
import {
  __resetModalSettingsForTests,
  DEFAULT_FIDELITY_MODE,
  DEFAULT_TEMPORAL_POLICY,
  readModalSettings,
  writeModalSettings,
  type PinholeCameraSettings,
  type PointCloudColorSettings,
  type ReferenceGridSettings,
  type SceneBackgroundSettings,
} from "../../settings/modal/state";

const CAM_FRONT = source(
  "CAM_FRONT/camera_info",
  "CAM_FRONT/camera_info",
  SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
  233,
);
const CAM_BACK = source(
  "CAM_BACK/camera_info",
  "CAM_BACK/camera_info",
  SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
  227,
);
const LIDAR = source(
  "LIDAR_TOP",
  "LIDAR_TOP",
  SCENE_SOURCE_TYPE.POINT_CLOUD,
  100,
);

beforeEach(() => {
  localStorage.clear();
  __resetModalSettingsForTests();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Scene3dTileSettings", () => {
  it("renders a camera master switch when camera sources exist", () => {
    renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraStreams: [CAM_FRONT.id, CAM_BACK.id],
      enabled: new Set([CAM_FRONT.id, CAM_BACK.id]),
    });

    const toggle = screen.getByRole("switch", { name: "Toggle cameras" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("treats partial camera selection as switched on", () => {
    renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraStreams: [CAM_FRONT.id],
      enabled: new Set([CAM_FRONT.id]),
    });

    const toggle = screen.getByRole("switch", { name: "Toggle cameras" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("calls the batch source toggle with the group ids and next state", () => {
    const checkedProps = renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraStreams: [CAM_FRONT.id],
      enabled: new Set([CAM_FRONT.id]),
    });
    fireEvent.click(screen.getByRole("switch", { name: "Toggle cameras" }));
    expect(checkedProps.setSourcesEnabled).toHaveBeenCalledWith(
      [CAM_FRONT.id, CAM_BACK.id],
      false,
    );

    cleanup();

    const uncheckedProps = renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraStreams: [],
      enabled: new Set(),
    });
    fireEvent.click(screen.getByRole("switch", { name: "Toggle cameras" }));
    expect(uncheckedProps.setSourcesEnabled).toHaveBeenCalledWith(
      [CAM_FRONT.id, CAM_BACK.id],
      true,
    );
  });

  it("renders a master switch for point clouds", () => {
    const props = renderSettings();

    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle point clouds" }),
    );
    expect(props.setSourcesEnabled).toHaveBeenCalledWith([LIDAR.id], false);
  });

  it("shows stream labels without message counts", () => {
    renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraStreams: [CAM_FRONT.id, CAM_BACK.id],
      enabled: new Set([CAM_FRONT.id, CAM_BACK.id]),
    });

    expect(
      screen.getByRole("checkbox", { name: "CAM_FRONT/camera_info" }),
    ).toBeTruthy();
    expect(screen.queryByText(/\(233\)/)).toBeNull();
  });

  it("keeps individual camera checkboxes wired to per-source toggles", () => {
    const props = renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraStreams: [CAM_FRONT.id, CAM_BACK.id],
      enabled: new Set([CAM_FRONT.id, CAM_BACK.id]),
    });

    fireEvent.click(
      screen.getByRole("checkbox", { name: "CAM_FRONT/camera_info" }),
    );

    expect(props.toggleSource).toHaveBeenCalledWith(CAM_FRONT.id, false);
  });

  it("shows camera capability diagnostics beside the affected source", () => {
    renderSettings({
      cameraDiagnosticsByStream: [
        [
          {
            capability: "camera-calibration",
            code: "camera-calibration-unavailable",
            message: "Camera calibration is unavailable",
            severity: "warning",
          },
        ],
        [],
      ],
    });

    expect(screen.getByText("Camera calibration is unavailable")).toBeTruthy();
  });

  it("hides source groups that have no sources", () => {
    renderSettings({
      cameraSources: [],
      cameraStreams: [],
      enabled: new Set([LIDAR.id]),
    });

    expect(screen.queryByRole("switch", { name: "Toggle cameras" })).toBeNull();
    expect(screen.queryByText("Cameras")).toBeNull();
    expect(screen.queryByText("Map Layers")).toBeNull();
    expect(screen.queryByText("Ego Pose")).toBeNull();
    expect(screen.queryByText("3D Labels")).toBeNull();
    expect(screen.queryByText("Pinhole")).toBeNull();
    expect(screen.getByText("Point Clouds")).toBeTruthy();
  });

  it("hides point cloud color settings when no point cloud sources exist", () => {
    renderSettings({
      enabled: new Set([CAM_FRONT.id, CAM_BACK.id]),
      pointCloudSources: [],
      pointCloudStreams: [],
      selectedPointCloudSources: [],
    });

    expect(screen.queryByText("Point Clouds")).toBeNull();
    expect(screen.queryByText("Point Clouds (Style)")).toBeNull();
  });

  it("collapses a group via its header and shows the selection summary", () => {
    renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraStreams: [CAM_FRONT.id],
      enabled: new Set([CAM_FRONT.id]),
    });

    fireEvent.click(screen.getByRole("button", { name: /Cameras/ }));

    expect(
      screen.queryByRole("checkbox", { name: "CAM_FRONT/camera_info" }),
    ).toBeNull();
    expect(screen.getByText("1 of 2 on")).toBeTruthy();
    // The master switch stays reachable while collapsed.
    expect(screen.getByRole("switch", { name: "Toggle cameras" })).toBeTruthy();
  });

  it("wires the reference grid controls to the settings updater", () => {
    renderSettings();
    expandAppearance();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Spacing (m)" }), {
      target: { value: "5" },
    });
    expect(readModalSettings().referenceGrid.spacingM).toBe(5);

    fireEvent.change(screen.getByRole("spinbutton", { name: "Opacity (%)" }), {
      target: { value: "50" },
    });
    expect(readModalSettings().referenceGrid.opacityPercent).toBe(50);

    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle reference grid" }),
    );
    expect(readModalSettings().referenceGrid.enabled).toBe(false);
  });

  it("wires the pinhole controls to the settings updater", () => {
    renderSettings();
    expandPinhole();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Depth (m)" }), {
      target: { value: "4.5" },
    });
    expect(readModalSettings().pinholeCamera.imagePlaneDepthM).toBe(4.5);

    fireEvent.change(screen.getByRole("spinbutton", { name: "Opacity (%)" }), {
      target: { value: "40" },
    });
    expect(readModalSettings().pinholeCamera.opacityPercent).toBe(40);
  });

  it("lets a camera texture geometry be chosen without an image tile", () => {
    renderSettings({
      cameraSources: [CAM_FRONT],
      cameraImageStreams: ["CAM_FRONT/image_raw"],
      cameraStreams: [CAM_FRONT.id],
      enabled: new Set([CAM_FRONT.id]),
    });
    expandPinhole();

    const geometry = getVoodooCombobox(/^Geometry \(CAM_FRONT\/camera_info\)/);
    selectVoodooOption(geometry, "Original camera");

    expect(
      readModalSettings().imageProjection["CAM_FRONT/image_raw"]?.geometry,
    ).toBe("original");
  });

  it("wires the background controls to the settings updater", () => {
    renderSettings();
    expandAppearance();

    fireEvent.change(screen.getByLabelText("Background color"), {
      target: { value: "#123456" },
    });
    expect(readModalSettings().sceneBackground.solidColor).toBe("#123456");

    selectVoodooOption(getVoodooCombobox(/^Background\b/), "Abyss");
    expect(readModalSettings().sceneBackground.mode).toBe("abyss");
  });

  it("keeps scene-scoped controls off the tile settings", () => {
    renderSettings({
      frameIds: ["map"],
      worldFrameId: "map",
    });

    expect(screen.queryByRole("combobox", { name: "Up Axis" })).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Reference Frame" }),
    ).toBeNull();
  });

  it("wires the camera target control to the tile updater", () => {
    const props = renderSettings({
      frameIds: ["base_link", "map"],
      worldFrameId: "map",
    });

    selectVoodooOption(getVoodooCombobox(/^Camera Target/), "base_link");

    expect(props.updateCameraTargetFrameId).toHaveBeenCalledWith("base_link");
  });

  it("explains follow-mode no-ops when the target matches the reference frame", () => {
    renderSettings({
      cameraTargetFrameId: "map",
      frameIds: ["map"],
      trackingMode: "position",
      worldFrameId: "map",
    });

    expect(
      screen.getByText(/a frame cannot move relative to itself/),
    ).toBeTruthy();
  });

  it("wires the point cloud color controls to the settings updater", () => {
    renderSettings();
    expandColorSource(LIDAR.label);

    const colorSelect = getVoodooCombobox(/^Color\b/);
    openVoodooSelect(colorSelect);
    // Observed channels slot between the reserved modes; no RGB without
    // explicit cloud colors.
    for (const option of ["Auto", "Height", "intensity", "ring", "Uniform"]) {
      expect(screen.getByRole("option", { name: option })).toBeTruthy();
    }
    expect(screen.queryByRole("option", { name: "RGB" })).toBeNull();

    selectVoodooOption(colorSelect, "ring");
    expect(storedPointCloudColor(LIDAR.id)).toEqual({
      colorBy: "ring",
      colormap: "turbo",
      rangeMax: null,
      rangeMin: null,
      uniformColor: "#b8c2d1",
    });

    const colormapSelect = getVoodooCombobox(/^Colormap\b/);
    selectVoodooOption(colormapSelect, "Turbo");
    expect(storedPointCloudColor(LIDAR.id)).toEqual({
      colorBy: "ring",
      colormap: "turbo",
      rangeMax: null,
      rangeMin: null,
      uniformColor: "#b8c2d1",
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(storedPointCloudColor(LIDAR.id)).toEqual({
      colorBy: "ring",
      colormap: "turbo",
      rangeMax: null,
      rangeMin: null,
      uniformColor: "#b8c2d1",
    });

    fireEvent.change(screen.getByRole("spinbutton", { name: "Range min" }), {
      target: { value: "2" },
    });
    expect(storedPointCloudColor(LIDAR.id)).toEqual({
      colorBy: "ring",
      colormap: "turbo",
      rangeMax: null,
      rangeMin: 2,
      uniformColor: "#b8c2d1",
    });

    fireEvent.change(screen.getByRole("spinbutton", { name: "Range max" }), {
      target: { value: "9" },
    });
    expect(storedPointCloudColor(LIDAR.id)).toEqual({
      colorBy: "ring",
      colormap: "turbo",
      rangeMax: 9,
      rangeMin: 2,
      uniformColor: "#b8c2d1",
    });
  });

  it("wires the global point size control to the settings updater", () => {
    renderSettings();
    ensurePointCloudStyleExpanded();
    const input = screen.getByRole("spinbutton", { name: "Point size" });

    expect(input.getAttribute("aria-valuemax")).toBe("10");
    expect(input.getAttribute("aria-valuemin")).toBe("1");

    fireEvent.change(input, {
      target: { value: "4.5" },
    });

    expect(readModalSettings().pointCloudPointSize).toBe(4.5);

    // Out-of-range commits clamp instead of writing through.
    fireEvent.change(input, {
      target: { value: "50" },
    });
    expect(readModalSettings().pointCloudPointSize).toBe(10);
  });

  it("keeps per-source default colormaps distinct", () => {
    const radar = source("RADAR_FRONT", "RADAR_FRONT", LIDAR.type, 50);
    renderSettings({
      pointCloudSources: [LIDAR, radar],
      pointCloudStreams: [LIDAR.id, radar.id],
      selectedPointCloudSources: [LIDAR, radar],
    });
    ensurePointCloudStyleExpanded();

    expect(screen.getByText("Turbo")).toBeTruthy();
    expect(screen.getByText("Cool-warm")).toBeTruthy();
  });

  it("resets a source row to that source's default colormap", () => {
    const radar = source("RADAR_FRONT", "RADAR_FRONT", LIDAR.type, 50);
    renderSettings({
      pointCloudColors: {
        [radar.id]: {
          colorBy: "height",
          colormap: "turbo",
          rangeMax: 7,
          rangeMin: 1,
          uniformColor: "#336699",
        },
      },
      pointCloudSources: [LIDAR, radar],
      pointCloudStreams: [LIDAR.id, radar.id],
      selectedPointCloudSources: [LIDAR, radar],
    });
    ensurePointCloudStyleExpanded();

    fireEvent.click(
      screen.getByRole("button", { name: `Reset color for ${radar.label}` }),
    );

    expect(storedPointCloudColor(radar.id)).toEqual({
      colorBy: "auto",
      colormap: "coolwarm",
      rangeMax: null,
      rangeMin: null,
      uniformColor: "#b8c2d1",
    });
  });

  it("resets a source editor colormap to that source's default colormap", () => {
    const radar = source("RADAR_FRONT", "RADAR_FRONT", LIDAR.type, 50);
    renderSettings({
      pointCloudColors: {
        [radar.id]: {
          colorBy: "height",
          colormap: "turbo",
          rangeMax: null,
          rangeMin: null,
          uniformColor: "#b8c2d1",
        },
      },
      pointCloudSources: [LIDAR, radar],
      pointCloudStreams: [LIDAR.id, radar.id],
      selectedPointCloudSources: [LIDAR, radar],
    });

    expandColorSource(radar.label);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(storedPointCloudColor(radar.id)).toEqual({
      colorBy: "height",
      colormap: "coolwarm",
      rangeMax: null,
      rangeMin: null,
      uniformColor: "#b8c2d1",
    });
  });

  it("preserves sibling color settings when editing one source field", () => {
    renderSettings({
      pointCloudColors: {
        [LIDAR.id]: {
          colorBy: "intensity",
          colormap: "turbo",
          rangeMax: 9,
          rangeMin: 2,
          uniformColor: "#b8c2d1",
        },
      },
    });

    expandColorSource(LIDAR.label);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Range min" }), {
      target: { value: "3" },
    });

    expect(storedPointCloudColor(LIDAR.id)).toEqual({
      colorBy: "intensity",
      colormap: "turbo",
      rangeMax: 9,
      rangeMin: 3,
      uniformColor: "#b8c2d1",
    });
  });

  it("wires the point cloud color legend switch to the settings updater", () => {
    renderSettings();
    ensurePointCloudStyleExpanded();

    fireEvent.click(
      screen.getByRole("switch", { name: "Show point cloud color legend" }),
    );

    expect(readModalSettings().showPointCloudColorLegend).toBe(true);
  });

  it("saves custom colormap edits from the editor modal", () => {
    renderSettings();

    expandColorSource(LIDAR.label);
    fireEvent.click(screen.getByRole("button", { name: "Edit colormap" }));
    expect(screen.getByLabelText("Number of stops")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Color stop 2 color"), {
      target: { value: "#123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(storedPointCloudColor(LIDAR.id)).toEqual({
      colorBy: "auto",
      colormap: expect.objectContaining({
        list: expect.arrayContaining([
          expect.objectContaining({ color: "#123456" }),
        ]),
        name: "Turbo custom",
      }),
      rangeMax: null,
      rangeMin: null,
      uniformColor: "#b8c2d1",
    });
  });

  it("clears a fixed range end back to auto", () => {
    renderSettings({
      pointCloudColors: {
        [LIDAR.id]: {
          colorBy: "intensity",
          colormap: "coolwarm",
          rangeMax: 9,
          rangeMin: 2,
          uniformColor: "#b8c2d1",
        },
      },
    });

    expandColorSource(LIDAR.label);

    const rangeMinInputs = screen.getAllByRole("spinbutton", {
      name: "Range min",
    });
    const sourceRangeMin = rangeMinInputs[rangeMinInputs.length - 1];
    if (!sourceRangeMin) {
      throw new Error("Expected a source range-min input");
    }
    fireEvent.change(sourceRangeMin, {
      target: { value: "" },
    });
    expect(storedPointCloudColor(LIDAR.id)).toEqual({
      colorBy: "intensity",
      colormap: "coolwarm",
      rangeMax: 9,
      rangeMin: null,
      uniformColor: "#b8c2d1",
    });
  });

  it("offers RGB coloring only for clouds observed with colors", () => {
    renderSettings({
      pointCloudColorCapabilities: new Map([
        [LIDAR.id, { hasRgb: true, scalarFields: [] }],
      ]),
    });

    expandColorSource(LIDAR.label);
    openVoodooSelect(getVoodooCombobox(/^Color\b/));

    expect(screen.getByRole("option", { name: "RGB" })).toBeTruthy();
  });

  it("shows a swatch and hides ramp controls for uniform coloring", () => {
    renderSettings({
      pointCloudColors: {
        [LIDAR.id]: {
          colorBy: "uniform",
          colormap: "coolwarm",
          rangeMax: null,
          rangeMin: null,
          uniformColor: "#336699",
        },
      },
    });

    expandColorSource(LIDAR.label);

    expect(screen.queryByRole("combobox", { name: /^Colormap\b/ })).toBeNull();
    expect(screen.queryByRole("spinbutton", { name: "Range min" })).toBeNull();
    fireEvent.change(screen.getByLabelText(`Uniform color (${LIDAR.label})`), {
      target: { value: "#ff8800" },
    });
    expect(storedPointCloudColor(LIDAR.id)).toEqual({
      colorBy: "uniform",
      colormap: "coolwarm",
      rangeMax: null,
      rangeMin: null,
      uniformColor: "#ff8800",
    });
  });

  it("hides ramp controls for rgb coloring", () => {
    renderSettings({
      pointCloudColorCapabilities: new Map([
        [LIDAR.id, { hasRgb: true, scalarFields: [] }],
      ]),
      pointCloudColors: {
        [LIDAR.id]: {
          colorBy: "rgb",
          colormap: "coolwarm",
          rangeMax: null,
          rangeMin: null,
          uniformColor: "#b8c2d1",
        },
      },
    });

    expandColorSource(LIDAR.label);

    expect(screen.queryByRole("combobox", { name: /^Colormap\b/ })).toBeNull();
    expect(screen.queryByRole("spinbutton", { name: "Range min" })).toBeNull();
    expect(
      screen.queryByLabelText(`Uniform color (${LIDAR.label})`),
    ).toBeNull();
  });

  it("keeps an unavailable persisted channel selectable and flags inverted ranges", () => {
    renderSettings({
      pointCloudColors: {
        [LIDAR.id]: {
          colorBy: "vx_comp",
          colormap: "viridis",
          rangeMax: 1,
          rangeMin: 5,
          uniformColor: "#b8c2d1",
        },
      },
    });

    expandColorSource(LIDAR.label);

    openVoodooSelect(getVoodooCombobox(/^Color \(LIDAR_TOP\)/));
    expect(screen.getByRole("option", { name: "vx_comp" })).toBeTruthy();
    expect(
      screen.getByText("The fixed range is ignored until min is below max."),
    ).toBeTruthy();
  });

  it("labels color controls per source when several clouds are selected", () => {
    const radar = source("RADAR_FRONT", "RADAR_FRONT", LIDAR.type, 50);
    renderSettings({
      pointCloudSources: [LIDAR, radar],
      pointCloudStreams: [LIDAR.id, radar.id],
      selectedPointCloudSources: [LIDAR, radar],
    });
    ensurePointCloudStyleExpanded();

    expect(screen.getByRole("button", { name: "Edit color for LIDAR_TOP" }));
    expect(
      screen.getByRole("button", { name: "Edit color for RADAR_FRONT" }),
    ).toBeTruthy();

    expandColorSource(LIDAR.label);
    expect(
      screen.getByRole("combobox", { name: /^Color \(LIDAR_TOP\)/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: /^Color \(RADAR_FRONT\)/ }),
    ).toBeNull();

    expandColorSource(radar.label);
    expect(
      screen.getByRole("combobox", { name: /^Color \(RADAR_FRONT\)/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: /^Color \(LIDAR_TOP\)/ }),
    ).toBeNull();
  });

  it("collapses appearance controls by default", () => {
    renderSettings();

    expect(
      screen.queryByRole("switch", { name: "Toggle reference grid" }),
    ).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: /^Background\b/ }),
    ).toBeNull();
  });

  it("collapses point cloud style controls by default", () => {
    renderSettings();

    expect(screen.queryByRole("spinbutton", { name: "Point size" })).toBeNull();
    expect(screen.queryByText("2px · legend off · 1 active")).toBeTruthy();
  });

  it("offers the color picker only for the solid background", () => {
    renderSettings({
      sceneBackground: { mode: "studio", solidColor: "#050b12" },
    });
    expandAppearance();

    expect(
      screen.getByRole("combobox", { name: /^Background\b/ }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Background color")).toBeNull();
  });

  it("disables the grid appearance inputs while the grid is off", () => {
    renderSettings({
      referenceGrid: { enabled: false, opacityPercent: 5, spacingM: 1 },
    });
    expandAppearance();

    expect(
      screen
        .getByRole("spinbutton", { name: "Spacing (m)" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("spinbutton", { name: "Opacity (%)" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

function expandAppearance() {
  fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
}

function expandPinhole() {
  fireEvent.click(screen.getByRole("button", { name: /Pinhole/ }));
}

function ensurePointCloudStyleExpanded() {
  const button = screen.getByRole("button", {
    name: /Point Clouds \(Style\)/,
  });
  if (button.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(
      screen.getByRole("button", { name: /Point Clouds \(Style\)/ }),
    );
  }
}

function expandColorSource(label: string) {
  ensurePointCloudStyleExpanded();
  fireEvent.click(
    screen.getByRole("button", { name: `Edit color for ${label}` }),
  );
}

function getVoodooCombobox(name: RegExp): HTMLElement {
  return screen.getByRole("combobox", { name });
}

function openVoodooSelect(combobox: HTMLElement) {
  fireEvent.focus(combobox);
  fireEvent.keyDown(combobox, { key: "ArrowDown" });
}

function selectVoodooOption(combobox: HTMLElement, query: string) {
  fireEvent.focus(combobox);
  fireEvent.change(combobox, { target: { value: query } });
  fireEvent.keyDown(combobox, { key: "ArrowDown" });
  fireEvent.keyDown(combobox, { key: "Enter" });
}

interface SettingsTestProps {
  readonly cameraDiagnosticsByStream: readonly (readonly DecodedDiagnostic[])[];
  readonly cameraSources: readonly SceneSource[];
  readonly cameraImageStreams: readonly string[];
  readonly cameraTargetFrameId: string;
  readonly cameraStreams: readonly string[];
  readonly enabled: ReadonlySet<string>;
  readonly frameIds: readonly string[];
  readonly mapLayerSources: readonly SceneSource[];
  readonly mapLayerStreams: readonly string[];
  readonly pinholeCamera: PinholeCameraSettings;
  readonly pointCloudColorCapabilities: ReadonlyMap<
    string,
    { readonly hasRgb: boolean; readonly scalarFields: readonly string[] }
  >;
  readonly pointCloudColors: Record<string, PointCloudColorSettings>;
  readonly pointCloudPointSize: number;
  readonly pointCloudSources: readonly SceneSource[];
  readonly pointCloudStreams: readonly string[];
  readonly poseSources: readonly SceneSource[];
  readonly poseStreams: readonly string[];
  readonly referenceGrid: ReferenceGridSettings;
  readonly sceneAnnotationSources: readonly SceneSource[];
  readonly sceneAnnotationStreams: readonly string[];
  readonly sceneBackground: SceneBackgroundSettings;
  readonly selectedPointCloudSources: readonly SceneSource[];
  readonly selectedPoseSources: readonly SceneSource[];
  readonly setSourcesEnabled: Mock<
    (ids: readonly string[], checked: boolean) => void
  >;
  readonly setTrackingMode: Mock<
    (mode: "free" | "position" | "heading" | "pose") => void
  >;
  readonly setTrajectoryFrameOverrides: Mock<
    Dispatch<SetStateAction<Readonly<Record<string, string>>>>
  >;
  readonly showPointCloudColorLegend: boolean;
  readonly toggleSource: Mock<(id: string, checked: boolean) => void>;
  readonly trackingMode: "free" | "position" | "heading" | "pose";
  readonly trajectories: Map<string, never>;
  readonly trajectoryFrameByStream: Map<string, string>;
  readonly updateCameraTargetFrameId: Mock<(frameId: string) => void>;
  readonly worldFrameId: string;
}

function renderSettings(
  overrides: Partial<SettingsTestProps> = {},
): SettingsTestProps {
  const props = settingsProps(overrides);
  seedModalSettings(props);
  render(
    <PlaybackProvider duration={1}>
      <Scene3dTileSettings {...componentProps(props)} />
    </PlaybackProvider>,
  );
  return props;
}

function settingsProps(
  overrides: Partial<SettingsTestProps> = {},
): SettingsTestProps {
  return {
    cameraDiagnosticsByStream: [[], []],
    cameraSources: [CAM_FRONT, CAM_BACK],
    cameraImageStreams: ["CAM_FRONT/image_raw", "CAM_BACK/image_raw"],
    cameraTargetFrameId: "",
    cameraStreams: [CAM_FRONT.id, CAM_BACK.id],
    enabled: new Set([CAM_FRONT.id, CAM_BACK.id, LIDAR.id]),
    frameIds: [],
    mapLayerSources: [],
    mapLayerStreams: [],
    pinholeCamera: { imagePlaneDepthM: 2.75, opacityPercent: 85 },
    pointCloudColorCapabilities: new Map([
      [LIDAR.id, { hasRgb: false, scalarFields: ["intensity", "ring"] }],
    ]),
    pointCloudColors: {},
    pointCloudPointSize: 2,
    pointCloudSources: [LIDAR],
    pointCloudStreams: [LIDAR.id],
    poseSources: [],
    poseStreams: [],
    referenceGrid: { enabled: true, opacityPercent: 5, spacingM: 1 },
    sceneBackground: { mode: "solid" as const, solidColor: "#050b12" },
    showPointCloudColorLegend: false,
    sceneAnnotationSources: [],
    sceneAnnotationStreams: [],
    selectedPointCloudSources: [LIDAR],
    selectedPoseSources: [],
    setSourcesEnabled: vi.fn(),
    setTrackingMode: vi.fn(),
    setTrajectoryFrameOverrides: vi.fn(),
    toggleSource: vi.fn(),
    trackingMode: "free",
    trajectories: new Map<string, never>(),
    trajectoryFrameByStream: new Map(),
    updateCameraTargetFrameId: vi.fn(),
    worldFrameId: "",
    ...overrides,
  };
}

function seedModalSettings(props: SettingsTestProps) {
  writeModalSettings({
    scoped: {},
    fidelityMode: DEFAULT_FIDELITY_MODE,
    imageLabelStreams: {},
    imageProjection: {},
    pinholeCamera: props.pinholeCamera,
    pointCloudColors: props.pointCloudColors,
    pointCloudPointSize: props.pointCloudPointSize,
    referenceGrid: props.referenceGrid,
    sceneBackground: props.sceneBackground,
    showPointCloudColorLegend: props.showPointCloudColorLegend,
    temporalPolicy: DEFAULT_TEMPORAL_POLICY,
  });
  __resetModalSettingsForTests();
}

function componentProps(props: SettingsTestProps): Scene3dTileSettingsProps {
  return {
    cameraInputs: {
      diagnosticsByStream: props.cameraDiagnosticsByStream,
      imageStreams: props.cameraImageStreams,
    },
    frameControls: {
      cameraTargetFrameId: props.cameraTargetFrameId,
      frameIds: props.frameIds,
      updateCameraTargetFrameId: props.updateCameraTargetFrameId,
      worldFrameId: props.worldFrameId,
    },
    pointCloudInputs: {
      colorCapabilities: props.pointCloudColorCapabilities,
      selectedSources: props.selectedPointCloudSources,
    },
    poseControls: {
      selectedSources: props.selectedPoseSources,
      setTrajectoryFrameOverrides: props.setTrajectoryFrameOverrides,
      trajectories: props.trajectories,
      trajectoryFrameByStream: props.trajectoryFrameByStream,
    },
    selection: {
      enabled: props.enabled,
      setSourcesEnabled: props.setSourcesEnabled,
      toggleSource: props.toggleSource,
    },
    sourceGroups: {
      camera: {
        sources: props.cameraSources,
        streams: props.cameraStreams,
      },
      mapLayer: {
        sources: props.mapLayerSources,
        streams: props.mapLayerStreams,
      },
      pointCloud: {
        sources: props.pointCloudSources,
        streams: props.pointCloudStreams,
      },
      pose: {
        sources: props.poseSources,
        streams: props.poseStreams,
      },
      sceneAnnotation: {
        sources: props.sceneAnnotationSources,
        streams: props.sceneAnnotationStreams,
      },
    },
    tileId: "3d-1",
    trackingControls: {
      mode: props.trackingMode,
      setMode: props.setTrackingMode,
    },
  };
}

function storedPointCloudColor(stream: string) {
  return readModalSettings().pointCloudColors[stream];
}

function source(
  id: string,
  label: string,
  type: string,
  recordCount?: number,
): SceneSource {
  return { id, label, recordCount, sourceName: id, type };
}
