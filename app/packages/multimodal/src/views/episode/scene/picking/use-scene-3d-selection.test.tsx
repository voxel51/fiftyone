import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  type SceneSource,
} from "../../../../ir/index";
import { streamPrefix } from "../../../../stream-selection/index";
import {
  EMPTY_SCENE_3D_VIEW_STATE,
  createScene3dViewStateStore,
  type Scene3dViewStateStore,
  type Scene3dViewStateSnapshot,
} from "../camera/scene-3d-view-state";
import { PanelVisibilityProvider } from "../../tiles/panel-visibility";
import {
  selectProvisionalPointCloudStream,
  useScene3dSelection,
} from "./use-scene-3d-selection";

const { imageTileBindingsMock, setTileTitleMock, useSceneInventoryMock } =
  vi.hoisted(() => ({
    imageTileBindingsMock: vi.fn(),
    setTileTitleMock: vi.fn(),
    useSceneInventoryMock: vi.fn(),
  }));

vi.mock("../../../../scene-inventory/react/index", () => ({
  useSceneInventory: useSceneInventoryMock,
}));

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => setTileTitleMock,
  useTileId: () => "3d-1",
}));

vi.mock("../../tiles/tile-source-bindings", () => ({
  useImageTileBindings: imageTileBindingsMock,
}));

let viewStateStore: Scene3dViewStateStore;

beforeEach(() => {
  setTileTitleMock.mockClear();
  imageTileBindingsMock.mockReset();
  imageTileBindingsMock.mockReturnValue({});
  useSceneInventoryMock.mockReset();
  localStorage.clear();
  viewStateStore = createScene3dViewStateStore();
});

afterEach(() => {
  cleanup();
});

const lidarTop = source("/lidar/top", SCENE_SOURCE_TYPE.POINT_CLOUD);
const lidarFront = source("/lidar/front", SCENE_SOURCE_TYPE.POINT_CLOUD);
const lidarRaw = source("/lidar/points", SCENE_SOURCE_TYPE.POINT_CLOUD);
const lidarDownsampled = source(
  "/lidar/points_downsampled",
  SCENE_SOURCE_TYPE.POINT_CLOUD,
);
const boxes = source("/labels/boxes", SCENE_SOURCE_TYPE.SCENE_ANNOTATION);
const frontImage = source(
  "/camera/front/image_rect_compressed",
  SCENE_SOURCE_TYPE.IMAGE,
);
const rearImage = source(
  "/camera/rear/image_rect_compressed",
  SCENE_SOURCE_TYPE.IMAGE,
);
const frontCalibration = source(
  "/camera/front/camera_info",
  SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
);
const rearCalibration = source(
  "/camera/rear/camera_info",
  SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
);
const primaryImage = source(
  "/sensors/primary/image_rect_compressed",
  SCENE_SOURCE_TYPE.IMAGE,
);
const primaryLeftImage = source(
  "/sensors/primary/left/image_rect_compressed",
  SCENE_SOURCE_TYPE.IMAGE,
);
const primaryLeftImageDownsampled = source(
  "/sensors/primary/left/image_downsampled",
  SCENE_SOURCE_TYPE.IMAGE,
);
const primaryRightImage = source(
  "/sensors/primary/right/image_rect_compressed",
  SCENE_SOURCE_TYPE.IMAGE,
);
const primaryCalibration = source(
  "/sensors/primary/camera_info",
  SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
);
const primaryLeftCalibration = source(
  "/sensors/primary/left/camera_info",
  SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
);
const primaryRightCalibration = source(
  "/sensors/primary/right/camera_info",
  SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
);

