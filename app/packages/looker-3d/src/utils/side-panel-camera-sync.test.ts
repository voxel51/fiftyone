import { Box3, OrthographicCamera, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  PANEL_ID_MAIN,
  PANEL_ID_SIDE_TOP,
  VIEW_TYPE_FRONT,
  VIEW_TYPE_TOP,
} from "../constants";
import type { RaycastResult } from "../types";
import { createPointCloudCropFromDetection } from "./point-cloud-crop";
import type { PointCloudCrop } from "./point-cloud-crop";
import {
  applySidePanelCameraFrame,
  applyMainPanelPanSyncIntentToOrthographicCamera,
  applyMainPanelZoomSyncIntentToOrthographicCamera,
  captureSidePanelCameraSnapshot,
  createMainPanelPanSyncIntent,
  createMainPanelZoomSyncIntent,
  deriveSidePanelCameraFrame,
  deriveSidePanelCameraUpdateFromMainViewer,
  doesPointCloudCropFitCamera,
  getOrbitControlsWheelZoomRatio,
  retargetSidePanelCameraFrame,
  restoreSidePanelCameraSnapshot,
  shouldApplyMainPanelPanSyncIntent,
  shouldApplyMainPanelZoomSyncIntent,
} from "./side-panel-camera-sync";

const buildRaycastResult = (
  overrides: Partial<RaycastResult> = {}
): RaycastResult => ({
  sourcePanel: PANEL_ID_MAIN,
  worldPosition: [1, 2, 3],
  intersectedObjectUuid: "point-cloud",
  isPointCloud: true,
  pointIndex: 1,
  distance: 10,
  timestamp: 100,
  ...overrides,
});

const buildIntent = () => ({
  id: "intent-1",
  anchor: [1, 2, 3] as [number, number, number],
  zoomRatio: 2,
  timestamp: 100,
});

const buildSelectionCrop = (): PointCloudCrop => {
  return createPointCloudCropFromDetection(
    {
      _cls: "Detection",
      _id: "detection-1",
      path: "ground_truth",
      location: [0, 0, 0],
      dimensions: [4, 4, 4],
      rotation: [0, 0, 0],
    },
    { margin: 0, source: "selection" }
  )!;
};

