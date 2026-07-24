import { describe, expect, it } from "vitest";

import {
  buildPointCloudRenderPayload,
  MAX_POINT_CLOUD_RENDER_POINTS,
} from "./point-cloud-render-payload";
import { POINT_CLOUD_RGB_ENCODING } from "./point-cloud-channel-encoding";

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
    expect(payload.rgb?.encoding).toEqual(POINT_CLOUD_RGB_ENCODING);
    expect(Array.from(payload.rgb?.values.slice(0, 9) ?? [])).toEqual([
      255, 0, 0, 0, 0, 255, 64, 128, 191,
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
    expect(payload.rgb?.values).toHaveLength(payload.capacity * 3);
    expect(payload.positions).toBeInstanceOf(Float32Array);
    expect(payload.scalarFields[0].values).toHaveLength(payload.capacity);
    expect(payload.sourceIndices).toHaveLength(payload.capacity);
    expect(Array.from(payload.positions.slice(9, 12))).toEqual([0, 0, 0]);
  });

  it("caps dense clouds at exactly 150k unique nested samples", () => {
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
    expect(Array.from(payload.sourceIndices.slice(0, 4))).toEqual([
      0, 131_072, 65_536, 32_768,
    ]);
    const sourceIndices = new Set(payload.sourceIndices);
    expect(sourceIndices.size).toBe(payload.sampledPointCount);
    expect(
      Array.from(sourceIndices).every(
        (sourceIndex) => sourceIndex < sourcePointCount,
      ),
    ).toBe(true);
    expect(Array.from(payload.positions.slice(0, 12))).toEqual([
      0, -0, 0, 131_072, -131_072, 65_536, 65_536, -65_536, 32_768, 32_768,
      -32_768, 16_384,
    ]);
  });

  it("keeps lower draw budgets as stable prefixes", () => {
    const positions = new Float32Array(16 * 3);
    for (let pointIndex = 0; pointIndex < 16; pointIndex++) {
      positions[pointIndex * 3] = pointIndex;
    }

    const payload = buildPointCloudRenderPayload({ positions });

    expect(Array.from(payload.sourceIndices.slice(0, 4))).toEqual([
      0, 8, 4, 12,
    ]);
    expect(Array.from(payload.sourceIndices.slice(0, 8))).toEqual([
      0, 8, 4, 12, 2, 10, 6, 14,
    ]);
  });

  it("retains every source index when the cloud fits the payload budget", () => {
    const pointCount = 1_025;
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array(pointCount * 3),
    });

    expect(new Set(payload.sourceIndices.slice(0, pointCount)).size).toBe(
      pointCount,
    );
  });

  it("rounds intermediate capacities up to a power of two", () => {
    const pointCount = 1_025;
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array(pointCount * 3),
    });

    expect(payload.capacity).toBe(2_048);
    expect(payload.sampledPointCount).toBe(pointCount);
    expect(payload.positions).toHaveLength(payload.capacity * 3);
    expect(payload.sourceIndices[pointCount]).toBe(0);
  });

  it("uses fine-grained buckets for large payloads", () => {
    const pointCount = 65_537;
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array(pointCount * 3),
    });

    expect(payload.capacity).toBe(69_632);
    expect(payload.capacity - payload.sampledPointCount).toBeLessThan(4_096);
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

    expect(payload.rgb).toBeUndefined();
  });
});
