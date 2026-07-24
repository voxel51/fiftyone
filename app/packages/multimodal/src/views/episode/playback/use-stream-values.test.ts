import { describe, expect, it } from "vitest";

import type {
  PointCloudRenderChannelPayload,
  PointCloudVisualization,
} from "../../../ir";
import { VISUALIZATION_KIND } from "../../../ir";
import { applyPointCloudRenderChannel } from "./use-stream-values";

describe("point cloud render channel replacement", () => {
  it("reuses the exact geometry buffers when replacing a scalar channel", () => {
    const frame = pointCloudFrame();
    const positions = frame.renderPayload?.positions;
    const sourceIndices = frame.renderPayload?.sourceIndices;
    const bounds = frame.renderPayload?.bounds;
    const channel: PointCloudRenderChannelPayload = {
      kind: "scalar",
      samplePlanKey: "4:2",
      scalarField: {
        finiteValueCount: 2,
        name: "ring",
        range: { max: 8, min: 7 },
        values: new Float32Array(1_024).fill(7, 0, 1).fill(8, 1, 2),
      },
    };

    const result = applyPointCloudRenderChannel(frame, channel);

    expect(result).not.toBe(frame);
    expect(result.positions).toBe(frame.positions);
    expect(result.renderPayload?.positions).toBe(positions);
    expect(result.renderPayload?.sourceIndices).toBe(sourceIndices);
    expect(result.renderPayload?.bounds).toBe(bounds);
    expect(result.colors).toBeUndefined();
    expect(result.renderPayload?.colors).toBeUndefined();
    expect(result.scalarFields?.[0]?.name).toBe("ring");
    expect(Array.from(result.scalarFields?.[0]?.values ?? [])).toEqual([7, 8]);
    expect(result.renderPayload?.scalarFields).toEqual([channel.scalarField]);
  });

  it("ignores a channel from a different geometry sample plan", () => {
    const frame = pointCloudFrame();

    expect(
      applyPointCloudRenderChannel(frame, {
        kind: "none",
        samplePlanKey: "different-plan",
      }),
    ).toBe(frame);
  });
});

function pointCloudFrame(): PointCloudVisualization {
  const positions = new Float32Array(1_024 * 3);
  positions.set([1, 2, 3, 4, 5, 6]);
  const colors = new Float32Array(1_024 * 3);
  colors.set([1, 0, 0, 0, 1, 0]);
  const sourceIndices = new Uint32Array(1_024);
  sourceIndices.set([1, 3]);
  const bounds = {
    max: [4, 5, 6],
    min: [1, 2, 3],
  } as const;

  return {
    colors: colors.subarray(0, 6),
    fields: [],
    kind: VISUALIZATION_KIND.POINT_CLOUD,
    pointCount: 2,
    positions: positions.subarray(0, 6),
    renderPayload: {
      availableScalarFields: ["intensity", "ring"],
      bounds,
      capacity: 1_024,
      colors,
      finitePointCount: 4,
      hasRgb: true,
      heightRange: { max: 6, min: 3 },
      positions,
      sampledPointCount: 2,
      samplePlanKey: "4:2",
      scalarFields: [],
      sourceIndices,
      sourcePointCount: 4,
    },
  };
}
