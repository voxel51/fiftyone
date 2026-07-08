import { parse as parseRosMessageDefinition } from "@foxglove/rosmsg";
import { parseRos2idl } from "@foxglove/ros2idl-parser";
import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import { describe, expect, it } from "vitest";
import type {
  DecodedOutput,
  Decoder,
  PayloadDescriptor,
} from "../../../decoders";
import type { StreamInventory } from "../../../schemas/v1";
import { VISUALIZATION_KIND } from "../../../visualization";
import {
  isCameraCalibrationStream,
  isCompressedImageStream,
  isGridStream,
  isImageStream,
  isLocationFixStream,
  isPointCloudStream,
  isPoseStream,
  streamTopics,
} from "../stream-topics";
import { createMcapDecoderRegistry } from ".";
import {
  ROS_CAMERA_INFO_PAYLOADS,
  ROS_COMPRESSED_IMAGE_PAYLOADS,
  ROS_IMAGE_PAYLOADS,
  ROS_LASER_SCAN_PAYLOADS,
  ROS_NAV_SAT_FIX_PAYLOADS,
  ROS_OCCUPANCY_GRID_PAYLOADS,
  ROS_ODOMETRY_PAYLOADS,
  ROS_POINT_CLOUD2_PAYLOADS,
  ROS_POSE_STAMPED_PAYLOADS,
  rosCameraInfoDecoders,
  rosCompressedImageDecoders,
  rosImageDecoders,
  rosLaserScanDecoders,
  rosNavSatFixDecoders,
  rosOccupancyGridDecoders,
  rosOdometryDecoders,
  rosPointCloud2Decoders,
  rosPoseStampedDecoders,
} from "./ros";

const TEXT_ENCODER = new TextEncoder();

const ROS2_HEADER_DEFINITIONS = `===
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
===
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

const ROS1_POINT_CLOUD2_SCHEMA = `std_msgs/Header header
uint32 height
uint32 width
sensor_msgs/PointField[] fields
bool is_bigendian
uint32 point_step
uint32 row_step
uint8[] data
bool is_dense
===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
===
MSG: sensor_msgs/PointField
uint8 INT8=1
uint8 UINT8=2
uint8 INT16=3
uint8 UINT16=4
uint8 INT32=5
uint8 UINT32=6
uint8 FLOAT32=7
uint8 FLOAT64=8
string name
uint32 offset
uint8 datatype
uint32 count`;

const ROS2_CAMERA_INFO_SCHEMA = `std_msgs/Header header
uint32 height
uint32 width
string distortion_model
float64[] d
float64[9] k
float64[9] r
float64[12] p
uint32 binning_x
uint32 binning_y
sensor_msgs/RegionOfInterest roi
${ROS2_HEADER_DEFINITIONS}
===
MSG: sensor_msgs/RegionOfInterest
uint32 x_offset
uint32 y_offset
uint32 height
uint32 width
bool do_rectify`;

const ROS2_LASER_SCAN_SCHEMA = `std_msgs/Header header
float32 angle_min
float32 angle_max
float32 angle_increment
float32 time_increment
float32 scan_time
float32 range_min
float32 range_max
float32[] ranges
float32[] intensities
${ROS2_HEADER_DEFINITIONS}`;

const ROS2_POSE_STAMPED_SCHEMA = `std_msgs/Header header
geometry_msgs/Pose pose
${ROS2_HEADER_DEFINITIONS}
===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

