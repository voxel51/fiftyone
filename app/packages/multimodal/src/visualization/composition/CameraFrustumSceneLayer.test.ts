import { describe, expect, it } from "vitest";

import { VISUALIZATION_KIND } from "../visualization-registry";
import {
  createCameraFrustumGeometry,
  createCameraImagePlaneGeometry,
} from "./CameraFrustumSceneLayer";
import type { CameraImageRayModel } from "../scene-3d/types";

const frame = {
  height: 100,
  K: [50, 0, 50, 0, 50, 50, 0, 0, 1],
  kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
  width: 100,
} as const;

describe("camera ray frustum geometry", () => {
  it("samples model-aware boundary rays including the rear hemisphere", () => {
    const rayModel: CameraImageRayModel = {
      height: 100,
      rayForPixel: (u, v) => {
        const theta = (u / 99) * 2;
        return [Math.sin(theta), (v - 49.5) / 100, Math.cos(theta)];
      },
      width: 100,
    };
    const geometry = createCameraFrustumGeometry(frame, 2, rayModel);
    const positions = geometry?.getAttribute("position").array ?? [];

    expect(positions.length).toBeGreaterThan(16 * 3);
    expect(
      Array.from(positions).some(
        (value, index) => index % 3 === 2 && value < 0,
      ),
    ).toBe(true);
    geometry?.dispose();
  });

  it("builds a subdivided textured ray surface", () => {
    const rayModel: CameraImageRayModel = {
      height: 100,
      rayForPixel: (u, v) => [(u - 50) / 50, (v - 50) / 50, 1],
      width: 100,
    };
    const geometry = createCameraImagePlaneGeometry(frame, 2, rayModel);

    expect(geometry?.getAttribute("position").count).toBeGreaterThan(4);
    expect(geometry?.getAttribute("uv").count).toBeGreaterThan(4);
    expect(geometry?.getIndex()?.count).toBeGreaterThan(6);
    geometry?.dispose();
  });
});
