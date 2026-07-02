import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneSource } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
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

beforeEach(() => {
  setTileTitleMock.mockClear();
  useSceneInventoryMock.mockReset();
});

afterEach(() => {
  cleanup();
});

const lidarTop = source("/lidar/top", MCAP_SOURCE_TYPE.POINT_CLOUD);
const lidarFront = source("/lidar/front", MCAP_SOURCE_TYPE.POINT_CLOUD);
const boxes = source("/labels/boxes", MCAP_SOURCE_TYPE.SCENE_ANNOTATION);
const frontImage = source(
  "/camera/front/image_rect_compressed",
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

  it("pairs calibrations with image streams and gates frustum images on the checkbox", () => {
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
    expect(result.current.showCameraImages).toBe(true);

    act(() => {
      result.current.setShowCameraImages(false);
    });
    expect(result.current.frustumImageTopics).toEqual([]);

    act(() => {
      result.current.setShowCameraImages(true);
    });
    expect(result.current.frustumImageTopics).toEqual([frontImage.id, ""]);
  });

  it("titles the tile after a single selected source, else the tile type", () => {
    const { result } = renderSelection([lidarTop, lidarFront]);

    expect(setTileTitleMock).toHaveBeenLastCalledWith("3D");

    act(() => {
      result.current.toggleSource(lidarFront.id, false);
    });
    expect(setTileTitleMock).toHaveBeenLastCalledWith(lidarTop.label);
  });
});

function renderSelection(sources: readonly SceneSource[]) {
  useSceneInventoryMock.mockReturnValue(sources);
  return renderHook(useMcap3dSelection);
}

function source(id: string, type: string): SceneSource {
  return { id, label: id, type };
}
