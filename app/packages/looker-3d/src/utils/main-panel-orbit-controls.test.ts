import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  getMainPanelCloseNavigationDistance,
  getMainPanelOrbitPanSpeed,
  getMainPanelOrbitZoomSpeed,
  MAIN_PANEL_CAMERA_TARGET_EPSILON,
  MAIN_PANEL_CLOSE_PAN_MAX_SPEED,
  MAIN_PANEL_CLOSE_ZOOM_MAX_SPEED,
  MAIN_PANEL_ORBIT_PAN_SPEED,
  syncMainPanelOrbitControls,
} from "./main-panel-orbit-controls";
import { MAIN_PANEL_ORBIT_ZOOM_SPEED } from "./side-panel-camera-sync";

const makeSceneBounds = () =>
  new Box3(new Vector3(-10, 0, 0), new Vector3(10, 0, 0));

describe("main panel orbit controls", () => {
  it("derives a scene-scaled close navigation distance", () => {
    expect(getMainPanelCloseNavigationDistance(makeSceneBounds())).toBeCloseTo(
      0.6
    );
    expect(getMainPanelCloseNavigationDistance(null)).toBe(0.1);
  });

  it("keeps normal orbit speeds outside the close navigation range", () => {
    expect(
      getMainPanelOrbitZoomSpeed({
        distance: 2,
        sceneBoundingBox: makeSceneBounds(),
      })
    ).toBe(MAIN_PANEL_ORBIT_ZOOM_SPEED);
    expect(
      getMainPanelOrbitPanSpeed({
        distance: 2,
        sceneBoundingBox: makeSceneBounds(),
      })
    ).toBe(MAIN_PANEL_ORBIT_PAN_SPEED);
  });

  it("increases orbit zoom speed as the camera gets close to the target", () => {
    const sceneBoundingBox = makeSceneBounds();
    const closeSpeed = getMainPanelOrbitZoomSpeed({
      distance: 0.1,
      sceneBoundingBox,
    });
    const veryCloseSpeed = getMainPanelOrbitZoomSpeed({
      distance: 0.01,
      sceneBoundingBox,
    });

    expect(closeSpeed).toBeGreaterThan(MAIN_PANEL_ORBIT_ZOOM_SPEED);
    expect(veryCloseSpeed).toBeGreaterThan(closeSpeed);
    expect(veryCloseSpeed).toBeLessThanOrEqual(MAIN_PANEL_CLOSE_ZOOM_MAX_SPEED);
  });

  it("gently increases orbit pan speed as the camera gets close to the target", () => {
    const sceneBoundingBox = makeSceneBounds();
    const closeSpeed = getMainPanelOrbitPanSpeed({
      distance: 0.1,
      sceneBoundingBox,
    });
    const veryCloseSpeed = getMainPanelOrbitPanSpeed({
      distance: 0.01,
      sceneBoundingBox,
    });

    expect(closeSpeed).toBeGreaterThan(MAIN_PANEL_ORBIT_PAN_SPEED);
    expect(veryCloseSpeed).toBeGreaterThan(closeSpeed);
    expect(veryCloseSpeed).toBeLessThanOrEqual(MAIN_PANEL_CLOSE_PAN_MAX_SPEED);
  });

  it("uses max speed at the camera-target floor so zooming and panning stay responsive", () => {
    const distance = MAIN_PANEL_CAMERA_TARGET_EPSILON;
    const sceneBoundingBox = makeSceneBounds();

    expect(
      getMainPanelOrbitZoomSpeed({
        distance,
        sceneBoundingBox,
      })
    ).toBe(MAIN_PANEL_CLOSE_ZOOM_MAX_SPEED);
    expect(
      getMainPanelOrbitPanSpeed({
        distance,
        sceneBoundingBox,
      })
    ).toBe(MAIN_PANEL_CLOSE_PAN_MAX_SPEED);
  });

  it("syncs orbit controls min distance and close-range speeds", () => {
    const controls = {
      getDistance: () => 0.1,
      minDistance: 0,
      panSpeed: MAIN_PANEL_ORBIT_PAN_SPEED,
      zoomSpeed: MAIN_PANEL_ORBIT_ZOOM_SPEED,
    };

    syncMainPanelOrbitControls({
      controls,
      sceneBoundingBox: makeSceneBounds(),
    });

    expect(controls.minDistance).toBe(MAIN_PANEL_CAMERA_TARGET_EPSILON);
    expect(controls.zoomSpeed).toBeGreaterThan(MAIN_PANEL_ORBIT_ZOOM_SPEED);
    expect(controls.panSpeed).toBeGreaterThan(MAIN_PANEL_ORBIT_PAN_SPEED);
  });
});
