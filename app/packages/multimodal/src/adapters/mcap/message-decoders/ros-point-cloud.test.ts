import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { rosLaserScanDecoders, rosPointCloud2Decoders } from "./ros/index";
import {
  ROS1_POINT_CLOUD2_SCHEMA,
  ROS2_LASER_SCAN_SCHEMA,
  decoderForSchemaEncoding,
  expectArrayCloseTo,
  pointCloud2Data,
  pointField,
  ros1Header,
  ros1Message,
  ros2Header,
  ros2Message,
  schemaData,
} from "./ros.test-helpers";

describe("ROS point and range decoders", () => {
  it("decodes ros1 PointCloud2 with row padding, scalar fields, and finite-point pruning", () => {
    const pointStep = 18;
    const rowStep = 40;
    const data = pointCloud2Data({
      pointStep,
      points: [
        [1, 2, 3, 10, 50_000],
        [4, 5, 6, 20, 60_000],
        [7, 8, Number.NaN, 30, 65_000],
        [9, 10, 11, 40, 65_535],
      ],
      rowStep,
      width: 2,
    });
    const decoder = decoderForSchemaEncoding(rosPointCloud2Decoders, "ros1msg");
    const bytes = ros1Message(ROS1_POINT_CLOUD2_SCHEMA, {
      data: Array.from(data),
      fields: [
        pointField("x", 0),
        pointField("y", 4),
        pointField("z", 8),
        pointField("intensity", 12),
        pointField("ring", 16, 4),
      ],
      header: ros1Header({ frameId: "lidar", nsec: 2, sec: 1, seq: 7 }),
      height: 2,
      is_bigendian: false,
      is_dense: false,
      point_step: pointStep,
      row_step: rowStep,
      width: 2,
    });
    const context = { schemaData: schemaData(ROS1_POINT_CLOUD2_SCHEMA) };
    const output = decoder.decode(bytes, context);

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(output.visualization.coordinateFrameId).toBe("lidar");
    expect(output.visualization.pointCount).toBe(3);
    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 9, 10, 11, 4, 5, 6,
    ]);
    expect(output.visualization.scalarFields).toBeUndefined();
    const renderPayload = output.visualization.renderPayload;
    if (!renderPayload) {
      throw new Error("Expected point cloud render payload");
    }
    expect(renderPayload).toMatchObject({
      bounds: { max: [9, 10, 11], min: [1, 2, 3] },
      capacity: 1_024,
      finitePointCount: 3,
      heightRange: { max: 11, min: 3 },
      sampledPointCount: 3,
      sourcePointCount: 4,
    });
    expect(renderPayload.availableScalarFields).toEqual(["intensity", "ring"]);
    expect(Array.from(renderPayload.sourceIndices.slice(0, 3))).toEqual([
      0, 3, 1,
    ]);
    expect(output.visualization.positions.buffer).toBe(
      renderPayload.positions.buffer,
    );
    expect(renderPayload.scalarFields).toHaveLength(1);
    expect(renderPayload.scalarFields[0]).toMatchObject({
      finiteValueCount: 3,
      name: "intensity",
      range: { max: 40, min: 10 },
    });
    expect(renderPayload.scalarFields[0].encoding.storage).toBe("float32");
    expect(
      Array.from(renderPayload.scalarFields[0].values.slice(0, 3)),
    ).toEqual([10, 40, 20]);
    expect(output.resourceHints?.transferables).toEqual(
      expect.arrayContaining([
        renderPayload.positions.buffer,
        renderPayload.sourceIndices.buffer,
        renderPayload.scalarFields[0].values.buffer,
      ]),
    );
    expect(output.resourceHints?.sizeBytes).toBe(
      renderPayload.positions.byteLength +
        renderPayload.sourceIndices.byteLength +
        renderPayload.scalarFields.reduce(
          (total, field) => total + field.values.byteLength,
          0,
        ),
    );
    const projected = decoder.projectPointCloudChannel?.(bytes, context, {
      activeColorBy: "ring",
      capacity: renderPayload.capacity,
      sampledPointCount: renderPayload.sampledPointCount,
      samplePlanKey: renderPayload.samplePlanKey ?? "",
      sourceIndices: renderPayload.sourceIndices,
    });
    if (projected?.kind !== "scalar") {
      throw new Error("Expected projected ring channel");
    }
    expect(projected.samplePlanKey).toBe(renderPayload.samplePlanKey);
    expect(projected.scalarField).toMatchObject({
      encoding: {
        componentCount: 1,
        invalidValue: null,
        origin: 0,
        scale: 1,
        storage: "uint16",
      },
      finiteValueCount: 3,
      name: "ring",
      range: { max: 65_535, min: 50_000 },
    });
    expect(Array.from(projected.scalarField.values.slice(0, 3))).toEqual([
      50_000, 65_535, 60_000,
    ]);
    expect(projected.scalarField.values).toBeInstanceOf(Uint16Array);

    const fallback = decoder.projectPointCloudChannel?.(bytes, context, {
      activeColorBy: "ring",
      capacity: 2,
      sampledPointCount: 2,
      samplePlanKey: "ambiguous-plan",
      sourceIndices: Uint32Array.of(0, 99),
    });
    if (fallback?.kind !== "scalar") {
      throw new Error("Expected fallback ring channel");
    }
    expect(fallback.scalarField.encoding).toMatchObject({
      storage: "float32",
    });
    expect(fallback.scalarField.values).toBeInstanceOf(Float32Array);
    expect(fallback.scalarField.values[0]).toBe(50_000);
    expect(fallback.scalarField.values[1]).toBeNaN();
    expect(output.attributes).toMatchObject({
      frameId: "lidar",
      height: 2,
      isDense: false,
      pointCount: 3,
      sequence: 7,
      width: 2,
    });
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(1_000_000_002n);
  });

  it("drops zero-range returns only for recognized organized Ouster layouts", () => {
    const pointStep = 34;
    const width = 2;
    const height = 2;
    const data = new Uint8Array(pointStep * width * height);
    const view = new DataView(data.buffer);
    const points = [
      { position: [1, 2, 3], range: 100 },
      { position: [0, 0, 0], range: 0 },
      { position: [0, 0, 0], range: 50 },
      { position: [4, 5, 6], range: 200 },
    ] as const;
    points.forEach(({ position: [x, y, z], range }, index) => {
      const offset = index * pointStep;
      view.setFloat32(offset, x, true);
      view.setFloat32(offset + 4, y, true);
      view.setFloat32(offset + 8, z, true);
      view.setUint32(offset + 16, index, true);
      view.setUint16(offset + 20, index, true);
      view.setUint32(offset + 24, range, true);
      view.setUint16(offset + 28, 10 + index, true);
      view.setUint16(offset + 30, 20 + index, true);
      view.setUint16(offset + 32, 30 + index, true);
    });

    const output = decoderForSchemaEncoding(
      rosPointCloud2Decoders,
      "ros1msg",
    ).decode(
      ros1Message(ROS1_POINT_CLOUD2_SCHEMA, {
        data: Array.from(data),
        fields: [
          pointField("x", 0),
          pointField("y", 4),
          pointField("z", 8),
          pointField("t", 16, 6),
          pointField("ring", 20, 4),
          pointField("range", 24, 6),
          pointField("signal", 28, 4),
          pointField("reflectivity", 30, 4),
          pointField("near_ir", 32, 4),
        ],
        header: ros1Header({ frameId: "os_sensor" }),
        height,
        is_bigendian: false,
        is_dense: true,
        point_step: pointStep,
        row_step: pointStep * width,
        width,
      }),
      {
        pointCloudColorBy: "range",
        schemaData: schemaData(ROS1_POINT_CLOUD2_SCHEMA),
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    const payload = output.visualization.renderPayload;
    if (!payload) {
      throw new Error("Expected point cloud render payload");
    }
    expect(output.visualization.pointCount).toBe(3);
    expect(output.attributes).toMatchObject({
      pointCount: 3,
      sourcePointCount: 4,
    });
    expect(payload).toMatchObject({
      finitePointCount: 3,
      sampledPointCount: 3,
      sourcePointCount: 4,
    });
    expect(Array.from(payload.sourceIndices.slice(0, 3))).toEqual([0, 3, 2]);
    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6, 0, 0, 0,
    ]);
    const range = payload.scalarFields.find((field) => field.name === "range");
    expect(range).toMatchObject({
      encoding: { storage: "uint32" },
      finiteValueCount: 3,
      range: { max: 200, min: 50 },
    });
    expect(Array.from(range?.values.slice(0, 3) ?? [])).toEqual([100, 200, 50]);
    expect(range?.values).toBeInstanceOf(Uint32Array);
  });

  it("degrades ros1 PointCloud2 big-endian data instead of throwing", () => {
    const output = decoderForSchemaEncoding(
      rosPointCloud2Decoders,
      "ros1msg",
    ).decode(
      ros1Message(ROS1_POINT_CLOUD2_SCHEMA, {
        data: [],
        fields: [pointField("x", 0), pointField("y", 4), pointField("z", 8)],
        header: ros1Header({ frameId: "lidar" }),
        height: 1,
        is_bigendian: true,
        is_dense: true,
        point_step: 12,
        row_step: 12,
        width: 1,
      }),
      { schemaData: schemaData(ROS1_POINT_CLOUD2_SCHEMA) },
    );

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      bigEndian: true,
      declaredPointCount: 1,
      frameId: "lidar",
      unsupportedReason: "ROS PointCloud2 big-endian data is unsupported",
    });
  });

  it("decodes ros2 LaserScan with angle_increment, range bounds, and aligned intensities", () => {
    const output = decoderForSchemaEncoding(
      rosLaserScanDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_LASER_SCAN_SCHEMA, {
        angle_increment: Math.PI / 2,
        angle_max: Math.PI,
        angle_min: 0,
        header: ros2Header({ frameId: "scan", nanosec: 8, sec: 7 }),
        intensities: [5, 6, 7, 8],
        range_max: 100,
        range_min: 0,
        ranges: [1, 101, 1, -0.5],
        scan_time: 0,
        time_increment: 0,
      }),
      { schemaData: schemaData(ROS2_LASER_SCAN_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(output.visualization.coordinateFrameId).toBe("scan");
    expect(output.visualization.pointCount).toBe(2);
    expectArrayCloseTo(
      Array.from(output.visualization.positions),
      [1, 0, 0, -1, 0, 0],
    );
    expect(
      Array.from(output.visualization.scalarFields?.[0]?.values ?? []),
    ).toEqual([5, 7]);
    const renderPayload = output.visualization.renderPayload;
    if (!renderPayload) {
      throw new Error("Expected point cloud render payload");
    }
    expect(renderPayload).toMatchObject({
      capacity: 1_024,
      finitePointCount: 2,
      sampledPointCount: 2,
    });
    expect(renderPayload.bounds?.min[0]).toBeCloseTo(-1);
    expect(renderPayload.bounds?.max[0]).toBeCloseTo(1);
    expect(renderPayload.bounds?.min[1]).toBeCloseTo(0);
    expect(renderPayload.bounds?.max[1]).toBeCloseTo(0);
    expect(
      Array.from(renderPayload.scalarFields[0].values.slice(0, 2)),
    ).toEqual([5, 7]);
    expect(output.resourceHints?.transferables).toEqual(
      expect.arrayContaining([
        renderPayload.positions.buffer,
        renderPayload.sourceIndices.buffer,
        renderPayload.scalarFields[0].values.buffer,
      ]),
    );
  });
});
