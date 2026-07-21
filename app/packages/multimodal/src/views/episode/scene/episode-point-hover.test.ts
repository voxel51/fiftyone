import { describe, expect, it } from "vitest";

import type { PointCloudVisualization } from "../../../ir";
import { VISUALIZATION_KIND } from "../../../visualization";
import { episodeHoveredPointForFrame } from "./episode-point-hover";

function pointCloudFrame(
  overrides: Partial<PointCloudVisualization> = {},
): PointCloudVisualization {
  return {
    coordinateFrameId: "LIDAR_TOP",
    fields: [],
    kind: VISUALIZATION_KIND.POINT_CLOUD,
    pointCount: 2,
    positions: Float32Array.from([1, 2, 3, 4, 5, 6]),
    scalarFields: [
      { name: "intensity", values: Float32Array.from([0.25, 0.75]) },
      { name: "ring", values: Float32Array.from([7, 9]) },
    ],
    ...overrides,
  };
}

describe("episodeHoveredPointForFrame", () => {
  it("snapshots position, frame, and every scalar channel at the index", () => {
    const hovered = episodeHoveredPointForFrame("/lidar", pointCloudFrame(), 1);

    expect(hovered).toEqual({
      fields: { intensity: 0.75, ring: 9 },
      frameId: "LIDAR_TOP",
      kind: "point",
      pointIndex: 1,
      position: [4, 5, 6],
      stream: "/lidar",
    });
  });

  it("omits the frame id when the message carries none", () => {
    const hovered = episodeHoveredPointForFrame(
      "/lidar",
      pointCloudFrame({ coordinateFrameId: undefined }),
      0,
    );

    expect(hovered?.frameId).toBeUndefined();
  });

  it("rejects out-of-range and non-finite picks", () => {
    expect(
      episodeHoveredPointForFrame("/lidar", pointCloudFrame(), 2),
    ).toBeNull();
    expect(
      episodeHoveredPointForFrame("/lidar", pointCloudFrame(), -1),
    ).toBeNull();
    expect(
      episodeHoveredPointForFrame(
        "/lidar",
        pointCloudFrame({
          positions: Float32Array.from([Number.NaN, 2, 3]),
        }),
        0,
      ),
    ).toBeNull();
  });
});