const ROS2_ODOMETRY_SCHEMA = `std_msgs/Header header
string child_frame_id
geometry_msgs/PoseWithCovariance pose
geometry_msgs/TwistWithCovariance twist
${ROS2_HEADER_DEFINITIONS}
===
MSG: geometry_msgs/PoseWithCovariance
geometry_msgs/Pose pose
float64[36] covariance
===
MSG: geometry_msgs/TwistWithCovariance
geometry_msgs/Twist twist
float64[36] covariance
===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
===
MSG: geometry_msgs/Twist
geometry_msgs/Vector3 linear
geometry_msgs/Vector3 angular
===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

const ROS1_NAV_SAT_FIX_SCHEMA = `std_msgs/Header header
sensor_msgs/NavSatStatus status
float64 latitude
float64 longitude
float64 altitude
float64[9] position_covariance
uint8 position_covariance_type
===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
===
MSG: sensor_msgs/NavSatStatus
int8 STATUS_NO_FIX=-1
int8 STATUS_FIX=0
int8 STATUS_SBAS_FIX=1
int8 STATUS_GBAS_FIX=2
uint16 SERVICE_GPS=1
uint16 SERVICE_GLONASS=2
uint16 SERVICE_COMPASS=4
uint16 SERVICE_GALILEO=8
int8 status
uint16 service`;

const ROS1_OCCUPANCY_GRID_SCHEMA = `std_msgs/Header header
nav_msgs/MapMetaData info
int8[] data
===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
===
MSG: nav_msgs/MapMetaData
time map_load_time
float32 resolution
uint32 width
uint32 height
geometry_msgs/Pose origin
===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

const ROS2_IDL_COMPRESSED_IMAGE_SCHEMA = `module sensor_msgs {
  module msg {
    struct CompressedImage {
      std_msgs::msg::Header header;
      string format;
      sequence<octet> data;
    };
  };
};
module std_msgs {
  module msg {
    struct Header {
      builtin_interfaces::msg::Time stamp;
      string frame_id;
    };
  };
};
module builtin_interfaces {
  module msg {
    struct Time {
      long sec;
      unsigned long nanosec;
    };
  };
};`;

const ROS1_IMAGE_SCHEMA = `std_msgs/Header header
uint32 height
uint32 width
string encoding
uint8 is_bigendian
uint32 step
uint8[] data
===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id`;

const ROS2_IMAGE_SCHEMA = `std_msgs/Header header
uint32 height
uint32 width
string encoding
uint8 is_bigendian
uint32 step
uint8[] data
${ROS2_HEADER_DEFINITIONS}`;

const ROS2_IDL_IMAGE_SCHEMA = `module sensor_msgs {
  module msg {
    struct Image {
      std_msgs::msg::Header header;
      unsigned long height;
      unsigned long width;
      string encoding;
      octet is_bigendian;
      unsigned long step;
      sequence<octet> data;
    };
  };
};
module std_msgs {
  module msg {
    struct Header {
      builtin_interfaces::msg::Time stamp;
      string frame_id;
    };
  };
};
module builtin_interfaces {
  module msg {
    struct Time {
      long sec;
      unsigned long nanosec;
    };
  };
};`;

