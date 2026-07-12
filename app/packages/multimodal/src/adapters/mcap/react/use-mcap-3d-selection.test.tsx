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
import { useMcap3dSelection } from "./use-mcap-3d-selection";

const { setTileTitleMock, useSceneInventoryMock } = vi.hoisted(() => ({
  setTileTitleMock: vi.fn(),
  useSceneInventoryMock: vi.fn(),
}));

vi.mock("../../../scene-inventory", () => ({
  useSceneInventory: useSceneInventoryMock,
}));

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => setTileTitleMock,
}));

let viewStateStore: Mcap3dViewStateStore;

beforeEach(() => {
  setTileTitleMock.mockClear();
  useSceneInventoryMock.mockReset();
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
  it("enables every renderable source on mount and syncs appearing/disappearing sources", () => {
    const { rerender, result } = renderSelection([
      lidarTop,
      lidarFront,
      frontImage,
    ]);

    // Image sources are not 3D-renderable and never join the enabled set.
    expect(result.current.enabled).toEqual(
      new Set([lidarTop.id, lidarFront.id]),
    );

    useSceneInventoryMock.mockReturnValue([
      lidarTop,
      lidarFront,
      boxes,
      frontImage,
    ]);
    rerender();
    expect(result.current.enabled).toEqual(
      new Set([lidarTop.id, lidarFront.id, boxes.id]),
    );

    useSceneInventoryMock.mockReturnValue([lidarTop, boxes, frontImage]);
    rerender();
    expect(result.current.enabled).toEqual(new Set([lidarTop.id, boxes.id]));

    // A source that re-appears counts as new and is re-enabled.
    useSceneInventoryMock.mockReturnValue([
      lidarTop,
      lidarFront,
      boxes,
      frontImage,
    ]);
    rerender();
    expect(result.current.enabled).toEqual(
      new Set([lidarTop.id, lidarFront.id, boxes.id]),
    );
  });

  it("toggles sources and keeps a user-disabled source off through inventory churn", () => {
    const { rerender, result } = renderSelection([lidarTop, lidarFront]);

    expect(result.current.pointCloudTopics).toEqual([
      lidarTop.id,
      lidarFront.id,
    ]);
    expect(result.current.selectedTopics).toEqual([lidarTop.id, lidarFront.id]);

    act(() => {
      result.current.toggleSource(lidarFront.id, false);
    });
    expect(result.current.enabled).toEqual(new Set([lidarTop.id]));
    expect(result.current.pointCloudTopics).toEqual([lidarTop.id]);
    expect(result.current.selectedTopics).toEqual([lidarTop.id]);

    // A new source appearing re-syncs the set without resurrecting the
    // user-disabled source.
    useSceneInventoryMock.mockReturnValue([lidarTop, lidarFront, boxes]);
    rerender();
    expect(result.current.enabled).toEqual(new Set([lidarTop.id, boxes.id]));

    act(() => {
      result.current.toggleSource(lidarFront.id, true);
    });
    expect(result.current.enabled).toEqual(
      new Set([lidarTop.id, lidarFront.id, boxes.id]),
    );
  });

  it("fresh-mount defaults enable preferred equivalents without hiding raw sources", () => {
    const { result } = renderSelection([lidarRaw, lidarDownsampled, boxes]);

    expect(result.current.enabled).toEqual(
      new Set([lidarDownsampled.id, boxes.id]),
    );
    expect(result.current.pointCloudTopics).toEqual([lidarDownsampled.id]);

    act(() => {
      result.current.toggleSource(lidarRaw.id, true);
    });
    expect(result.current.enabled).toEqual(
      new Set([lidarRaw.id, lidarDownsampled.id, boxes.id]),
    );
    expect(new Set(result.current.pointCloudTopics)).toEqual(
      new Set([lidarRaw.id, lidarDownsampled.id]),
    );
  });

  it("pairs selected calibrations with image streams for frustum image planes", () => {
    const { result } = renderSelection([
      frontCalibration,
      rearCalibration,
      frontImage,
      lidarTop,
    ]);

    expect(result.current.cameraTopics).toEqual([
      frontCalibration.id,
      rearCalibration.id,
    ]);
    // Index-aligned with cameraTopics: unpaired calibrations get "".
    expect(result.current.frustumImageTopics).toEqual([frontImage.id, ""]);

    act(() => {
      result.current.toggleSource(frontCalibration.id, false);
    });
    expect(result.current.cameraTopics).toEqual([rearCalibration.id]);
    expect(result.current.frustumImageTopics).toEqual([""]);
  });

  it("pairs camera frustums with preferred image equivalents", () => {
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
      lidarTop,
      boxes,
    ]);
    const cameraIds = [frontCalibration.id, rearCalibration.id];

    act(() => {
      result.current.setSourcesEnabled(cameraIds, false);
    });
    expect(result.current.enabled).toEqual(new Set([lidarTop.id, boxes.id]));
    expect(result.current.cameraTopics).toEqual([]);
    expect(result.current.selectedTopics).toEqual([lidarTop.id, boxes.id]);

    act(() => {
      result.current.setSourcesEnabled(cameraIds, true);
    });
    expect(result.current.enabled).toEqual(
      new Set([frontCalibration.id, rearCalibration.id, lidarTop.id, boxes.id]),
    );
    expect(result.current.cameraTopics).toEqual([
      frontCalibration.id,
      rearCalibration.id,
    ]);
  });

  it("titles the tile after a single selected source, else the tile type", () => {
    const { result } = renderSelection([lidarTop, lidarFront]);

    expect(setTileTitleMock).toHaveBeenLastCalledWith("3D", {
      source: "auto",
    });

    act(() => {
      result.current.toggleSource(lidarFront.id, false);
    });
    expect(setTileTitleMock).toHaveBeenLastCalledWith(lidarTop.label, {
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
    expect(result.current.enabled).toEqual(
      new Set([lidarTop.id, lidarFront.id]),
    );
  });

  it("writes the selection state through to the view-state store", () => {
    const { result } = renderSelection([lidarTop, lidarFront]);

    expect(viewStateStore.getSnapshot()).toMatchObject({
      enabledSourceIds: [lidarTop.id, lidarFront.id],
      renderableSourceIds: [lidarTop.id, lidarFront.id],
    });

    act(() => {
      result.current.toggleSource(lidarFront.id, false);
    });
    expect(viewStateStore.getSnapshot()).toMatchObject({
      enabledSourceIds: [lidarTop.id],
    });
    expect(viewStateStore.getSnapshot()).not.toHaveProperty("showCameraImages");
  });
});

function renderSelection(
  sources: readonly SceneSource[],
  props: Parameters<typeof useMcap3dSelection>[0] = {},
) {
  useSceneInventoryMock.mockReturnValue(sources);
  return renderHook(() => useMcap3dSelection({ ...props, viewStateStore }));
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
