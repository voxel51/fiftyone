import { describe, expect, it } from "vitest";

import type { PointCloudVisualization } from "../../../../ir";
import { pointCloudNativeIntegerScalarEncoding } from "../../../../ir";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { hoveredPointForFrame } from "./point-hover";

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

describe("hoveredPointForFrame", () => {
  it("snapshots position, frame, and every scalar channel at the index", () => {
    const hovered = hoveredPointForFrame("/lidar", pointCloudFrame(), 1);

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
    const hovered = hoveredPointForFrame(
      "/lidar",
      pointCloudFrame({ coordinateFrameId: undefined }),
      0,
    );

    expect(hovered?.frameId).toBeUndefined();
  });

  it("reads render-native hover data by sampled identity", () => {
    const positions = Float32Array.from([1, 2, 3, 4, 5, 6]);
    const intensity = Uint16Array.from([25, 75]);
    const frame = pointCloudFrame({
      positions,
      renderPayload: {
        bounds: { max: [4, 5, 6], min: [1, 2, 3] },
        capacity: 2,
        finitePointCount: 2,
        heightRange: { max: 6, min: 3 },
        positions,
        sampledPointCount: 2,
        scalarFields: [
          {
            encoding: pointCloudNativeIntegerScalarEncoding("uint16"),
            finiteValueCount: 2,
            name: "intensity",
            range: { max: 75, min: 25 },
            values: intensity,
          },
        ],
        sourceIndices: Uint32Array.from([2, 10]),
        sourcePointCount: 11,
      },
      scalarFields: [
        {
          name: "intensity",
          values: Float32Array.from([0.25, 0.75]),
        },
      ],
    });

    expect(hoveredPointForFrame("/lidar", frame, 10, 1)).toEqual({
      fields: { intensity: 75 },
      frameId: "LIDAR_TOP",
      kind: "point",
      pointIndex: 10,
      position: [4, 5, 6],
      stream: "/lidar",
    });
  });

  it("rejects out-of-range and non-finite picks", () => {
    expect(hoveredPointForFrame("/lidar", pointCloudFrame(), 2)).toBeNull();
    expect(hoveredPointForFrame("/lidar", pointCloudFrame(), -1)).toBeNull();
    expect(
      hoveredPointForFrame(
        "/lidar",
        pointCloudFrame({
          positions: Float32Array.from([Number.NaN, 2, 3]),
        }),
        0,
      ),
    ).toBeNull();
  });

  it("omits non-finite scalar metadata from the hover payload", () => {
    const hovered = hoveredPointForFrame(
      "/lidar",
      pointCloudFrame({
        scalarFields: [
          { name: "finite", values: Float32Array.from([1, 2]) },
          {
            name: "invalid",
            values: Float32Array.from([Number.NaN, Number.POSITIVE_INFINITY]),
          },
        ],
      }),
      1,
    );

    expect(hovered?.fields).toEqual({ finite: 2 });
  });
});