describe("ROS MCAP decoders", () => {
  it("registers every ROS payload with the MCAP decoder registry", () => {
    const registry = createMcapDecoderRegistry();
    const payloads = [
      ...ROS_CAMERA_INFO_PAYLOADS,
      ...ROS_COMPRESSED_IMAGE_PAYLOADS,
      ...ROS_IMAGE_PAYLOADS,
      ...ROS_LASER_SCAN_PAYLOADS,
      ...ROS_NAV_SAT_FIX_PAYLOADS,
      ...ROS_OCCUPANCY_GRID_PAYLOADS,
      ...ROS_ODOMETRY_PAYLOADS,
      ...ROS_POINT_CLOUD2_PAYLOADS,
      ...ROS_POSE_STAMPED_PAYLOADS,
    ];

    for (const payload of payloads) {
      expect(registry.find(payload), JSON.stringify(payload)).toBeDefined();
    }
  });

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
      }),
      { schemaData: schemaData(ROS1_POINT_CLOUD2_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(output.visualization.coordinateFrameId).toBe("lidar");
    expect(output.visualization.pointCount).toBe(3);
    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6, 9, 10, 11,
    ]);
    expect(output.visualization.scalarFields?.[0]?.name).toBe("intensity");
    expect(
      Array.from(output.visualization.scalarFields?.[0]?.values ?? []),
    ).toEqual([10, 20, 40]);
    expect(output.visualization.scalarFields?.[1]?.name).toBe("ring");
    expect(
      Array.from(output.visualization.scalarFields?.[1]?.values ?? []),
    ).toEqual([50_000, 60_000, 65_535]);
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

  it("decodes ros2 idl CompressedImage into an encoded image visualization", () => {
    const output = decoderForSchemaEncoding(
      rosCompressedImageDecoders,
      "ros2idl",
    ).decode(
      ros2IdlMessage(ROS2_IDL_COMPRESSED_IMAGE_SCHEMA, {
        data: Array.from(TEXT_ENCODER.encode("fake-jpeg")),
        format: "jpeg",
        header: {
          frame_id: "camera",
          stamp: { nsec: 4, sec: 3 },
        },
      }),
      { schemaData: schemaData(ROS2_IDL_COMPRESSED_IMAGE_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_IMAGE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_IMAGE) {
      throw new Error("Expected encoded image visualization");
    }
    expect(new TextDecoder().decode(output.visualization.bytes)).toBe(
      "fake-jpeg",
    );
    expect(output.visualization.mimeType).toBe("image/jpeg");
    expect(output.attributes).toMatchObject({
      byteLength: 9,
      format: "jpeg",
      frameId: "camera",
    });
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(3_000_000_004n);
  });

  it("decodes ros1 Image RGB/BGR rows with padding into raw RGBA", () => {
    const rgb = decoderForSchemaEncoding(rosImageDecoders, "ros1msg").decode(
      ros1ImageMessage({
        data: [1, 2, 3, 4, 5, 6, 99, 99, 7, 8, 9, 10, 11, 12, 88, 88],
        encoding: "rgb8",
        height: 2,
        step: 8,
        width: 2,
      }),
      { schemaData: schemaData(ROS1_IMAGE_SCHEMA) },
    );
    const bgr = decoderForSchemaEncoding(rosImageDecoders, "ros1msg").decode(
      ros1ImageMessage({
        data: [10, 20, 30, 1, 2, 3],
        encoding: "bgr8",
        height: 1,
        step: 6,
        width: 2,
      }),
      { schemaData: schemaData(ROS1_IMAGE_SCHEMA) },
    );

    expect(rgb.visualization?.kind).toBe(VISUALIZATION_KIND.RAW_IMAGE);
    if (rgb.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
      throw new Error("Expected raw image visualization");
    }
    expect(Array.from(rgb.visualization.rgba)).toEqual([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
    ]);
    expect(rgb.visualization).toMatchObject({
      coordinateFrameId: "camera",
      height: 2,
      sourceEncoding: "rgb8",
      timestampNs: 1_000_000_002n,
      width: 2,
    });
    expect(rgb.attributes).toMatchObject({
      byteLength: 16,
      encoding: "rgb8",
      frameId: "camera",
      step: 8,
    });

    expect(bgr.visualization?.kind).toBe(VISUALIZATION_KIND.RAW_IMAGE);
    if (bgr.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
      throw new Error("Expected raw image visualization");
    }
    expect(Array.from(bgr.visualization.rgba)).toEqual([
      30, 20, 10, 255, 3, 2, 1, 255,
    ]);
  });

  it("decodes mono Image encodings and numeric big-endian data", () => {
    const mono8 = decoderForSchemaEncoding(rosImageDecoders, "ros2msg").decode(
      ros2ImageMessage({
        data: [0, 128, 255],
        encoding: "mono8",
        height: 1,
        step: 3,
        width: 3,
      }),
      { schemaData: schemaData(ROS2_IMAGE_SCHEMA) },
    );
    const mono16BigEndian = decoderForSchemaEncoding(
      rosImageDecoders,
      "ros2msg",
    ).decode(
      ros2ImageMessage({
        data: uint16Bytes([0, 1000, 2000], false),
        encoding: "mono16",
        height: 1,
        isBigEndian: true,
        step: 6,
        width: 3,
      }),
      { schemaData: schemaData(ROS2_IMAGE_SCHEMA) },
    );

    expect(rawRgba(mono8)).toEqual([
      0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
    ]);
    expect(rawRgba(mono16BigEndian)).toEqual([
      0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
    ]);
    expect(mono16BigEndian.attributes).toMatchObject({ bigEndian: true });
  });

  it("decodes depth Image encodings with per-frame normalization", () => {
    const depth16 = decoderForSchemaEncoding(
      rosImageDecoders,
      "ros2msg",
    ).decode(
      ros2ImageMessage({
        data: uint16Bytes([0, 1000, 2000, 1000]),
        encoding: "16UC1",
        height: 1,
        step: 8,
        width: 4,
      }),
      { schemaData: schemaData(ROS2_IMAGE_SCHEMA) },
    );
    const depth32 = decoderForSchemaEncoding(
      rosImageDecoders,
      "ros2msg",
    ).decode(
      ros2ImageMessage({
        data: float32Bytes([Number.NaN, 1.5, 3]),
        encoding: "32FC1",
        height: 1,
        step: 12,
        width: 3,
      }),
      { schemaData: schemaData(ROS2_IMAGE_SCHEMA) },
    );

    expect(rawRgba(depth16)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    ]);
    expect(depth16.attributes).toMatchObject({
      depthMax: 2000,
      depthMin: 1000,
    });
    expect(rawRgba(depth32)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255,
    ]);
    expect(depth32.attributes).toMatchObject({
      depthMax: 3,
      depthMin: 1.5,
    });
  });

  it("decodes ros2 idl Bayer Image with deterministic demosaic", () => {
    const output = decoderForSchemaEncoding(rosImageDecoders, "ros2idl").decode(
      ros2IdlImageMessage({
        data: [100, 50, 60, 10],
        encoding: "bayer_rggb8",
        height: 2,
        step: 2,
        width: 2,
      }),
      { schemaData: schemaData(ROS2_IDL_IMAGE_SCHEMA) },
    );

    expect(rawRgba(output)).toEqual([
      100, 55, 10, 255, 100, 50, 10, 255, 100, 60, 10, 255, 100, 55, 10, 255,
    ]);
  });

  it("degrades unsupported or malformed Image frames without throwing", () => {
    const decoder = decoderForSchemaEncoding(rosImageDecoders, "ros1msg");
    const unsupported = decoder.decode(
      ros1ImageMessage({
        data: [1, 2],
        encoding: "yuv422",
        height: 1,
        step: 2,
        width: 1,
      }),
      { schemaData: schemaData(ROS1_IMAGE_SCHEMA) },
    );
    const malformed = decoder.decode(
      ros1ImageMessage({
        data: [1, 2, 3],
        encoding: "rgb8",
        height: 1,
        step: 2,
        width: 1,
      }),
      { schemaData: schemaData(ROS1_IMAGE_SCHEMA) },
    );

    expect(unsupported.visualization).toBeUndefined();
    expect(unsupported.attributes).toMatchObject({
      encoding: "yuv422",
      unsupportedReason: "ROS Image encoding 'yuv422' is unsupported",
    });
    expect(malformed.visualization).toBeUndefined();
    expect(malformed.attributes?.unsupportedReason).toContain(
      "Image step 2 cannot hold 1 pixels of 3 bytes",
    );
  });

  it("decodes ros2 CameraInfo lowercase calibration fields", () => {
    const K = [100, 0, 50, 0, 101, 51, 0, 0, 1];
    const output = decoderForSchemaEncoding(
      rosCameraInfoDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_CAMERA_INFO_SCHEMA, {
        binning_x: 0,
        binning_y: 0,
        d: [0.1, -0.2, 0, 0, 0],
        distortion_model: "plumb_bob",
        header: ros2Header({ frameId: "camera_optical", nanosec: 6, sec: 5 }),
        height: 480,
        k: K,
        p: [100, 0, 50, 0, 0, 101, 51, 0, 0, 0, 1, 0],
        r: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        roi: {
          do_rectify: false,
          height: 0,
          width: 0,
          x_offset: 0,
          y_offset: 0,
        },
        width: 640,
      }),
      { schemaData: schemaData(ROS2_CAMERA_INFO_SCHEMA) },
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
  });

  it("decodes ros2 PoseStamped and Odometry into pose visualizations", () => {
    const poseStamped = decoderForSchemaEncoding(
      rosPoseStampedDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_POSE_STAMPED_SCHEMA, {
        header: ros2Header({ frameId: "map", nanosec: 10, sec: 9 }),
        pose: poseRecord([1, 2, 3], [0, 0, 0, 1]),
      }),
      { schemaData: schemaData(ROS2_POSE_STAMPED_SCHEMA) },
    );
    const odometry = decoderForSchemaEncoding(
      rosOdometryDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_ODOMETRY_SCHEMA, {
        child_frame_id: "base_link",
        header: ros2Header({ frameId: "odom", nanosec: 12, sec: 11 }),
        pose: {
          covariance: Array(36).fill(0),
          pose: poseRecord([4, 5, 6], [0, 0, 0, 1]),
        },
        twist: {
          covariance: Array(36).fill(0),
          twist: {
            angular: vectorRecord([0.1, 0.2, 0.3]),
            linear: vectorRecord([7, 8, 9]),
          },
        },
      }),
      { schemaData: schemaData(ROS2_ODOMETRY_SCHEMA) },
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

  it("decodes ros1 NavSatFix into a location visualization", () => {
    const output = decoderForSchemaEncoding(
      rosNavSatFixDecoders,
      "ros1msg",
    ).decode(
      ros1Message(ROS1_NAV_SAT_FIX_SCHEMA, {
        altitude: 12.5,
        header: ros1Header({ frameId: "gps", nsec: 14, sec: 13, seq: 2 }),
        latitude: 37.77,
        longitude: -122.42,
        position_covariance: [1, 0, 0, 0, 2, 0, 0, 0, 3],
        position_covariance_type: 2,
        status: { service: 1, status: 0 },
      }),
      { schemaData: schemaData(ROS1_NAV_SAT_FIX_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.LOCATION);
    if (output.visualization?.kind !== VISUALIZATION_KIND.LOCATION) {
      throw new Error("Expected location visualization");
    }
    expect(output.visualization).toMatchObject({
      altitude: 12.5,
      coordinateFrameId: "gps",
      latitude: 37.77,
      longitude: -122.42,
      positionCovariance: [1, 0, 0, 0, 2, 0, 0, 0, 3],
      timestampNs: 13_000_000_014n,
    });
    expect(output.attributes).toMatchObject({
      positionCovarianceType: 2,
      sequence: 2,
      status: { service: 1, status: 0 },
    });
  });

  it("drops NavSatFix covariance when covariance type is unknown", () => {
    const output = decoderForSchemaEncoding(
      rosNavSatFixDecoders,
      "ros1msg",
    ).decode(
      ros1Message(ROS1_NAV_SAT_FIX_SCHEMA, {
        altitude: 0,
        header: ros1Header({ frameId: "gps", nsec: 14, sec: 13 }),
        latitude: 37.77,
        longitude: -122.42,
        position_covariance: [1, 0, 0, 0, 2, 0, 0, 0, 3],
        position_covariance_type: 0,
        status: { service: 1, status: 0 },
      }),
      { schemaData: schemaData(ROS1_NAV_SAT_FIX_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.LOCATION);
    if (output.visualization?.kind !== VISUALIZATION_KIND.LOCATION) {
      throw new Error("Expected location visualization");
    }
    expect(output.visualization.positionCovariance).toBeUndefined();
    expect(output.attributes).toMatchObject({
      positionCovarianceType: 0,
    });
  });

  it("decodes ros1 OccupancyGrid into a grid visualization", () => {
    const output = decoderForSchemaEncoding(
      rosOccupancyGridDecoders,
      "ros1msg",
    ).decode(
      ros1Message(ROS1_OCCUPANCY_GRID_SCHEMA, {
        data: [-1, 0, 50, 100],
        header: ros1Header({ frameId: "map", nsec: 16, sec: 15 }),
        info: {
          height: 2,
          map_load_time: { nsec: 18, sec: 17 },
          origin: poseRecord([1, 2, 0], [0, 0, 0, 1]),
          resolution: 0.5,
          width: 2,
        },
      }),
      { schemaData: schemaData(ROS1_OCCUPANCY_GRID_SCHEMA) },
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
    expect(output.attributes).toMatchObject({
      cellCount: 4,
      mapLoadTimeNs: 17_000_000_018n,
    });
  });

  it("classifies ROS streams with the same payload descriptors the registry uses", () => {
    const compressed = createTopic("/camera/compressed", {
      encoding: "cdr",
      schema: "sensor_msgs/msg/CompressedImage",
      schemaEncoding: "ros2idl",
    });
    const rawImage = createTopic("/camera/image", {
      encoding: "cdr",
      schema: "sensor_msgs/msg/Image",
      schemaEncoding: "ros2msg",
    });
    const cloud = createTopic("/points", {
      encoding: "ros1",
      schema: "sensor_msgs/PointCloud2",
      schemaEncoding: "ros1msg",
    });
    const scan = createTopic("/scan", {
      encoding: "cdr",
      schema: "sensor_msgs/msg/LaserScan",
      schemaEncoding: "ros2msg",
    });

    expect(isCompressedImageStream(compressed)).toBe(true);
    expect(isCompressedImageStream(rawImage)).toBe(false);
    expect(isImageStream(compressed)).toBe(true);
    expect(isImageStream(rawImage)).toBe(true);
    expect(isPointCloudStream(cloud)).toBe(true);
    expect(isPointCloudStream(scan)).toBe(true);
    expect(
      isCameraCalibrationStream(
        createTopic("/camera/info", ROS_CAMERA_INFO_PAYLOADS[1]),
      ),
    ).toBe(true);
    expect(
      isPoseStream(createTopic("/pose", ROS_POSE_STAMPED_PAYLOADS[1])),
    ).toBe(true);
    expect(isPoseStream(createTopic("/odom", ROS_ODOMETRY_PAYLOADS[1]))).toBe(
      true,
    );
    expect(
      isLocationFixStream(createTopic("/gps", ROS_NAV_SAT_FIX_PAYLOADS[0])),
    ).toBe(true);
    expect(
      isGridStream(createTopic("/map", ROS_OCCUPANCY_GRID_PAYLOADS[0])),
    ).toBe(true);
    expect(streamTopics([compressed, rawImage, cloud, scan])).toMatchObject({
      image: ["/camera/compressed", "/camera/image"],
      pointCloud: ["/points", "/scan"],
      previewable: ["/camera/compressed", "/camera/image", "/points", "/scan"],
    });
  });
});

function decoderForSchemaEncoding(
  decoders: readonly Decoder[],
  schemaEncoding: string,
): Decoder {
  const decoder = decoders.find(
    (candidate) => candidate.payload.schemaEncoding === schemaEncoding,
  );
  if (!decoder) {
    throw new Error(`Missing decoder for ${schemaEncoding}`);
  }

  return decoder;
}

function schemaData(schema: string): Uint8Array {
  return new Uint8Array(TEXT_ENCODER.encode(schema));
}

function ros1Message(
  schema: string,
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros1MessageWriter(parseRosMessageDefinition(schema));
  return writer.writeMessage(record);
}

function ros2Message(
  schema: string,
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(schema, { ros2: true }),
  );
  return writer.writeMessage(record);
}

function ros2IdlMessage(
  schema: string,
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(parseRos2idl(schema));
  return writer.writeMessage(record);
}

function ros1ImageMessage({
  data,
  encoding,
  height,
  isBigEndian = false,
  step,
  width,
}: {
  readonly data: readonly number[];
  readonly encoding: string;
  readonly height: number;
  readonly isBigEndian?: boolean;
  readonly step: number;
  readonly width: number;
}): Uint8Array {
  return ros1Message(ROS1_IMAGE_SCHEMA, {
    data,
    encoding,
    header: ros1Header({ frameId: "camera", nsec: 2, sec: 1, seq: 9 }),
    height,
    is_bigendian: isBigEndian ? 1 : 0,
    step,
    width,
  });
}

function ros2ImageMessage({
  data,
  encoding,
  height,
  isBigEndian = false,
  step,
  width,
}: {
  readonly data: readonly number[];
  readonly encoding: string;
  readonly height: number;
  readonly isBigEndian?: boolean;
  readonly step: number;
  readonly width: number;
}): Uint8Array {
  return ros2Message(ROS2_IMAGE_SCHEMA, {
    data,
    encoding,
    header: ros2Header({ frameId: "camera", nanosec: 2, sec: 1 }),
    height,
    is_bigendian: isBigEndian ? 1 : 0,
    step,
    width,
  });
}

function ros2IdlImageMessage({
  data,
  encoding,
  height,
  isBigEndian = false,
  step,
  width,
}: {
  readonly data: readonly number[];
  readonly encoding: string;
  readonly height: number;
  readonly isBigEndian?: boolean;
  readonly step: number;
  readonly width: number;
}): Uint8Array {
  return ros2IdlMessage(ROS2_IDL_IMAGE_SCHEMA, {
    data,
    encoding,
    header: {
      frame_id: "camera",
      stamp: { nanosec: 2, sec: 1 },
    },
    height,
    is_bigendian: isBigEndian ? 1 : 0,
    step,
    width,
  });
}

function rawRgba(output: DecodedOutput): readonly number[] {
  expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.RAW_IMAGE);
  if (output.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
    throw new Error("Expected raw image visualization");
  }

  return Array.from(output.visualization.rgba);
}

function ros1Header({
  frameId,
  nsec = 0,
  sec = 0,
  seq = 0,
}: {
  readonly frameId: string;
  readonly nsec?: number;
  readonly sec?: number;
  readonly seq?: number;
}) {
  return {
    frame_id: frameId,
    seq,
    stamp: { nsec, sec },
  };
}

function ros2Header({
  frameId,
  nanosec = 0,
  sec = 0,
}: {
  readonly frameId: string;
  readonly nanosec?: number;
  readonly sec?: number;
}) {
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

function pointCloud2Data({
  pointStep,
  points,
  rowStep,
  width,
}: {
  readonly pointStep: number;
  readonly points: readonly (readonly [
    number,
    number,
    number,
    number,
    number,
  ])[];
  readonly rowStep: number;
  readonly width: number;
}): Uint8Array {
  const height = Math.ceil(points.length / width);
  const data = new Uint8Array(rowStep * height);
  const view = new DataView(data.buffer);

  points.forEach(([x, y, z, intensity, ring], index) => {
    const row = Math.floor(index / width);
    const column = index % width;
    const offset = row * rowStep + column * pointStep;
    view.setFloat32(offset, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, z, true);
    view.setFloat32(offset + 12, intensity, true);
    view.setUint16(offset + 16, ring, true);
  });

  return data;
}

function uint16Bytes(values: readonly number[], littleEndian = true): number[] {
  const data = new Uint8Array(values.length * 2);
  const view = new DataView(data.buffer);
  values.forEach((value, index) => {
    view.setUint16(index * 2, value, littleEndian);
  });
  return Array.from(data);
}

function float32Bytes(
  values: readonly number[],
  littleEndian = true,
): number[] {
  const data = new Uint8Array(values.length * 4);
  const view = new DataView(data.buffer);
  values.forEach((value, index) => {
    view.setFloat32(index * 4, value, littleEndian);
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
  payload: PayloadDescriptor = {
    encoding: "protobuf",
    schema: "foxglove.CompressedImage",
    schemaEncoding: "protobuf",
  },
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

function expectArrayCloseTo(
  actual: readonly number[],
  expected: readonly number[],
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN);
  });
}
