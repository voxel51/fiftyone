import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneSource } from "../../../scene-inventory";
import { MCAP_SCENE_SOURCE_METADATA, MCAP_SOURCE_TYPE } from "../scene-sources";
import { topicPrefix } from "../topic-matching";
import {
  EMPTY_MCAP_3D_VIEW_STATE,
  createMcap3dViewStateStore,
  type Mcap3dViewStateStore,
  type Mcap3dViewStateSnapshot,
} from "./mcap-3d-view-state";
import { McapPanelVisibilityProvider } from "./mcap-panel-visibility";
import { useMcap3dSelection } from "./use-mcap-3d-selection";

const { imageTileBindingsMock, setTileTitleMock, useSceneInventoryMock } =
  vi.hoisted(() => ({
    imageTileBindingsMock: vi.fn(),
    setTileTitleMock: vi.fn(),
    useSceneInventoryMock: vi.fn(),
  }));

vi.mock("../../../scene-inventory", () => ({
  useSceneInventory: useSceneInventoryMock,
}));

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => setTileTitleMock,
  useTileId: () => "3d-1",
}));

vi.mock("./mcap-tile-source-bindings", () => ({
  useMcapImageTileBindings: imageTileBindingsMock,
}));

let viewStateStore: Mcap3dViewStateStore;

beforeEach(() => {
  setTileTitleMock.mockClear();
  imageTileBindingsMock.mockReset();
  imageTileBindingsMock.mockReturnValue({});
  useSceneInventoryMock.mockReset();
  localStorage.clear();
  viewStateStore = createMcap3dViewStateStore();
});

afterEach(() => {
  cleanup();
});

const lidarTop = source("/lidar/top", MCAP_SOURCE_TYPE.POINT_CLOUD);
const lidarFront = source("/lidar/front", MCAP_SOURCE_TYPE.POINT_CLOUD);
const lidarRaw = source("/lidar/points", MCAP_SOURCE_TYPE.POINT_CLOUD);
const lidarDownsampled = source(
  "/lidar/points_downsampled",
  MCAP_SOURCE_TYPE.POINT_CLOUD,
);
const boxes = source("/labels/boxes", MCAP_SOURCE_TYPE.SCENE_ANNOTATION);
const frontImage = source(
  "/camera/front/image_rect_compressed",
  MCAP_SOURCE_TYPE.IMAGE,
);
const frontImageDownsampled = source(
  "/camera/front/image_downsampled",
  MCAP_SOURCE_TYPE.IMAGE,
);
const rearImage = source(
  "/camera/rear/image_rect_compressed",
  MCAP_SOURCE_TYPE.IMAGE,
);
const frontCalibration = source(
  "/camera/front/camera_info",
  MCAP_SOURCE_TYPE.CAMERA_CALIBRATION,
);
const rearCalibration = source(
  "/camera/rear/camera_info",
  MCAP_SOURCE_TYPE.CAMERA_CALIBRATION,
);
const primaryImage = source(
  "/sensors/primary/image_rect_compressed",
  MCAP_SOURCE_TYPE.IMAGE,
);
const primaryLeftImage = source(
  "/sensors/primary/left/image_rect_compressed",
  MCAP_SOURCE_TYPE.IMAGE,
);
const primaryLeftImageDownsampled = source(
  "/sensors/primary/left/image_downsampled",
  MCAP_SOURCE_TYPE.IMAGE,
);
const primaryRightImage = source(
  "/sensors/primary/right/image_rect_compressed",
  MCAP_SOURCE_TYPE.IMAGE,
);
const primaryCalibration = source(
  "/sensors/primary/camera_info",
  MCAP_SOURCE_TYPE.CAMERA_CALIBRATION,
);
const primaryLeftCalibration = source(
  "/sensors/primary/left/camera_info",
  MCAP_SOURCE_TYPE.CAMERA_CALIBRATION,
);
const primaryRightCalibration = source(
  "/sensors/primary/right/camera_info",
  MCAP_SOURCE_TYPE.CAMERA_CALIBRATION,
);

