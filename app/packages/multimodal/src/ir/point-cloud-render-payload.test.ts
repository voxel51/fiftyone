import { describe, expect, it } from "vitest";

import {
  buildPointCloudRenderPayload,
  MAX_POINT_CLOUD_RENDER_POINTS,
} from "./point-cloud-render-payload";

describe("buildPointCloudRenderPayload", () => {
  it("aligns deterministic finite samples, colors, scalar values, and statistics", () => {
    const payload = buildPointCloudRenderPayload({
      colors: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 0.25, 0.5, 0.75]),
      positions: Float32Array.from([
        0,
        1,
        2,
        Number.NaN,
        2,
        3,
        3,
        4,
        5,
        6,
        7,
        8,
      ]),
      scalarFields: [
        {
          name: "intensity",
          values: Float32Array.from([10, 20, Number.POSITIVE_INFINITY, 40]),
        },
        {
          name: "ring",
          values: Float32Array.from([1, 2, 3, 4]),
        },
      ],
    });

    expect(payload).toMatchObject({
      bounds: { max: [6, 7, 8], min: [0, 1, 2] },
      capacity: 1_024,
      finitePointCount: 3,
      heightRange: { max: 8, min: 2 },
      sampledPointCount: 3,
    });
    expect(Array.from(payload.positions.slice(0, 9))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(Array.from(payload.colors?.slice(0, 9) ?? [])).toEqual([
      1, 0, 0, 0, 0, 1, 0.25, 0.5, 0.75,
    ]);
    expect(Array.from(payload.sourceIndices.slice(0, 3))).toEqual([0, 2, 3]);
    expect(
      payload.scalarFields.map(({ finiteValueCount, name, range }) => ({
        finiteValueCount,
        name,
        range,
      })),
    ).toEqual([
      { finiteValueCount: 2, name: "intensity", range: { max: 40, min: 10 } },
      { finiteValueCount: 3, name: "ring", range: { max: 4, min: 1 } },
    ]);
    expect(Array.from(payload.scalarFields[0].values.slice(0, 3))).toEqual([
      10,
      Number.POSITIVE_INFINITY,
      40,
    ]);
    expect(Array.from(payload.scalarFields[1].values.slice(0, 3))).toEqual([
      1, 3, 4,
    ]);

    // Capacity padding is inert; sampledPointCount is the only drawn prefix.
    expect(payload.positions).toHaveLength(payload.capacity * 3);
    expect(payload.colors).toHaveLength(payload.capacity * 3);
    expect(payload.scalarFields[0].values).toHaveLength(payload.capacity);
    expect(payload.sourceIndices).toHaveLength(payload.capacity);
    expect(Array.from(payload.positions.slice(9, 12))).toEqual([0, 0, 0]);
  });

  it("caps dense clouds at exactly 150k samples and includes both endpoints", () => {
    const sourcePointCount = MAX_POINT_CLOUD_RENDER_POINTS + 1;
    const positions = new Float32Array(sourcePointCount * 3);
    for (let index = 0; index < sourcePointCount; index++) {
      const offset = index * 3;
      positions[offset] = index;
      positions[offset + 1] = -index;
      positions[offset + 2] = index / 2;
    }

    const payload = buildPointCloudRenderPayload({ positions });

    expect(payload.capacity).toBe(MAX_POINT_CLOUD_RENDER_POINTS);
    expect(payload.finitePointCount).toBe(sourcePointCount);
    expect(payload.sampledPointCount).toBe(MAX_POINT_CLOUD_RENDER_POINTS);
    expect(payload.positions).toHaveLength(MAX_POINT_CLOUD_RENDER_POINTS * 3);
    expect(payload.sourceIndices).toHaveLength(MAX_POINT_CLOUD_RENDER_POINTS);
    expect(payload.sourceIndices[0]).toBe(0);
    expect(payload.sourceIndices[payload.sampledPointCount - 1]).toBe(
      sourcePointCount - 1,
    );
    let strictlyIncreasing = true;
    for (let index = 1; index < payload.sampledPointCount; index++) {
      if (payload.sourceIndices[index] <= payload.sourceIndices[index - 1]) {
        strictlyIncreasing = false;
        break;
      }
    }
    expect(strictlyIncreasing).toBe(true);
  });

  it("rounds intermediate capacities up to a power of two", () => {
    const pointCount = 1_025;
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array(pointCount * 3),
    });

    expect(payload.capacity).toBe(2_048);
    expect(payload.sampledPointCount).toBe(pointCount);
    expect(payload.positions).toHaveLength(payload.capacity * 3);
    expect(payload.sourceIndices[pointCount - 1]).toBe(pointCount - 1);
    expect(payload.sourceIndices[pointCount]).toBe(0);
  });

  it("uses the minimum capacity and null statistics for an empty cloud", () => {
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array(0),
      scalarFields: [{ name: "intensity", values: new Float32Array(0) }],
    });

    expect(payload).toMatchObject({
      bounds: null,
      capacity: 1_024,
      finitePointCount: 0,
      heightRange: null,
      sampledPointCount: 0,
    });
    expect(payload.positions).toHaveLength(3_072);
    expect(payload.sourceIndices).toHaveLength(1_024);
    expect(payload.scalarFields[0]).toMatchObject({
      finiteValueCount: 0,
      name: "intensity",
      range: null,
    });
    expect(payload.scalarFields[0].values).toHaveLength(1_024);
  });

  it("omits an RGB payload when the source colors are not point-aligned", () => {
    const payload = buildPointCloudRenderPayload({
      colors: Float32Array.from([1, 0, 0]),
      positions: Float32Array.from([0, 0, 0, 1, 1, 1]),
    });

    expect(payload.colors).toBeUndefined();
  });
});