describe("side panel camera sync", () => {
  it("derives side-panel camera frames from view type, target, and scene size", () => {
    const frame = deriveSidePanelCameraFrame({
      sceneBoundingBox: new Box3(new Vector3(-1, -2, -3), new Vector3(3, 2, 1)),
      target: new Vector3(1, 2, 3),
      upVector: new Vector3(0, 1, 0),
      viewType: VIEW_TYPE_FRONT,
    });

    expect(frame.direction.toArray()).toEqual([0, 0, 1]);
    expect(frame.distance).toBe(10);
    expect(frame.position.toArray()).toEqual([1, 2, 13]);
    expect(frame.target.toArray()).toEqual([1, 2, 3]);
    expect(frame.up.toArray()).toEqual([0, 1, 0]);
  });

  it("keeps fallback side-panel frames centered on the provided target", () => {
    const frame = deriveSidePanelCameraFrame({
      target: new Vector3(5, 6, 7),
      upVector: new Vector3(0, 1, 0),
      viewType: VIEW_TYPE_TOP,
    });

    expect(frame.position.toArray()).toEqual([5, 16, 7]);
    expect(frame.target.toArray()).toEqual([5, 6, 7]);
  });

  it("retargets side-panel camera frames without changing view direction", () => {
    const frame = deriveSidePanelCameraFrame({
      target: new Vector3(1, 2, 3),
      upVector: new Vector3(0, 1, 0),
      viewType: VIEW_TYPE_TOP,
    });
    const retargeted = retargetSidePanelCameraFrame(
      frame,
      new Vector3(10, 20, 30)
    );

    expect(retargeted.direction.toArray()).toEqual([0, 1, 0]);
    expect(retargeted.distance).toBe(frame.distance);
    expect(retargeted.position.toArray()).toEqual([10, 30, 30]);
    expect(retargeted.target.toArray()).toEqual([10, 20, 30]);
    expect(retargeted.up.toArray()).toEqual(frame.up.toArray());
  });

  it("applies side-panel camera frames to both camera and controls", () => {
    const frame = deriveSidePanelCameraFrame({
      target: new Vector3(5, 6, 7),
      upVector: new Vector3(0, 1, 0),
      viewType: VIEW_TYPE_TOP,
    });
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const controls = {
      target: new Vector3(0, 0, 0),
      update: vi.fn(),
    };
    const invalidate = vi.fn();

    applySidePanelCameraFrame({
      camera,
      controls,
      frame,
      invalidate,
    });

    const worldDirection = new Vector3();
    camera.getWorldDirection(worldDirection);

    expect(camera.position.toArray()).toEqual([5, 16, 7]);
    expect(camera.up.toArray()).toEqual(frame.up.toArray());
    expect(worldDirection.x).toBeCloseTo(0);
    expect(worldDirection.y).toBeCloseTo(-1);
    expect(worldDirection.z).toBeCloseTo(0);
    expect(controls.target.toArray()).toEqual([5, 6, 7]);
    expect(controls.update).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("derives side-panel camera updates from a main-view anchor", () => {
    const update = deriveSidePanelCameraUpdateFromMainViewer({
      currentPosition: new Vector3(0, 0, 10),
      currentTarget: new Vector3(0, 0, 0),
      currentZoom: 4,
      mainAnchor: new Vector3(2, 0, 0),
      panDamping: 0.5,
      zoomRatio: 0.5,
    });

    expect(update.position.toArray()).toEqual([1, 0, 10]);
    expect(update.target.toArray()).toEqual([1, 0, 0]);
    expect(update.zoom).toBe(2);
  });

  it("maps orbit-controls wheel direction to orthographic zoom ratios", () => {
    expect(getOrbitControlsWheelZoomRatio(-1)).toBeGreaterThan(1);
    expect(getOrbitControlsWheelZoomRatio(1)).toBeLessThan(1);
    expect(getOrbitControlsWheelZoomRatio(0)).toBeNull();
  });

  it("creates a sync intent only for main-panel wheel zooms with raycast hits", () => {
    expect(
      createMainPanelZoomSyncIntent({
        activeCursorPanel: PANEL_ID_MAIN,
        deltaY: -1,
        id: "intent-1",
        raycastResult: buildRaycastResult(),
        timestamp: 101,
      })
    ).toMatchObject({
      id: "intent-1",
      anchor: [1, 2, 3],
      timestamp: 101,
    });

    expect(
      createMainPanelZoomSyncIntent({
        activeCursorPanel: PANEL_ID_SIDE_TOP,
        deltaY: -1,
        id: "intent-2",
        raycastResult: buildRaycastResult(),
        timestamp: 101,
      })
    ).toBeNull();

    expect(
      createMainPanelZoomSyncIntent({
        activeCursorPanel: PANEL_ID_MAIN,
        deltaY: -1,
        id: "intent-3",
        raycastResult: buildRaycastResult({ worldPosition: null }),
        timestamp: 101,
      })
    ).toBeNull();
  });

  it("creates a pan sync intent only during main-panel drags with raycast hits", () => {
    expect(
      createMainPanelPanSyncIntent({
        id: "pan-1",
        isMainPanelPointerDrag: true,
        raycastResult: buildRaycastResult(),
        timestamp: 101,
      })
    ).toEqual({
      id: "pan-1",
      anchor: [1, 2, 3],
      timestamp: 101,
    });

    expect(
      createMainPanelPanSyncIntent({
        id: "pan-2",
        isMainPanelPointerDrag: false,
        raycastResult: buildRaycastResult(),
        timestamp: 101,
      })
    ).toBeNull();

    expect(
      createMainPanelPanSyncIntent({
        id: "pan-3",
        isMainPanelPointerDrag: true,
        raycastResult: buildRaycastResult({ worldPosition: null }),
        timestamp: 101,
      })
    ).toBeNull();
  });

  it("skips stale intents and higher-priority hover or creation focus", () => {
    const intent = buildIntent();

    expect(
      shouldApplyMainPanelZoomSyncIntent({
        intent,
        now: 1000,
      })
    ).toBe(false);

    expect(
      shouldApplyMainPanelZoomSyncIntent({
        intent,
        hasHoverFocus: true,
        now: 101,
      })
    ).toBe(false);

    expect(
      shouldApplyMainPanelZoomSyncIntent({
        intent,
        activeCrop: { ...buildSelectionCrop(), source: "creation" },
        now: 101,
      })
    ).toBe(false);

    expect(
      shouldApplyMainPanelPanSyncIntent({
        intent,
        now: 1000,
      })
    ).toBe(false);
  });

  it("allows selection crops only when the main-view anchor is inside the crop", () => {
    const crop = buildSelectionCrop();

    expect(
      shouldApplyMainPanelZoomSyncIntent({
        intent: { ...buildIntent(), anchor: [1, 1, 1] },
        activeCrop: crop,
        now: 101,
      })
    ).toBe(true);

    expect(
      shouldApplyMainPanelZoomSyncIntent({
        intent: { ...buildIntent(), anchor: [10, 0, 0] },
        activeCrop: crop,
        now: 101,
      })
    ).toBe(false);
  });

  it("checks whether a point-cloud crop is inside the side camera frame", () => {
    const camera = new OrthographicCamera(-3, 3, 3, -3, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    expect(doesPointCloudCropFitCamera(buildSelectionCrop(), camera)).toBe(
      true
    );
    expect(
      doesPointCloudCropFitCamera(
        createPointCloudCropFromDetection(
          {
            _cls: "Detection",
            _id: "detection-2",
            path: "ground_truth",
            location: [20, 0, 0],
            dimensions: [4, 4, 4],
            rotation: [0, 0, 0],
          },
          { margin: 0, source: "selection" }
        )!,
        camera
      )
    ).toBe(false);
  });

  it("captures and restores side-panel camera snapshots", () => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.set(1, 2, 3);
    camera.up.set(0, 1, 0);
    camera.zoom = 4;
    const controls = {
      target: new Vector3(4, 5, 6),
      update: vi.fn(),
    };
    const invalidate = vi.fn();
    const snapshot = captureSidePanelCameraSnapshot(camera, controls);

    camera.position.set(10, 20, 30);
    camera.up.set(1, 0, 0);
    camera.zoom = 8;
    controls.target.set(40, 50, 60);

    restoreSidePanelCameraSnapshot({
      camera,
      controls,
      invalidate,
      snapshot,
    });

    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(camera.up.toArray()).toEqual([0, 1, 0]);
    expect(camera.zoom).toBe(4);
    expect(controls.target.toArray()).toEqual([4, 5, 6]);
    expect(controls.update).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("pans side orthographic cameras to the raycast anchor and applies zoom", () => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.zoom = 3;
    const controls = {
      target: new Vector3(0, 0, 0),
      update: vi.fn(),
    };
    const invalidate = vi.fn();

    expect(
      applyMainPanelZoomSyncIntentToOrthographicCamera({
        camera,
        controls,
        intent: buildIntent(),
        invalidate,
      })
    ).toBe(true);

    expect(camera.zoom).toBe(6);
    expect(camera.position.toArray()).toEqual([1, 2, 13]);
    expect(controls.target.toArray()).toEqual([1, 2, 3]);
    expect(controls.update).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("pans side orthographic cameras toward the raycast anchor without changing zoom", () => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.zoom = 3;
    const controls = {
      target: new Vector3(0, 0, 0),
      update: vi.fn(),
    };
    const invalidate = vi.fn();

    expect(
      applyMainPanelPanSyncIntentToOrthographicCamera({
        camera,
        controls,
        damping: 0.5,
        intent: buildIntent(),
        invalidate,
      })
    ).toBe(true);

    expect(camera.zoom).toBe(3);
    expect(camera.position.toArray()).toEqual([0.5, 1, 11.5]);
    expect(controls.target.toArray()).toEqual([0.5, 1, 1.5]);
    expect(controls.update).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