describe("useMcap3dSelection", () => {
  it("enables one primary geometry and keeps newly discovered secondary sources off", () => {
    const { rerender, result } = renderSelection([
      lidarTop,
      lidarFront,
      frontImage,
    ]);

    expect(result.current.enabled).toEqual(new Set([lidarTop.id]));

    useSceneInventoryMock.mockReturnValue([
      lidarTop,
      lidarFront,
      boxes,
      frontImage,
    ]);
    rerender();
    expect(result.current.enabled).toEqual(new Set([lidarTop.id]));

    useSceneInventoryMock.mockReturnValue([lidarFront, boxes, frontImage]);
    rerender();
    expect(result.current.enabled).toEqual(new Set([lidarFront.id]));

    // A reappearing source is secondary and stays cold.
    useSceneInventoryMock.mockReturnValue([
      lidarTop,
      lidarFront,
      boxes,
      frontImage,
    ]);
    rerender();
    expect(result.current.enabled).toEqual(new Set([lidarFront.id]));
  });

  it("toggles sources and keeps a user-disabled source off through inventory churn", () => {
    const { rerender, result } = renderSelection([lidarTop, lidarFront]);

    expect(result.current.pointCloudTopics).toEqual([lidarTop.id]);

    act(() => {
      result.current.toggleSource(lidarFront.id, true);
    });
    expect(result.current.pointCloudTopics).toEqual([
      lidarTop.id,
      lidarFront.id,
    ]);

    act(() => {
      result.current.toggleSource(lidarFront.id, false);
    });
    expect(result.current.enabled).toEqual(new Set([lidarTop.id]));
    expect(result.current.pointCloudTopics).toEqual([lidarTop.id]);
    expect(result.current.selectedTopics).toEqual([lidarTop.id]);

    // Newly discovered labels remain off and the disabled cloud stays off.
    useSceneInventoryMock.mockReturnValue([lidarTop, lidarFront, boxes]);
    rerender();
    expect(result.current.enabled).toEqual(new Set([lidarTop.id]));

    act(() => {
      result.current.toggleSource(lidarFront.id, true);
    });
    expect(result.current.enabled).toEqual(
      new Set([lidarTop.id, lidarFront.id]),
    );
  });

  it("fresh-mount defaults enable preferred equivalents without hiding raw sources", () => {
    const { result } = renderSelection([lidarRaw, lidarDownsampled, boxes]);

    expect(result.current.enabled).toEqual(new Set([lidarDownsampled.id]));
    expect(result.current.pointCloudTopics).toEqual([lidarDownsampled.id]);

    act(() => {
      result.current.toggleSource(lidarRaw.id, true);
    });
    expect(result.current.enabled).toEqual(
      new Set([lidarRaw.id, lidarDownsampled.id]),
    );
    expect(new Set(result.current.pointCloudTopics)).toEqual(
      new Set([lidarRaw.id, lidarDownsampled.id]),
    );
  });

  it("pairs selected calibrations with image streams for frustum image planes", () => {
    imageTileBindingsMock.mockReturnValue({ "image-1": frontImage.id });
    const { result } = renderSelection([
      frontCalibration,
      rearCalibration,
      frontImage,
      lidarTop,
    ]);

    expect(result.current.cameraTopics).toEqual([frontCalibration.id]);
    expect(result.current.frustumImageTopics).toEqual([frontImage.id]);

    act(() => {
      result.current.toggleSource(frontCalibration.id, false);
    });
    expect(result.current.cameraTopics).toEqual([]);
    expect(result.current.frustumImageTopics).toEqual([]);
  });

  it("keeps cameras unchecked when no matching image tile is open", () => {
    const { result } = renderSelection([
      frontCalibration,
      rearCalibration,
      frontImage,
      lidarTop,
    ]);

    expect(result.current.cameraTopics).toEqual([]);
    expect(result.current.frustumImageTopics).toEqual([]);
  });

  it("tracks open image panes until the user customizes camera visibility", () => {
    imageTileBindingsMock.mockReturnValue({ "image-1": frontImage.id });
    const { rerender, result } = renderSelection([
      frontCalibration,
      frontImage,
      lidarTop,
    ]);
    expect(result.current.cameraTopics).toEqual([frontCalibration.id]);

    imageTileBindingsMock.mockReturnValue({});
    rerender();
    expect(result.current.cameraTopics).toEqual([]);

    act(() => result.current.toggleSource(frontCalibration.id, true));
    expect(result.current.frustumImageTopics).toEqual([frontImage.id]);

    imageTileBindingsMock.mockReturnValue({ "image-1": frontImage.id });
    rerender();
    imageTileBindingsMock.mockReturnValue({});
    rerender();
    expect(result.current.cameraTopics).toEqual([frontCalibration.id]);
  });

  it("pairs camera frustums with preferred image equivalents", () => {
    imageTileBindingsMock.mockReturnValue({
      "image-1": frontImageDownsampled.id,
    });
    const { result } = renderSelection([
      frontCalibration,
      frontImage,
      frontImageDownsampled,
    ]);

    expect(result.current.frustumImageTopics).toEqual([
      frontImageDownsampled.id,
    ]);
  });

  it("pairs qualified camera streams independently for frustum images", () => {
    imageTileBindingsMock.mockReturnValue({
      "image-1": primaryImage.id,
      "image-2": primaryLeftImageDownsampled.id,
      "image-3": primaryRightImage.id,
    });
    const { result } = renderSelection([
      primaryCalibration,
      primaryLeftCalibration,
      primaryRightCalibration,
      primaryImage,
      primaryLeftImage,
      primaryLeftImageDownsampled,
      primaryRightImage,
    ]);

    expect(result.current.cameraTopics).toEqual([
      primaryCalibration.id,
      primaryLeftCalibration.id,
      primaryRightCalibration.id,
    ]);
    expect(result.current.frustumImageTopics).toEqual([
      primaryImage.id,
      primaryLeftImageDownsampled.id,
      primaryRightImage.id,
    ]);
  });

  it("batch-toggles the given sources without touching other 3D sources", () => {
    const { result } = renderSelection([
      frontCalibration,
      rearCalibration,
      frontImage,
      rearImage,
      lidarTop,
      boxes,
    ]);
    const cameraIds = [frontCalibration.id, rearCalibration.id];

    act(() => {
      result.current.setSourcesEnabled(cameraIds, false);
    });
    expect(result.current.enabled).toEqual(new Set([lidarTop.id]));
    expect(result.current.cameraTopics).toEqual([]);
    expect(result.current.selectedTopics).toEqual([lidarTop.id]);

    act(() => {
      result.current.setSourcesEnabled(cameraIds, true);
    });
    expect(result.current.enabled).toEqual(
      new Set([frontCalibration.id, rearCalibration.id, lidarTop.id]),
    );
    expect(result.current.cameraTopics).toEqual([
      frontCalibration.id,
      rearCalibration.id,
    ]);
    expect(result.current.frustumImageTopics).toEqual([
      frontImage.id,
      rearImage.id,
    ]);
  });

  it("titles the tile after a single selected source, else the tile type", () => {
    const { result } = renderSelection([lidarTop, lidarFront]);

    expect(setTileTitleMock).toHaveBeenLastCalledWith(lidarTop.label, {
      source: "auto",
    });

    act(() => {
      result.current.toggleSource(lidarFront.id, true);
    });
    expect(setTileTitleMock).toHaveBeenLastCalledWith("3D", {
      source: "auto",
    });
  });

  it("restores the enabled set on a strict shape match", () => {
    const { result } = renderSelection([lidarTop, lidarFront, boxes], {
      restore: viewStateSnapshot({
        enabledSourceIds: [lidarTop.id, boxes.id],
        renderableSourceIds: [boxes.id, lidarFront.id, lidarTop.id],
      }),
    });

    expect(result.current.restoredSourceShapeMatches).toBe(true);
    expect(result.current.enabled).toEqual(new Set([lidarTop.id, boxes.id]));
  });

  it("strict shape-match restore can preserve an explicitly enabled raw source", () => {
    const { result } = renderSelection([lidarRaw, lidarDownsampled], {
      restore: viewStateSnapshot({
        enabledSourceIds: [lidarRaw.id],
        renderableSourceIds: [lidarRaw.id, lidarDownsampled.id],
      }),
    });

    expect(result.current.restoredSourceShapeMatches).toBe(true);
    expect(result.current.enabled).toEqual(new Set([lidarRaw.id]));
    expect(result.current.pointCloudTopics).toEqual([lidarRaw.id]);
  });

  it("falls back to fresh-mount defaults when the source shape differs", () => {
    const { result } = renderSelection([lidarTop, lidarFront], {
      restore: viewStateSnapshot({
        enabledSourceIds: [lidarTop.id],
        renderableSourceIds: [lidarTop.id, boxes.id],
      }),
    });

    expect(result.current.restoredSourceShapeMatches).toBe(false);
    expect(result.current.enabled).toEqual(new Set([lidarTop.id]));
  });

  it("writes the selection state through to the view-state store", () => {
    const { result } = renderSelection([lidarTop, lidarFront]);

    expect(viewStateStore.getSnapshot()).toMatchObject({
      enabledSourceIds: [lidarTop.id],
      renderableSourceIds: [lidarTop.id, lidarFront.id],
    });

    act(() => {
      result.current.toggleSource(lidarFront.id, true);
    });
    expect(viewStateStore.getSnapshot()).toMatchObject({
      enabledSourceIds: [lidarTop.id, lidarFront.id],
    });
    expect(viewStateStore.getSnapshot()).not.toHaveProperty("showCameraImages");
  });

  it("restores per-tile visibility before applying fresh defaults", () => {
    const first = renderSelection([lidarTop, lidarFront, boxes]);
    expect(localStorage.getItem("fiftyone.mcap.panel-visibility")).toBeNull();
    act(() => {
      first.result.current.toggleSource(lidarFront.id, true);
      first.result.current.toggleSource(boxes.id, true);
    });
    expect(
      localStorage.getItem("fiftyone.mcap.panel-visibility"),
    ).not.toBeNull();
    expect(first.result.current.enabled).toEqual(
      new Set([lidarTop.id, lidarFront.id, boxes.id]),
    );
    first.unmount();

    viewStateStore = createMcap3dViewStateStore();
    const restored = renderSelection([lidarTop, lidarFront, boxes]);
    expect(restored.result.current.enabled).toEqual(
      new Set([lidarTop.id, lidarFront.id, boxes.id]),
    );
  });
});

function renderSelection(
  sources: readonly SceneSource[],
  props: Parameters<typeof useMcap3dSelection>[0] = {},
) {
  useSceneInventoryMock.mockReturnValue(sources);
  return renderHook(() => useMcap3dSelection({ ...props, viewStateStore }), {
    wrapper: ({ children }) => (
      <McapPanelVisibilityProvider scopeKey="dataset-a:field-a">
        {children}
      </McapPanelVisibilityProvider>
    ),
  });
}

function viewStateSnapshot(
  overrides: Partial<Mcap3dViewStateSnapshot>,
): Mcap3dViewStateSnapshot {
  return { ...EMPTY_MCAP_3D_VIEW_STATE, ...overrides };
}

function source(id: string, type: string): SceneSource {
  const calibrationTopic =
    type === MCAP_SOURCE_TYPE.IMAGE ? `${topicPrefix(id)}/camera_info` : null;
  return {
    id,
    label: id,
    ...(calibrationTopic
      ? {
          metadata: {
            [MCAP_SCENE_SOURCE_METADATA.CALIBRATION_TOPIC]: calibrationTopic,
          },
        }
      : {}),
    type,
  };
}
