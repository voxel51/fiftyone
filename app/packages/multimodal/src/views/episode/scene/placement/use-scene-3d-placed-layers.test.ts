import {
  VISUALIZATION_KIND,
  type PointCloudVisualization,
} from "../../../../ir";
import { describe, expect, it } from "vitest";

import { pointCloudPlacementFrameIds } from "./use-scene-3d-placed-layers";

describe("scene 3D placed layers", () => {
  it("deduplicates populated point-cloud coordinate frames", () => {
    const frame = (coordinateFrameId?: string) => ({
      ageNs: 0n,
      contentTimeNs: 1n,
      frame: {
        ...(coordinateFrameId ? { coordinateFrameId } : {}),
        kind: VISUALIZATION_KIND.POINT_CLOUD,
      } as PointCloudVisualization,
      requestedTimeNs: 1n,
    });

    expect(
      pointCloudPlacementFrameIds([
        frame("lidar"),
        null,
        frame("lidar"),
        frame("ego"),
        frame(),
      ]),
    ).toEqual(["lidar", "ego"]);
  });
});
