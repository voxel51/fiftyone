import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SceneSource } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import Mcap3dTileSettings, {
  type Mcap3dTileSettingsProps,
} from "./Mcap3dTileSettings";

vi.mock("@fiftyone/tiling", () => ({
  TileSettingsContent: ({ children }: { readonly children: unknown }) =>
    children,
}));

const CAM_FRONT = source(
  "CAM_FRONT/camera_info",
  "CAM_FRONT/camera_info",
  MCAP_SOURCE_TYPE.CAMERA_CALIBRATION,
  233,
);
const CAM_BACK = source(
  "CAM_BACK/camera_info",
  "CAM_BACK/camera_info",
  MCAP_SOURCE_TYPE.CAMERA_CALIBRATION,
  227,
);
const LIDAR = source(
  "LIDAR_TOP",
  "LIDAR_TOP",
  MCAP_SOURCE_TYPE.POINT_CLOUD,
  100,
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Mcap3dTileSettings", () => {
  it("renders a camera master switch when camera sources exist", () => {
    renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraTopics: [CAM_FRONT.id, CAM_BACK.id],
      enabled: new Set([CAM_FRONT.id, CAM_BACK.id]),
    });

    const toggle = screen.getByRole("switch", { name: "Toggle cameras" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("treats partial camera selection as switched on", () => {
    renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraTopics: [CAM_FRONT.id],
      enabled: new Set([CAM_FRONT.id]),
    });

    const toggle = screen.getByRole("switch", { name: "Toggle cameras" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("calls the batch source toggle with the group ids and next state", () => {
    const checkedProps = renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraTopics: [CAM_FRONT.id],
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
      cameraTopics: [],
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

  it("shows topic labels without message counts", () => {
    renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraTopics: [CAM_FRONT.id, CAM_BACK.id],
      enabled: new Set([CAM_FRONT.id, CAM_BACK.id]),
    });

    expect(
      screen.getByRole("checkbox", { name: "CAM_FRONT/camera_info" }),
    ).toBeTruthy();
    expect(screen.queryByText(/\(233\)/)).toBeNull();
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("keeps individual camera checkboxes wired to per-source toggles", () => {
    const props = renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraTopics: [CAM_FRONT.id, CAM_BACK.id],
      enabled: new Set([CAM_FRONT.id, CAM_BACK.id]),
    });

    fireEvent.click(
      screen.getByRole("checkbox", { name: "CAM_FRONT/camera_info" }),
    );

    expect(props.toggleSource).toHaveBeenCalledWith(CAM_FRONT.id, false);
  });

  it("hides source groups that have no sources", () => {
    renderSettings({
      cameraSources: [],
      cameraTopics: [],
      enabled: new Set([LIDAR.id]),
    });

    expect(screen.queryByRole("switch", { name: "Toggle cameras" })).toBeNull();
    expect(screen.queryByText("Cameras")).toBeNull();
    expect(screen.queryByText("Map Layers")).toBeNull();
    expect(screen.queryByText("Ego Pose")).toBeNull();
    expect(screen.queryByText("3D Labels")).toBeNull();
    expect(screen.getByText("Point Clouds")).toBeTruthy();
  });

  it("collapses a group via its header and shows the selection summary", () => {
    renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraTopics: [CAM_FRONT.id],
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
    const props = renderSettings();
    expandAppearance();

    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle reference grid" }),
    );
    expect(props.setReferenceGrid).toHaveBeenCalledWith({ enabled: false });

    fireEvent.change(screen.getByRole("spinbutton", { name: "Spacing (m)" }), {
      target: { value: "5" },
    });
    expect(props.setReferenceGrid).toHaveBeenCalledWith({ spacingM: 5 });

    fireEvent.change(screen.getByRole("spinbutton", { name: "Opacity (%)" }), {
      target: { value: "50" },
    });
    expect(props.setReferenceGrid).toHaveBeenCalledWith({ opacityPercent: 50 });
  });

  it("wires the background controls to the settings updater", () => {
    const props = renderSettings();
    expandAppearance();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Background style" }),
      { target: { value: "abyss" } },
    );
    expect(props.setSceneBackground).toHaveBeenCalledWith({ mode: "abyss" });

    fireEvent.change(screen.getByLabelText("Background color"), {
      target: { value: "#123456" },
    });
    expect(props.setSceneBackground).toHaveBeenCalledWith({
      solidColor: "#123456",
    });
  });

  it("collapses appearance controls by default", () => {
    renderSettings();

    expect(
      screen.queryByRole("switch", { name: "Toggle reference grid" }),
    ).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Background style" }),
    ).toBeNull();
  });

  it("offers the color picker only for the solid background", () => {
    renderSettings({
      sceneBackground: { mode: "studio", solidColor: "#050b12" },
    });
    expandAppearance();

    expect(
      screen.getByRole("combobox", { name: "Background style" }),
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

function renderSettings(
  overrides: Partial<Mcap3dTileSettingsProps> = {},
): Mcap3dTileSettingsProps {
  const props = settingsProps(overrides);
  render(<Mcap3dTileSettings {...props} />);
  return props;
}

function settingsProps(
  overrides: Partial<Mcap3dTileSettingsProps> = {},
): Mcap3dTileSettingsProps {
  return {
    cameraSources: [CAM_FRONT, CAM_BACK],
    cameraTargetFrameId: "",
    cameraTopics: [CAM_FRONT.id, CAM_BACK.id],
    enabled: new Set([CAM_FRONT.id, CAM_BACK.id, LIDAR.id]),
    frameIds: [],
    mapLayerSources: [],
    mapLayerTopics: [],
    pointCloudSources: [LIDAR],
    pointCloudTopics: [LIDAR.id],
    poseSources: [],
    poseTopics: [],
    referenceGrid: { enabled: true, opacityPercent: 5, spacingM: 1 },
    sceneBackground: { mode: "solid" as const, solidColor: "#050b12" },
    sceneAnnotationSources: [],
    sceneAnnotationTopics: [],
    selectedPoseSources: [],
    setReferenceGrid: vi.fn(),
    setSceneBackground: vi.fn(),
    setSourcesEnabled: vi.fn(),
    setTrackingMode: vi.fn(),
    setTrajectoryFrameOverrides: vi.fn(),
    toggleSource: vi.fn(),
    trackingMode: "free",
    trajectories: new Map(),
    trajectoryFrameByTopic: new Map(),
    updateCameraTargetFrameId: vi.fn(),
    updateWorldFrameId: vi.fn(),
    worldFrameId: "",
    ...overrides,
  };
}

function source(
  id: string,
  label: string,
  type: string,
  recordCount?: number,
): SceneSource {
  return { id, label, recordCount, type };
}
