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
    expect(screen.getByText("2 of 2 selected")).toBeTruthy();
    expect(screen.queryByText("Show camera images")).toBeNull();
  });

  it("treats partial camera selection as switched on", () => {
    renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraTopics: [CAM_FRONT.id],
      enabled: new Set([CAM_FRONT.id]),
    });

    const toggle = screen.getByRole("switch", { name: "Toggle cameras" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("1 of 2 selected")).toBeTruthy();
  });

  it("calls the batch camera toggle with the next switch state", () => {
    const checkedProps = renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraTopics: [CAM_FRONT.id],
      enabled: new Set([CAM_FRONT.id]),
    });
    fireEvent.click(screen.getByRole("switch", { name: "Toggle cameras" }));
    expect(checkedProps.setCameraSourcesEnabled).toHaveBeenCalledWith(false);

    cleanup();

    const uncheckedProps = renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraTopics: [],
      enabled: new Set(),
    });
    fireEvent.click(screen.getByRole("switch", { name: "Toggle cameras" }));
    expect(uncheckedProps.setCameraSourcesEnabled).toHaveBeenCalledWith(true);
  });

  it("keeps individual camera checkboxes wired to per-source toggles", () => {
    const props = renderSettings({
      cameraSources: [CAM_FRONT, CAM_BACK],
      cameraTopics: [CAM_FRONT.id, CAM_BACK.id],
      enabled: new Set([CAM_FRONT.id, CAM_BACK.id]),
    });

    fireEvent.click(
      screen.getByRole("checkbox", { name: "CAM_FRONT/camera_info (233)" }),
    );

    expect(props.toggleSource).toHaveBeenCalledWith(CAM_FRONT.id, false);
  });

  it("does not render the camera master switch without camera sources", () => {
    renderSettings({
      cameraSources: [],
      cameraTopics: [],
      enabled: new Set([LIDAR.id]),
    });

    expect(screen.queryByRole("switch", { name: "Toggle cameras" })).toBeNull();
    expect(
      screen.getByText("No camera calibration topics available"),
    ).toBeTruthy();
  });
});

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
    sceneAnnotationSources: [],
    sceneAnnotationTopics: [],
    selectedPoseSources: [],
    setCameraSourcesEnabled: vi.fn(),
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
