import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../ir";
import type { PointCloudVisualization } from "../../../../ir";
import { foxgloveLaserScanDecoder } from "./laser-scan";
import { decodeProtobufMessage } from "./protobuf";

vi.mock("./protobuf", () => ({
  decodeProtobufMessage: vi.fn(),
}));

const EMPTY_BYTES = new Uint8Array(0);
const mockDecode = vi.mocked(decodeProtobufMessage);

beforeEach(() => {
  mockDecode.mockReset();
});

describe("foxgloveLaserScanDecoder", () => {
  it("declares the foxglove.LaserScan payload descriptor", () => {
    expect(foxgloveLaserScanDecoder.payload).toMatchObject({
      encoding: "protobuf",
      schema: "foxglove.LaserScan",
      schemaEncoding: "protobuf",
    });
  });

  it("converts equally-spaced polar ranges into cartesian points", () => {
    // Quarter-circle sweep with unit ranges: bearings 0, 45°, 90° inclusive.
    mockDecode.mockReturnValue(
      laserScanMessage({
        endAngle: Math.PI / 2,
        ranges: [1, 1, 1],
        startAngle: 0,
      }),
    );

    const { attributes, resourceHints, timing, visualization } =
      foxgloveLaserScanDecoder.decode(EMPTY_BYTES, {});
    const cloud = expectPointCloud(visualization);

    expect(cloud.pointCount).toBe(3);
    expect(cloud.coordinateFrameId).toBe("SCAN_TEST");
    expect(cloud.fields).toEqual([]);
    expectPositionsCloseTo(cloud.positions, [
      [1, 0, 0],
      [Math.SQRT1_2, Math.SQRT1_2, 0],
      [0, 1, 0],
    ]);
    const renderPayload = cloud.renderPayload;
    if (!renderPayload) {
      throw new Error("Expected point cloud render payload");
    }
    expect(renderPayload).toMatchObject({
      capacity: 1_024,
      finitePointCount: 3,
      sampledPointCount: 3,
    });
    expectPositionsCloseTo(renderPayload.positions.subarray(0, 9), [
      [1, 0, 0],
      [Math.SQRT1_2, Math.SQRT1_2, 0],
      [0, 1, 0],
    ]);
    expect(renderPayload.bounds?.min[0]).toBeCloseTo(0);
    expect(renderPayload.bounds?.min[1]).toBeCloseTo(0);
    expect(renderPayload.bounds?.max[0]).toBeCloseTo(1);
    expect(renderPayload.bounds?.max[1]).toBeCloseTo(1);
    expect(attributes).toMatchObject({
      endAngle: Math.PI / 2,
      frameId: "SCAN_TEST",
      pointCount: 3,
      rangeCount: 3,
      startAngle: 0,
    });
    expect(resourceHints?.transferables).toContain(cloud.positions.buffer);
    expect(resourceHints?.transferables).toEqual(
      expect.arrayContaining([
        renderPayload.positions.buffer,
        renderPayload.sourceIndices.buffer,
      ]),
    );
    expect(timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
    expect(timing?.timeRange?.startNs).toBe(12_000_000_034n);
  });

  it("supports clockwise sweeps and a lone return at start_angle", () => {
    mockDecode.mockReturnValue(
      laserScanMessage({
        endAngle: -Math.PI / 2,
        ranges: [2, 2],
        startAngle: 0,
      }),
    );
    const sweep = expectPointCloud(
      foxgloveLaserScanDecoder.decode(EMPTY_BYTES, {}).visualization,
    );
    expectPositionsCloseTo(sweep.positions, [
      [2, 0, 0],
      [0, -2, 0],
    ]);

    mockDecode.mockReturnValue(
      laserScanMessage({
        endAngle: Math.PI,
        ranges: [3],
        startAngle: Math.PI / 2,
      }),
    );
    const lone = expectPointCloud(
      foxgloveLaserScanDecoder.decode(EMPTY_BYTES, {}).visualization,
    );
    expect(lone.pointCount).toBe(1);
    expectPositionsCloseTo(lone.positions, [[0, 3, 0]]);
  });

  it("carries per-range intensities as the canonical intensity channel", () => {
    mockDecode.mockReturnValue(
      laserScanMessage({
        endAngle: Math.PI,
        intensities: [5, 6, 7],
        ranges: [1, 1, 1],
        startAngle: 0,
      }),
    );

    const cloud = expectPointCloud(
      foxgloveLaserScanDecoder.decode(EMPTY_BYTES, {}).visualization,
    );
    expect(cloud.scalarFields).toHaveLength(1);
    expect(cloud.scalarFields?.[0].name).toBe("intensity");
    expect(Array.from(cloud.scalarFields?.[0].values ?? [])).toEqual([5, 6, 7]);
  });

  it("drops non-finite ranges and keeps intensities aligned", () => {
    mockDecode.mockReturnValue(
      laserScanMessage({
        endAngle: Math.PI,
        intensities: [5, 6, 7, 8, 9],
        ranges: [1, Number.POSITIVE_INFINITY, 1, Number.NaN, 1],
        startAngle: 0,
      }),
    );

    const { attributes, visualization } = foxgloveLaserScanDecoder.decode(
      EMPTY_BYTES,
      {},
    );
    const cloud = expectPointCloud(visualization);

    expect(cloud.pointCount).toBe(3);
    expect(attributes).toMatchObject({ pointCount: 3, rangeCount: 5 });
    // Kept samples retain their index-derived bearings: 0, 90°, 180°.
    expectPositionsCloseTo(cloud.positions, [
      [1, 0, 0],
      [0, 1, 0],
      [-1, 0, 0],
    ]);
    expect(Array.from(cloud.scalarFields?.[0].values ?? [])).toEqual([5, 7, 9]);
  });

  it("drops intensities whose length does not match the ranges", () => {
    mockDecode.mockReturnValue(
      laserScanMessage({
        endAngle: Math.PI,
        intensities: [5],
        ranges: [1, 1],
        startAngle: 0,
      }),
    );

    const cloud = expectPointCloud(
      foxgloveLaserScanDecoder.decode(EMPTY_BYTES, {}).visualization,
    );
    expect(cloud.scalarFields).toBeUndefined();
  });

  it("applies the scan pose to every point", () => {
    // Yaw 90° (z=sin 45°, w=cos 45°) plus a translation: the +X return lands
    // on +Y before translating.
    mockDecode.mockReturnValue(
      laserScanMessage({
        endAngle: 0,
        pose: {
          orientation: { w: Math.SQRT1_2, x: 0, y: 0, z: Math.SQRT1_2 },
          position: { x: 10, y: 20, z: 30 },
        },
        ranges: [1],
        startAngle: 0,
      }),
    );

    const cloud = expectPointCloud(
      foxgloveLaserScanDecoder.decode(EMPTY_BYTES, {}).visualization,
    );
    expectPositionsCloseTo(cloud.positions, [[10, 21, 30]]);
  });

  it("treats absent, zero, and non-unit orientations sensibly", () => {
    // Non-unit quaternion normalizes before rotating; a zero quaternion (the
    // proto3 default for an absent orientation) means identity.
    mockDecode.mockReturnValue(
      laserScanMessage({
        endAngle: 0,
        pose: {
          orientation: { w: 2 * Math.SQRT1_2, x: 0, y: 0, z: 2 * Math.SQRT1_2 },
          position: { x: 0, y: 0, z: 0 },
        },
        ranges: [1],
        startAngle: 0,
      }),
    );
    const rotated = expectPointCloud(
      foxgloveLaserScanDecoder.decode(EMPTY_BYTES, {}).visualization,
    );
    expectPositionsCloseTo(rotated.positions, [[0, 1, 0]]);

    mockDecode.mockReturnValue(
      laserScanMessage({
        endAngle: 0,
        pose: {
          orientation: { w: 0, x: 0, y: 0, z: 0 },
          position: { x: 5, y: 0, z: 0 },
        },
        ranges: [1],
        startAngle: 0,
      }),
    );
    const translated = expectPointCloud(
      foxgloveLaserScanDecoder.decode(EMPTY_BYTES, {}).visualization,
    );
    expectPositionsCloseTo(translated.positions, [[6, 0, 0]]);
  });

  it("decodes empty scans into empty point clouds", () => {
    mockDecode.mockReturnValue(
      laserScanMessage({ endAngle: 0, ranges: [], startAngle: 0 }),
    );

    const { attributes, visualization } = foxgloveLaserScanDecoder.decode(
      EMPTY_BYTES,
      {},
    );
    const cloud = expectPointCloud(visualization);

    expect(cloud.pointCount).toBe(0);
    expect(cloud.positions).toHaveLength(0);
    expect(attributes).toMatchObject({ pointCount: 0, rangeCount: 0 });
  });
});

function laserScanMessage({
  endAngle,
  intensities,
  pose,
  ranges,
  startAngle,
}: {
  readonly endAngle: number;
  readonly intensities?: readonly number[];
  readonly pose?: Record<string, unknown>;
  readonly ranges: readonly number[];
  readonly startAngle: number;
}): Record<string, unknown> {
  return {
    endAngle,
    frameId: "SCAN_TEST",
    intensities: intensities ?? [],
    ...(pose ? { pose } : {}),
    ranges,
    startAngle,
    timestamp: { nanos: 34n, seconds: 12n },
  };
}

function expectPointCloud(visualization: unknown): PointCloudVisualization {
  const kind = (visualization as { kind?: unknown } | undefined)?.kind;
  expect(kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
  return visualization as PointCloudVisualization;
}

function expectPositionsCloseTo(
  positions: Float32Array,
  expected: readonly (readonly [number, number, number])[],
) {
  expect(positions).toHaveLength(expected.length * 3);
  expected.forEach(([x, y, z], index) => {
    expect(positions[index * 3]).toBeCloseTo(x);
    expect(positions[index * 3 + 1]).toBeCloseTo(y);
    expect(positions[index * 3 + 2]).toBeCloseTo(z);
  });
}
