import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import {
  foxgloveLaserScanDecoder,
  foxglovePointCloudDecoder,
} from "./foxglove/index";
import {
  LASER_SCAN_FIXTURE,
  POINT_CLOUD_FIXTURE,
} from "./foxglove.test-fixtures";
import {
  concatProtobufFields,
  expectArrayCloseTo,
  float32Bytes,
  float64Bytes,
  pointCloudMessage,
  protobufBytesField,
  protobufDoubleField,
  protobufVarintField,
  radarPointBytes,
} from "./foxglove.test-helpers";

describe("Foxglove point and range decoders", () => {
  it("decodes point cloud payloads into point cloud visualizations", () => {
    const output = foxglovePointCloudDecoder.decode(
      POINT_CLOUD_FIXTURE.message,
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
        sourceTimestamps: {
          captureTime: 10n,
          receiveTime: 11n,
        },
        streamId: "/lidar",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(output.visualization.coordinateFrameId).toBe("LIDAR_TEST");
    expect(output.visualization.pointCount).toBe(2);
    expect(output.attributes).toMatchObject({
      frameId: "LIDAR_TEST",
      pointCount: 2,
      pointStride: 12,
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(123456000001n);
  });

  it("decodes laser scan payloads into point cloud visualizations", () => {
    // foxglove.LaserScan field numbers: timestamp=1, frame_id=2, pose=3,
    // start_angle=4, end_angle=5, ranges=6, intensities=7. Two returns
    // sweeping 0..90° from a scanner at (1, 1, 0) with identity orientation.
    const output = foxgloveLaserScanDecoder.decode(
      concatProtobufFields(
        protobufBytesField(
          1,
          concatProtobufFields(
            protobufVarintField(1, 12),
            protobufVarintField(2, 34),
          ),
        ),
        protobufBytesField(2, new TextEncoder().encode("SCAN_TEST")),
        protobufBytesField(
          3,
          protobufBytesField(
            1,
            concatProtobufFields(
              protobufDoubleField(1, 1),
              protobufDoubleField(2, 1),
            ),
          ),
        ),
        protobufDoubleField(4, 0),
        protobufDoubleField(5, Math.PI / 2),
        protobufBytesField(6, float64Bytes([1, 2])),
        protobufBytesField(7, float64Bytes([10, 20])),
      ),
      {
        schemaData: LASER_SCAN_FIXTURE.schemaData,
        sourceTimestamps: {
          captureTime: 10n,
          receiveTime: 11n,
        },
        streamId: "/scan",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(output.visualization.coordinateFrameId).toBe("SCAN_TEST");
    expect(output.visualization.pointCount).toBe(2);
    expectArrayCloseTo(
      Array.from(output.visualization.positions),
      [2, 1, 0, 1, 3, 0],
    );
    expect(output.visualization.scalarFields?.[0]?.name).toBe("intensity");
    expect(
      Array.from(output.visualization.scalarFields?.[0]?.values ?? []),
    ).toEqual([10, 20]);
    expect(output.attributes).toMatchObject({
      endAngle: Math.PI / 2,
      frameId: "SCAN_TEST",
      pointCount: 2,
      rangeCount: 2,
      startAngle: 0,
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
  });

  it("decodes only the active point cloud channel and projects replacements", () => {
    const bytes = pointCloudMessage(radarPointBytes(), {
      fields: [
        { name: "x", offset: 0, type: 7 },
        { name: "y", offset: 4, type: 7 },
        { name: "z", offset: 8, type: 7 },
        { name: "rcs", offset: 12, type: 7 },
        { name: "r", offset: 16, type: 1 },
        { name: "g", offset: 17, type: 1 },
        { name: "b", offset: 18, type: 1 },
      ],
      pointStride: 19,
    });
    const context = { schemaData: POINT_CLOUD_FIXTURE.schemaData };
    const output = foxglovePointCloudDecoder.decode(bytes, context);

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }

    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(output.visualization.colors).toBeUndefined();
    expect(output.visualization.scalarFields).toBeUndefined();
    const renderPayload = output.visualization.renderPayload;
    if (!renderPayload) {
      throw new Error("Expected point cloud render payload");
    }
    if (!renderPayload.rgb) {
      throw new Error("Expected sampled point cloud colors");
    }
    expect(renderPayload).toMatchObject({
      bounds: { max: [4, 5, 6], min: [1, 2, 3] },
      capacity: 1_024,
      finitePointCount: 2,
      hasRgb: true,
      heightRange: { max: 6, min: 3 },
      sampledPointCount: 2,
      sourcePointCount: 2,
    });
    expect(renderPayload.availableScalarFields).toEqual(["rcs"]);
    expect(Array.from(renderPayload.positions.slice(0, 6))).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(Array.from(renderPayload.sourceIndices.slice(0, 2))).toEqual([0, 1]);
    expect(renderPayload.rgb.encoding).toEqual({
      componentCount: 3,
      invalidValue: null,
      origin: 0,
      scale: 1 / 255,
      storage: "uint8",
    });
    expect(renderPayload.rgb.values).toBeInstanceOf(Uint8Array);
    expect(Array.from(renderPayload.rgb.values.slice(0, 6))).toEqual([
      255, 0, 0, 0, 128, 255,
    ]);
    expect(renderPayload.scalarFields).toEqual([]);
    expect(output.visualization.positions.buffer).toBe(
      renderPayload.positions.buffer,
    );
    expect(output.resourceHints?.transferables).toEqual(
      expect.arrayContaining([
        renderPayload.positions.buffer,
        renderPayload.rgb.values.buffer,
        renderPayload.sourceIndices.buffer,
      ]),
    );
    expect(output.resourceHints?.sizeBytes).toBe(
      renderPayload.positions.byteLength +
        renderPayload.rgb.values.byteLength +
        renderPayload.sourceIndices.byteLength,
    );

    const projected = foxglovePointCloudDecoder.projectPointCloudChannel?.(
      bytes,
      context,
      {
        activeColorBy: "rcs",
        capacity: renderPayload.capacity,
        sampledPointCount: renderPayload.sampledPointCount,
        samplePlanKey: renderPayload.samplePlanKey ?? "",
        sourceIndices: renderPayload.sourceIndices,
      },
    );
    if (projected?.kind !== "scalar") {
      throw new Error("Expected projected RCS channel");
    }
    expect(projected.samplePlanKey).toBe(renderPayload.samplePlanKey);
    expect(projected.scalarField).toMatchObject({
      encoding: { storage: "float32" },
      finiteValueCount: 2,
      name: "rcs",
      range: { max: 20, min: 10 },
    });
    expect(Array.from(projected.scalarField.values.slice(0, 2))).toEqual([
      10, 20,
    ]);

    const projectedRgb = foxglovePointCloudDecoder.projectPointCloudChannel?.(
      bytes,
      context,
      {
        activeColorBy: "rgb",
        capacity: renderPayload.capacity,
        sampledPointCount: renderPayload.sampledPointCount,
        samplePlanKey: renderPayload.samplePlanKey ?? "",
        sourceIndices: renderPayload.sourceIndices,
      },
    );
    if (projectedRgb?.kind !== "rgb") {
      throw new Error("Expected projected RGB channel");
    }
    expect(projectedRgb.rgb.encoding).toEqual(renderPayload.rgb.encoding);
    expect(projectedRgb.rgb.values).toBeInstanceOf(Uint8Array);
    expect(Array.from(projectedRgb.rgb.values.slice(0, 6))).toEqual([
      255, 0, 0, 0, 128, 255,
    ]);
  });

  it("decodes strided lidar layouts with trailing scalar fields", () => {
    // x,y,z,intensity float32 records at stride 16 — the common automotive
    // lidar layout (nuScenes /LIDAR_TOP is the stride-20 variant).
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(float32Bytes([1, 2, 3, 0.5, 4, 5, 6, 7.5]), {
        fields: [
          { name: "x", offset: 0, type: 7 },
          { name: "y", offset: 4, type: 7 },
          { name: "z", offset: 8, type: 7 },
          { name: "intensity", offset: 12, type: 7 },
        ],
        pointStride: 16,
      }),
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(output.visualization.scalarFields).toBeUndefined();
    expect(output.visualization.renderPayload?.scalarFields[0]).toMatchObject({
      encoding: { storage: "float32" },
      name: "intensity",
    });
    expect(
      Array.from(
        output.visualization.renderPayload?.scalarFields[0].values.slice(
          0,
          2,
        ) ?? [],
      ),
    ).toEqual([0.5, 7.5]);
    expect(output.visualization.pointCount).toBe(2);
  });

  it("discovers non-canonical channels but expands only the requested one", () => {
    // Two points: x,y,z, intensity, ring, vx_comp, rgb (all float32).
    // Everything numeric that is neither a position component nor consumed
    // as color must come out as a scalar channel — canonical channels
    // first, the rest in declaration order.
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(
        float32Bytes([1, 2, 3, 0.5, 7, -1.5, 0, 4, 5, 6, 7.5, 8, 2.25, 0]),
        {
          fields: [
            { name: "x", offset: 0, type: 7 },
            { name: "y", offset: 4, type: 7 },
            { name: "z", offset: 8, type: 7 },
            { name: "ring", offset: 16, type: 7 },
            { name: "intensity", offset: 12, type: 7 },
            { name: "vx_comp", offset: 20, type: 7 },
            { name: "rgb", offset: 24, type: 7 },
          ],
          pointStride: 28,
        },
      ),
      {
        pointCloudColorBy: "vx_comp",
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(output.visualization.scalarFields).toBeUndefined();
    expect(
      Array.from(
        output.visualization.renderPayload?.scalarFields[0].values.slice(
          0,
          2,
        ) ?? [],
      ),
    ).toEqual([-1.5, 2.25]);
    expect(output.visualization.renderPayload?.availableScalarFields).toEqual([
      "intensity",
      "ring",
      "vx_comp",
    ]);
    expect(output.visualization.colors).toBeUndefined();
  });

  it("caps discoverable scalar channels on exotic layouts", () => {
    const extraFieldCount = 20;
    const fields = [
      { name: "x", offset: 0, type: 7 },
      { name: "y", offset: 4, type: 7 },
      { name: "z", offset: 8, type: 7 },
      ...Array.from({ length: extraFieldCount }, (_, index) => ({
        name: `channel_${index}`,
        offset: 12 + index * 4,
        type: 7,
      })),
    ];
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(
        float32Bytes(Array.from({ length: 3 + extraFieldCount }, () => 1)),
        { fields, pointStride: (3 + extraFieldCount) * 4 },
      ),
      {
        pointCloudColorBy: "channel_15",
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(output.visualization.scalarFields).toBeUndefined();
    expect(output.visualization.renderPayload?.scalarFields[0]?.name).toBe(
      "channel_15",
    );
    expect(output.visualization.renderPayload?.availableScalarFields).toEqual(
      Array.from({ length: 16 }, (_, index) => `channel_${index}`),
    );
  });

  it("applies point cloud pose to decoded positions", () => {
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(float32Bytes([1, 0, 0, 0, 2, 3]), {
        pose: {
          orientation: { w: Math.SQRT1_2, z: Math.SQRT1_2 },
          position: { x: 10, y: 20, z: 30 },
        },
      }),
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expectArrayCloseTo(
      Array.from(output.visualization.positions),
      [10, 21, 30, 8, 20, 33],
    );
  });

  it("ignores only unaligned zero padding at the end of point cloud payloads", () => {
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(
        concatProtobufFields(
          float32Bytes([1, 2, 3, 4, 5, 6]),
          new Uint8Array(12),
          new Uint8Array(8),
        ),
      ),
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 0, 0, 0, 4, 5, 6,
    ]);
    expect(
      Array.from(
        output.visualization.renderPayload?.sourceIndices.slice(0, 3) ?? [],
      ),
    ).toEqual([0, 2, 1]);
    expect(output.visualization.pointCount).toBe(3);
  });

  it("rejects unaligned point cloud payloads with non-zero trailing data", () => {
    expect(() =>
      foxglovePointCloudDecoder.decode(
        pointCloudMessage(
          concatProtobufFields(
            float32Bytes([1, 2, 3, 4, 5, 6]),
            Uint8Array.of(1),
          ),
        ),
        {
          schemaData: POINT_CLOUD_FIXTURE.schemaData,
        },
      ),
    ).toThrow("Point cloud data length is not aligned to point stride");
  });
});
