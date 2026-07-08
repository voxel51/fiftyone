import { describe, expect, it, vi } from "vitest";
import type {
  DecodedOutput,
  Decoder,
  PayloadDescriptor,
} from "../../../../decoders";
import type { StreamInventory } from "../../../../schemas/v1";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { createMcapDecoderRegistry } from "..";
import {
  isCameraCalibrationStream,
  isCompressedImageStream,
  isGridStream,
  isImageStream,
  isLocationFixStream,
  isPointCloudStream,
  isPoseStream,
  isSceneUpdateStream,
  streamTopics,
} from "../../stream-topics";
import {
  JSON_ROS_CAMERA_INFO_PAYLOADS,
  JSON_ROS_COMPRESSED_IMAGE_PAYLOADS,
  JSON_ROS_IMAGE_PAYLOADS,
  JSON_ROS_LASER_SCAN_PAYLOADS,
  JSON_ROS_NAV_SAT_FIX_PAYLOADS,
  JSON_ROS_OCCUPANCY_GRID_PAYLOADS,
  JSON_ROS_ODOMETRY_PAYLOADS,
  JSON_ROS_PATH_PAYLOADS,
  JSON_ROS_POINT_CLOUD2_PAYLOADS,
  JSON_ROS_POSE_ARRAY_PAYLOADS,
  JSON_ROS_POSE_STAMPED_PAYLOADS,
} from "./payloads";
import {
  jsonRosCameraInfoDecoders,
  jsonRosCompressedImageDecoders,
  jsonRosImageDecoders,
  jsonRosLaserScanDecoders,
  jsonRosNavSatFixDecoders,
  jsonRosOccupancyGridDecoders,
  jsonRosOdometryDecoders,
  jsonRosPathDecoders,
  jsonRosPointCloud2Decoders,
  jsonRosPoseArrayDecoders,
  jsonRosPoseStampedDecoders,
} from "./ros";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const H264_KEYFRAME_BYTES = Uint8Array.of(
  0,
  0,
  0,
  1,
  0x67,
  0x4d,
  0x00,
  0x1f,
  0,
  0,
  1,
  0x68,
  0xce,
  0,
  0,
  1,
  0x65,
  0xb0,
);