describe("useScene3dSelection", () => {
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

    expect(result.current.pointCloudStreams).toEqual([lidarTop.id]);

    act(() => {
      result.current.toggleSource(lidarFront.id, true);
    });
    expect(result.current.pointCloudStreams).toEqual([
      lidarTop.id,
      lidarFront.id,
    ]);

    act(() => {
      result.current.toggleSource(lidarFront.id, false);
    });
    expect(result.current.enabled).toEqual(new Set([lidarTop.id]));
    expect(result.current.pointCloudStreams).toEqual([lidarTop.id]);
    expect(result.current.selectedStreams).toEqual([lidarTop.id]);

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
    const raw = source("20", SCENE_SOURCE_TYPE.POINT_CLOUD, "/lidar/points");
    const downsampled = source(
      "21",
      SCENE_SOURCE_TYPE.POINT_CLOUD,
      "/lidar/points_downsampled",
    );
    const { result } = renderSelection([raw, downsampled, boxes]);

    expect(result.current.enabled).toEqual(new Set([downsampled.id]));
    expect(result.current.pointCloudStreams).toEqual([downsampled.id]);

    act(() => {
      result.current.toggleSource(raw.id, true);
    });
    expect(result.current.enabled).toEqual(new Set([raw.id, downsampled.id]));
    expect(new Set(result.current.pointCloudStreams)).toEqual(
      new Set([raw.id, downsampled.id]),
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

    expect(result.current.cameraStreams).toEqual([frontCalibration.id]);
    expect(result.current.frustumImageStreams).toEqual([frontImage.id]);

    act(() => {
      result.current.toggleSource(frontCalibration.id, false);
    });
    expect(result.current.cameraStreams).toEqual([]);
    expect(result.current.frustumImageStreams).toEqual([]);
  });

  it("keeps cameras unchecked when no matching image tile is open", () => {
    const { result } = renderSelection([
      frontCalibration,
      rearCalibration,
      frontImage,
      lidarTop,
    ]);

    expect(result.current.cameraStreams).toEqual([]);
    expect(result.current.frustumImageStreams).toEqual([]);
  });

  it("tracks open image panes until the user customizes camera visibility", () => {
    imageTileBindingsMock.mockReturnValue({ "image-1": frontImage.id });
    const { rerender, result } = renderSelection([
      frontCalibration,
      frontImage,
      lidarTop,
    ]);
    expect(result.current.cameraStreams).toEqual([frontCalibration.id]);

    imageTileBindingsMock.mockReturnValue({});
    rerender();
    expect(result.current.cameraStreams).toEqual([]);

    act(() => result.current.toggleSource(frontCalibration.id, true));
    expect(result.current.frustumImageStreams).toEqual([frontImage.id]);

    imageTileBindingsMock.mockReturnValue({ "image-1": frontImage.id });
    rerender();
    imageTileBindingsMock.mockReturnValue({});
    rerender();
    expect(result.current.cameraStreams).toEqual([frontCalibration.id]);
  });

  it("keeps cameras automatic when the user enables an unrelated 3D source", () => {
    imageTileBindingsMock.mockReturnValue({ "image-1": frontImage.id });
    const { rerender, result } = renderSelection([
      frontCalibration,
      frontImage,
      lidarTop,
      boxes,
    ]);
    expect(result.current.cameraStreams).toEqual([frontCalibration.id]);

    act(() => result.current.toggleSource(boxes.id, true));
    imageTileBindingsMock.mockReturnValue({});
    rerender();

    expect(result.current.cameraStreams).toEqual([]);
    expect(result.current.sceneAnnotationStreams).toEqual([boxes.id]);
  });

  it("keeps the camera master choice after image panes reopen", () => {
    imageTileBindingsMock.mockReturnValue({ "image-1": frontImage.id });
    const { rerender, result } = renderSelection([
      frontCalibration,
      frontImage,
      lidarTop,
    ]);

    act(() => result.current.setSourcesEnabled([frontCalibration.id], false));
    imageTileBindingsMock.mockReturnValue({});
    rerender();
    imageTileBindingsMock.mockReturnValue({ "image-1": frontImage.id });
    rerender();

    expect(result.current.cameraStreams).toEqual([]);
  });

  it("pairs camera frustums with preferred image equivalents", () => {
    const calibration = source(
      "30",
      SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
      "/camera/front/camera_info",
    );
    const raw = source(
      "31",
      SCENE_SOURCE_TYPE.IMAGE,
      "/camera/front/image",
      calibration.id,
    );
    const downsampled = source(
      "32",
      SCENE_SOURCE_TYPE.IMAGE,
      "/camera/front/image_downsampled",
      calibration.id,
    );
    imageTileBindingsMock.mockReturnValue({
      "image-1": downsampled.id,
    });
    const { result } = renderSelection([calibration, raw, downsampled]);

    expect(result.current.frustumImageStreams).toEqual([downsampled.id]);
  });

  it("uses source names to rank provisional point clouds", () => {
    const radar = source(
      "40",
      SCENE_SOURCE_TYPE.POINT_CLOUD,
      "/radar/front/points",
    );
    const lidar = source(
      "41",
      SCENE_SOURCE_TYPE.POINT_CLOUD,
      "/lidar/top/points",
    );
    const frame = {} as NonNullable<
      Parameters<typeof selectProvisionalPointCloudStream>[1][number]
    >;

    expect(
      selectProvisionalPointCloudStream([radar, lidar], [frame, frame]),
    ).toBe(lidar.id);
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

    expect(result.current.cameraStreams).toEqual([
      primaryCalibration.id,
      primaryLeftCalibration.id,
      primaryRightCalibration.id,
    ]);
    expect(result.current.frustumImageStreams).toEqual([
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
    expect(result.current.cameraStreams).toEqual([]);
    expect(result.current.selectedStreams).toEqual([lidarTop.id]);

    act(() => {
      result.current.setSourcesEnabled(cameraIds, true);
    });
    expect(result.current.enabled).toEqual(
      new Set([frontCalibration.id, rearCalibration.id, lidarTop.id]),
    );
    expect(result.current.cameraStreams).toEqual([
      frontCalibration.id,
      rearCalibration.id,
    ]);
    expect(result.current.frustumImageStreams).toEqual([
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
    expect(result.current.pointCloudStreams).toEqual([lidarRaw.id]);
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

  it("keeps the outgoing source shape while the next stream is unbound", () => {
    let sourceKey = "source-a";
    useSceneInventoryMock.mockReturnValue([lidarTop]);
    const { rerender } = renderHook(
      () => useScene3dSelection({ sourceKey, viewStateStore }),
      {
        wrapper: ({ children }) => (
          <PanelVisibilityProvider scopeKey="dataset-a:field-a">
            {children}
          </PanelVisibilityProvider>
        ),
      },
    );

    expect(viewStateStore.getSnapshot().renderableSourceIds).toEqual([
      lidarTop.id,
    ]);

    sourceKey = "";
    useSceneInventoryMock.mockReturnValue([lidarFront, boxes]);
    rerender();
    expect(viewStateStore.getSnapshot().renderableSourceIds).toEqual([
      lidarTop.id,
    ]);

    sourceKey = "source-b";
    rerender();
    expect(viewStateStore.getSnapshot().renderableSourceIds).toEqual([
      lidarFront.id,
      boxes.id,
    ]);
  });

  it("restores per-tile visibility before applying fresh defaults", () => {
    const first = renderSelection([lidarTop, lidarFront, boxes]);
    expect(
      localStorage.getItem("fiftyone.episode.panel-visibility.v2"),
    ).toBeNull();
    act(() => {
      first.result.current.toggleSource(lidarFront.id, true);
      first.result.current.toggleSource(boxes.id, true);
    });
    expect(
      localStorage.getItem("fiftyone.episode.panel-visibility.v2"),
    ).not.toBeNull();
    expect(first.result.current.enabled).toEqual(
      new Set([lidarTop.id, lidarFront.id, boxes.id]),
    );
    first.unmount();

    viewStateStore = createScene3dViewStateStore();
    const restored = renderSelection([lidarTop, lidarFront, boxes]);
    expect(restored.result.current.enabled).toEqual(
      new Set([lidarTop.id, lidarFront.id, boxes.id]),
    );
  });

  it("restores label-only edits without freezing automatic cameras", () => {
    imageTileBindingsMock.mockReturnValue({ "image-1": frontImage.id });
    const first = renderSelection([
      frontCalibration,
      frontImage,
      lidarTop,
      boxes,
    ]);
    act(() => first.result.current.toggleSource(boxes.id, true));
    imageTileBindingsMock.mockReturnValue({});
    first.rerender();
    expect(first.result.current.cameraStreams).toEqual([]);
    first.unmount();

    viewStateStore = createScene3dViewStateStore();
    imageTileBindingsMock.mockReturnValue({ "image-1": frontImage.id });
    const restored = renderSelection([
      frontCalibration,
      frontImage,
      lidarTop,
      boxes,
    ]);

    expect(restored.result.current.cameraStreams).toEqual([
      frontCalibration.id,
    ]);
    expect(restored.result.current.sceneAnnotationStreams).toEqual([boxes.id]);
  });

  it("restores explicit camera edits as manual visibility", () => {
    const first = renderSelection([frontCalibration, frontImage, lidarTop]);
    act(() => first.result.current.toggleSource(frontCalibration.id, true));
    expect(first.result.current.cameraStreams).toEqual([frontCalibration.id]);
    first.unmount();

    viewStateStore = createScene3dViewStateStore();
    const restored = renderSelection([frontCalibration, frontImage, lidarTop]);

    expect(restored.result.current.cameraStreams).toEqual([
      frontCalibration.id,
    ]);
  });
});

function renderSelection(
  sources: readonly SceneSource[],
  props: Omit<Parameters<typeof useScene3dSelection>[0], "sourceKey"> & {
    readonly sourceKey?: string;
  } = {},
) {
  useSceneInventoryMock.mockReturnValue(sources);
  return renderHook(
    () =>
      useScene3dSelection({
        ...props,
        sourceKey: props.sourceKey ?? "source-a",
        viewStateStore,
      }),
    {
      wrapper: ({ children }) => (
        <PanelVisibilityProvider scopeKey="dataset-a:field-a">
          {children}
        </PanelVisibilityProvider>
      ),
    },
  );
}

function viewStateSnapshot(
  overrides: Partial<Scene3dViewStateSnapshot>,
): Scene3dViewStateSnapshot {
  return { ...EMPTY_SCENE_3D_VIEW_STATE, ...overrides };
}

function source(
  id: string,
  type: string,
  sourceName = id,
  calibrationStreamId?: string,
): SceneSource {
  const calibrationStream =
    type === SCENE_SOURCE_TYPE.IMAGE
      ? (calibrationStreamId ?? `${streamPrefix(sourceName)}/camera_info`)
      : null;
  return {
    id,
    label: sourceName,
    ...(calibrationStream
      ? {
          metadata: {
            [SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID]: calibrationStream,
          },
        }
      : {}),
    sourceName,
    type,
  };
}