describe("JSON-schema ROS MCAP decoders", () => {
  it("registers every JSON-schema ROS payload with the MCAP decoder registry", () => {
    const registry = createMcapDecoderRegistry();
    const payloads = [
      ...JSON_ROS_CAMERA_INFO_PAYLOADS,
      ...JSON_ROS_COMPRESSED_IMAGE_PAYLOADS,
      ...JSON_ROS_IMAGE_PAYLOADS,
      ...JSON_ROS_LASER_SCAN_PAYLOADS,
      ...JSON_ROS_NAV_SAT_FIX_PAYLOADS,
      ...JSON_ROS_OCCUPANCY_GRID_PAYLOADS,
      ...JSON_ROS_ODOMETRY_PAYLOADS,
      ...JSON_ROS_PATH_PAYLOADS,
      ...JSON_ROS_POINT_CLOUD2_PAYLOADS,
      ...JSON_ROS_POSE_ARRAY_PAYLOADS,
      ...JSON_ROS_POSE_STAMPED_PAYLOADS,
    ];

    for (const payload of payloads) {
      expect(registry.find(payload), JSON.stringify(payload)).toBeDefined();
    }
  });

  it("decodes JSON CompressedImage JPEG records into encoded images", () => {
    const output = decoderForSchema(
      jsonRosCompressedImageDecoders,
      "sensor_msgs/CompressedImage",
    ).decode(
      jsonMessage({
        data: Array.from(TEXT_ENCODER.encode("fake-jpeg")),
        format: "jpeg",
        header: headerRecord("camera", 3, 4),
      }),
      {},
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_IMAGE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_IMAGE) {
      throw new Error("Expected encoded image visualization");
    }
    expect(TEXT_DECODER.decode(output.visualization.bytes)).toBe("fake-jpeg");
    expect(output.visualization.mimeType).toBe("image/jpeg");
    expect(output.attributes).toMatchObject({
      byteLength: 9,
      format: "jpeg",
      frameId: "camera",
    });
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(3_000_000_004n);
  });

  it("decodes JSON CompressedImage H.264 records into encoded videos", () => {
    const output = decoderForSchema(
      jsonRosCompressedImageDecoders,
      "sensor_msgs/msg/CompressedImage",
    ).decode(
      jsonMessage({
        data: Array.from(H264_KEYFRAME_BYTES),
        format: "h264",
        header: headerRecord("camera", 3, 4),
      }),
      {},
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_VIDEO);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_VIDEO) {
      throw new Error("Expected encoded video visualization");
    }
    expect(output.visualization).toMatchObject({
      codec: "h264",
      coordinateFrameId: "camera",
      format: "h264",
      keyframe: true,
      timestampNs: 3_000_000_004n,
    });
    expect(output.attributes).toMatchObject({
      byteLength: H264_KEYFRAME_BYTES.byteLength,
      codec: "h264",
      codecString: "avc1.4d001f",
      format: "h264",
      frameId: "camera",
      keyframe: true,
    });
  });

  it("decodes JSON Image RGB records into raw RGBA", () => {
    const output = decoderForSchema(
      jsonRosImageDecoders,
      "sensor_msgs/Image",
    ).decode(
      jsonMessage({
        data: [1, 2, 3, 4, 5, 6],
        encoding: "rgb8",
        header: headerRecord("camera", 1, 2),
        height: 1,
        is_bigendian: false,
        step: 6,
        width: 2,
      }),
      {},
    );

    expect(rawRgba(output)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
    expect(output.visualization).toMatchObject({
      coordinateFrameId: "camera",
      height: 1,
      sourceEncoding: "rgb8",
      timestampNs: 1_000_000_002n,
      width: 2,
    });
  });

  it("decodes JSON NavSatFix records into location visualizations", () => {
    const output = decoderForSchema(
      jsonRosNavSatFixDecoders,
      "sensor_msgs/NavSatFix",
    ).decode(
      jsonMessage({
        altitude: 12.5,
        latitude: 37.77,
        longitude: -122.42,
      }),
      {},
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.LOCATION);
    if (output.visualization?.kind !== VISUALIZATION_KIND.LOCATION) {
      throw new Error("Expected location visualization");
    }
    expect(output.visualization).toMatchObject({
      altitude: 12.5,
      latitude: 37.77,
      longitude: -122.42,
    });
    expect(output.attributes).toMatchObject({
      latitude: 37.77,
      longitude: -122.42,
    });
  });

  it("decodes JSON CameraInfo records into calibration visualizations", () => {
    const K = [100, 0, 50, 0, 101, 51, 0, 0, 1];
    const output = decoderForSchema(
      jsonRosCameraInfoDecoders,
      "sensor_msgs/msg/CameraInfo",
    ).decode(
      jsonMessage({
        D: [0.1, -0.2, 0, 0, 0],
        K,
        P: [100, 0, 50, 0, 0, 101, 51, 0, 0, 0, 1, 0],
        R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        distortion_model: "plumb_bob",
        header: headerRecord("camera_optical", 5, 6),
        height: 480,
        width: 640,
      }),
      {},
    );

    expect(output.visualization?.kind).toBe(
      VISUALIZATION_KIND.CAMERA_CALIBRATION,
    );
    if (output.visualization?.kind !== VISUALIZATION_KIND.CAMERA_CALIBRATION) {
      throw new Error("Expected camera calibration visualization");
    }
    expect(output.visualization).toMatchObject({
      coordinateFrameId: "camera_optical",
      D: [0.1, -0.2, 0, 0, 0],
      distortionModel: "plumb_bob",
      height: 480,
      K,
      timestampNs: 5_000_000_006n,
      width: 640,
    });
  });

  it("decodes JSON PointCloud2 and LaserScan records into point clouds", () => {
    const cloud = decoderForSchema(
      jsonRosPointCloud2Decoders,
      "sensor_msgs/msg/PointCloud2",
    ).decode(
      jsonMessage({
        data: pointCloud2Data([
          [1, 2, 3],
          [4, 5, 6],
        ]),
        fields: [pointField("x", 0), pointField("y", 4), pointField("z", 8)],
        header: headerRecord("lidar", 7, 8),
        height: 1,
        is_bigendian: false,
        is_dense: true,
        point_step: 12,
        row_step: 24,
        width: 2,
      }),
      {},
    );
    const scan = decoderForSchema(
      jsonRosLaserScanDecoders,
      "sensor_msgs/LaserScan",
    ).decode(
      jsonMessage({
        angle_increment: Math.PI / 2,
        angle_max: Math.PI,
        angle_min: 0,
        header: headerRecord("scan", 9, 10),
        intensities: [5, 6, 7, 8],
        range_max: 100,
        range_min: 0,
        ranges: [1, 101, 1, -0.5],
      }),
      {},
    );

    expect(cloud.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    expect(scan.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (
      cloud.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD ||
      scan.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD
    ) {
      throw new Error("Expected point cloud visualizations");
    }
    expect(Array.from(cloud.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(cloud.visualization.coordinateFrameId).toBe("lidar");
    expect(scan.visualization.coordinateFrameId).toBe("scan");
    expect(scan.visualization.pointCount).toBe(2);
    expect(
      Array.from(scan.visualization.scalarFields?.[0]?.values ?? []),
    ).toEqual([5, 7]);
  });

  it("decodes JSON OccupancyGrid records into grid visualizations", () => {
    const output = decoderForSchema(
      jsonRosOccupancyGridDecoders,
      "nav_msgs/OccupancyGrid",
    ).decode(
      jsonMessage({
        data: [-1, 0, 50, 100],
        header: headerRecord("map", 15, 16),
        info: {
          height: 2,
          map_load_time: { nsec: 18, sec: 17 },
          origin: poseRecord([1, 2, 0], [0, 0, 0, 1]),
          resolution: 0.5,
          width: 2,
        },
      }),
      {},
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.GRID);
    if (output.visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(output.visualization).toMatchObject({
      cellSize: [0.5, 0.5],
      columnCount: 2,
      coordinateFrameId: "map",
      rowCount: 2,
      timestampNs: 15_000_000_016n,
    });
    expect(Array.from(output.visualization.rgba)).toEqual([
      0, 0, 0, 0, 255, 255, 255, 255, 127, 127, 127, 255, 0, 0, 0, 255,
    ]);
  });

  it("decodes JSON PoseStamped and Odometry records into pose visualizations", () => {
    const poseStamped = decoderForSchema(
      jsonRosPoseStampedDecoders,
      "geometry_msgs/PoseStamped",
    ).decode(
      jsonMessage({
        header: headerRecord("map", 9, 10),
        pose: poseRecord([1, 2, 3], [0, 0, 0, 1]),
      }),
      {},
    );
    const odometry = decoderForSchema(
      jsonRosOdometryDecoders,
      "nav_msgs/msg/Odometry",
    ).decode(
      jsonMessage({
        child_frame_id: "base_link",
        header: headerRecord("odom", 11, 12),
        pose: {
          pose: poseRecord([4, 5, 6], [0, 0, 0, 1]),
        },
        twist: {
          twist: {
            angular: vectorRecord([0.1, 0.2, 0.3]),
            linear: vectorRecord([7, 8, 9]),
          },
        },
      }),
      {},
    );

    expect(poseStamped.visualization?.kind).toBe(VISUALIZATION_KIND.POSE);
    expect(odometry.visualization?.kind).toBe(VISUALIZATION_KIND.POSE);
    if (
      poseStamped.visualization?.kind !== VISUALIZATION_KIND.POSE ||
      odometry.visualization?.kind !== VISUALIZATION_KIND.POSE
    ) {
      throw new Error("Expected pose visualizations");
    }
    expect(poseStamped.visualization).toMatchObject({
      coordinateFrameId: "map",
      position: [1, 2, 3],
      timestampNs: 9_000_000_010n,
    });
    expect(odometry.visualization).toMatchObject({
      angularVelocity: [0.1, 0.2, 0.3],
      coordinateFrameId: "odom",
      position: [4, 5, 6],
      timestampNs: 11_000_000_012n,
      velocity: [7, 8, 9],
    });
    expect(odometry.attributes).toMatchObject({ childFrameId: "base_link" });
  });

  it("decodes JSON Path and PoseArray records into scene-update overlays", () => {
    const path = decoderForSchema(
      jsonRosPathDecoders,
      "nav_msgs/msg/Path",
    ).decode(
      jsonMessage({
        header: headerRecord("map", 13, 14),
        poses: [
          {
            header: headerRecord("map", 1, 1),
            pose: poseRecord([1, 2, 0], [0, 0, 0, 1]),
          },
          {
            header: headerRecord("map", 1, 2),
            pose: poseRecord([3, 4, 0], [0, 0, 0, 1]),
          },
        ],
      }),
      { streamId: "/planned_path" },
    );
    const poseArray = decoderForSchema(
      jsonRosPoseArrayDecoders,
      "geometry_msgs/PoseArray",
    ).decode(
      jsonMessage({
        header: headerRecord("map", 15, 16),
        poses: [
          poseRecord([5, 6, 0], [0, 0, 0, 1]),
          poseRecord([7, 8, 0], [0, 0, 1, 0]),
        ],
      }),
      { streamId: "/pose_hypotheses" },
    );

    expect(path.visualization?.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    expect(poseArray.visualization?.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    if (
      path.visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE ||
      poseArray.visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE
    ) {
      throw new Error("Expected scene update visualizations");
    }
    expect(path.visualization.entities[0]?.lines[0]?.points).toEqual([
      [1, 2, 0],
      [3, 4, 0],
    ]);
    expect(path.visualization.entities[0]).toMatchObject({
      frameId: "map",
      id: "/planned_path:path",
      timestampNs: 13_000_000_014n,
    });
    expect(poseArray.visualization.entities[0]).toMatchObject({
      arrowCount: 2,
      frameId: "map",
      id: "/pose_hypotheses:pose-array",
      timestampNs: 15_000_000_016n,
    });
    expect(
      poseArray.visualization.entities[0]?.arrows[0]?.pose.position,
    ).toEqual([5, 6, 0]);
  });

  it("degrades invalid JSON and malformed JSON records without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const decoder = decoderForSchema(
      jsonRosCompressedImageDecoders,
      "sensor_msgs/CompressedImage",
    );
    const badJson = decoder.decode(TEXT_ENCODER.encode("{nope"), {});
    const missingFields = decoderForSchema(
      jsonRosNavSatFixDecoders,
      "sensor_msgs/NavSatFix",
    ).decode(jsonMessage({}), {});
    const malformedBytes = decoder.decode(
      jsonMessage({ data: "not-a-byte-array", format: "jpeg" }),
      {},
    );

    for (const output of [badJson, missingFields, malformedBytes]) {
      expect(output.visualization).toBeUndefined();
      expect(output.attributes?.decodeError).toBeTruthy();
    }
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("classifies JSON-schema ROS streams with the same buckets as ROS-wire streams", () => {
    const compressed = createTopic(
      "/camera/compressed",
      JSON_ROS_COMPRESSED_IMAGE_PAYLOADS[0],
    );
    const rawImage = createTopic("/camera/image", JSON_ROS_IMAGE_PAYLOADS[1]);
    const cloud = createTopic("/points", JSON_ROS_POINT_CLOUD2_PAYLOADS[0]);
    const scan = createTopic("/scan", JSON_ROS_LASER_SCAN_PAYLOADS[1]);
    const path = createTopic("/planned_path", JSON_ROS_PATH_PAYLOADS[1]);
    const poseArray = createTopic(
      "/pose_hypotheses",
      JSON_ROS_POSE_ARRAY_PAYLOADS[0],
    );

    expect(isCompressedImageStream(compressed)).toBe(true);
    expect(isCompressedImageStream(rawImage)).toBe(false);
    expect(isImageStream(compressed)).toBe(true);
    expect(isImageStream(rawImage)).toBe(true);
    expect(isPointCloudStream(cloud)).toBe(true);
    expect(isPointCloudStream(scan)).toBe(true);
    expect(
      isCameraCalibrationStream(
        createTopic("/camera/info", JSON_ROS_CAMERA_INFO_PAYLOADS[0]),
      ),
    ).toBe(true);
    expect(
      isPoseStream(createTopic("/pose", JSON_ROS_POSE_STAMPED_PAYLOADS[1])),
    ).toBe(true);
    expect(
      isPoseStream(createTopic("/odom", JSON_ROS_ODOMETRY_PAYLOADS[0])),
    ).toBe(true);
    expect(
      isLocationFixStream(
        createTopic("/gps", JSON_ROS_NAV_SAT_FIX_PAYLOADS[0]),
      ),
    ).toBe(true);
    expect(
      isGridStream(createTopic("/map", JSON_ROS_OCCUPANCY_GRID_PAYLOADS[1])),
    ).toBe(true);
    expect(isSceneUpdateStream(path)).toBe(true);
    expect(isSceneUpdateStream(poseArray)).toBe(true);
    expect(
      streamTopics([compressed, rawImage, cloud, scan, path, poseArray]),
    ).toMatchObject({
      image: ["/camera/compressed", "/camera/image"],
      pointCloud: ["/points", "/scan"],
      previewable: ["/camera/compressed", "/camera/image", "/points", "/scan"],
      sceneUpdates: ["/planned_path", "/pose_hypotheses"],
    });
  });
});

function decoderForSchema(
  decoders: readonly Decoder[],
  schema: string,
): Decoder {
  const decoder = decoders.find(
    (candidate) => candidate.payload.schema === schema,
  );
  if (!decoder) {
    throw new Error(`Missing decoder for ${schema}`);
  }

  return decoder;
}

function jsonMessage(record: Record<string, unknown>): Uint8Array {
  return TEXT_ENCODER.encode(JSON.stringify(record));
}

function rawRgba(output: DecodedOutput): readonly number[] {
  expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.RAW_IMAGE);
  if (output.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
    throw new Error("Expected raw image visualization");
  }

  return Array.from(output.visualization.rgba);
}

function headerRecord(frameId: string, sec: number, nanosec: number) {
  return {
    frame_id: frameId,
    stamp: { nanosec, sec },
  };
}

function pointField(name: string, offset: number, datatype = 7) {
  return {
    count: 1,
    datatype,
    name,
    offset,
  };
}

function pointCloud2Data(
  points: readonly (readonly [number, number, number])[],
): readonly number[] {
  const data = new Uint8Array(points.length * 12);
  const view = new DataView(data.buffer);
  points.forEach(([x, y, z], index) => {
    const offset = index * 12;
    view.setFloat32(offset, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, z, true);
  });

  return Array.from(data);
}

function poseRecord(
  position: readonly [number, number, number],
  quaternion: readonly [number, number, number, number],
) {
  return {
    orientation: {
      w: quaternion[3],
      x: quaternion[0],
      y: quaternion[1],
      z: quaternion[2],
    },
    position: vectorRecord(position),
  };
}

function vectorRecord(vector: readonly [number, number, number]) {
  return {
    x: vector[0],
    y: vector[1],
    z: vector[2],
  };
}

function createTopic(
  topic: string,
  payload: PayloadDescriptor,
): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    displayName: topic,
    metadata: {
      "mcap.schema_name": payload.schema ?? "",
      "mcap.topic": topic,
    },
    payload: {
      $typeName: "fiftyone.multimodal.schemas.v1.PayloadDescriptor",
      encoding: payload.encoding,
      schema: payload.schema,
      schemaEncoding: payload.schemaEncoding,
    },
    streamId: topic,
  };
}
