import { describe, expect, it } from "vitest";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import { PlaybackSyncMode, type StreamInventory } from "../../../schemas/v1";
import { mcapSceneSources, mcapStreamPolicies } from "./scene-sources";

describe("mcapSceneSources", () => {
  it("classifies supported payloads and omits unsupported topics", () => {
    const sources = mcapSceneSources([
      createTopic("/CAM_FRONT/image_rect_compressed"),
      createTopic("/CAM_REAR/image", "sensor_msgs/msg/Image", "cdr", "ros2msg"),
      createTopic("/CAM_VIDEO", "foxglove.CompressedVideo"),
      createTopic(
        "/CAM_VIDEO_CDR",
        "foxglove_msgs/msg/CompressedVideo",
        "cdr",
        "ros2msg",
      ),
      createTopic("/CAM_RGBD/raw", "foxglove.RawImage"),
      createTopic(
        "/CAM_RGBD/raw_cdr",
        "foxglove_msgs/msg/RawImage",
        "cdr",
        "ros2msg",
      ),
      createTopic("/LIDAR_TOP", "foxglove.PointCloud"),
      createTopic("/scan", "foxglove.LaserScan"),
      createTopic("/CAM_FRONT/annotations", "foxglove.ImageAnnotations"),
      createTopic("/markers/annotations", "foxglove.SceneUpdate"),
      createTopic("/map", "foxglove.Grid"),
      createTopic("/drivable_area", "foxglove.Grid"),
      createTopic("/CAM_FRONT/camera_info", "foxglove.CameraCalibration"),
      createTopic("/pose", "foxglove.PoseInFrame"),
      createTopic("/odom", "Pose", "json", "jsonschema"),
      createTopic("/gps", "foxglove.LocationFix"),
      createTopic("/tf", "foxglove.FrameTransform"),
      createTopic(
        "/diagnostics",
        "diagnostic_msgs/DiagnosticArray",
        "ros1",
        "ros1msg",
      ),
    ]);

    expect(sources).toEqual([
      {
        id: "/CAM_FRONT/image_rect_compressed",
        type: SCENE_SOURCE_TYPE.IMAGE,
        label: "CAM_FRONT",
        metadata: {
          "scene.calibration_stream_id": "/CAM_FRONT/camera_info",
        },
      },
      {
        id: "/CAM_REAR/image",
        type: SCENE_SOURCE_TYPE.IMAGE,
        label: "CAM_REAR",
      },
      {
        id: "/CAM_VIDEO",
        type: SCENE_SOURCE_TYPE.IMAGE,
        label: "CAM_VIDEO",
      },
      {
        id: "/CAM_VIDEO_CDR",
        type: SCENE_SOURCE_TYPE.IMAGE,
        label: "CAM_VIDEO_CDR",
      },
      {
        id: "/CAM_RGBD/raw",
        type: SCENE_SOURCE_TYPE.IMAGE,
        label: "CAM_RGBD",
      },
      {
        id: "/CAM_RGBD/raw_cdr",
        type: SCENE_SOURCE_TYPE.IMAGE,
        label: "CAM_RGBD/raw_cdr",
      },
      {
        id: "/LIDAR_TOP",
        type: SCENE_SOURCE_TYPE.POINT_CLOUD,
        label: "LIDAR_TOP",
      },
      {
        id: "/scan",
        type: SCENE_SOURCE_TYPE.POINT_CLOUD,
        label: "scan",
      },
      {
        id: "/CAM_FRONT/annotations",
        type: SCENE_SOURCE_TYPE.IMAGE_ANNOTATION,
        label: "CAM_FRONT/annotations",
      },
      {
        id: "/markers/annotations",
        type: SCENE_SOURCE_TYPE.SCENE_ANNOTATION,
        label: "markers/annotations",
      },
      {
        id: "/map",
        type: SCENE_SOURCE_TYPE.MAP_LAYER,
        label: "map",
      },
      {
        id: "/drivable_area",
        type: SCENE_SOURCE_TYPE.MAP_LAYER,
        label: "drivable_area",
      },
      {
        id: "/CAM_FRONT/camera_info",
        type: SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
        label: "CAM_FRONT/camera_info",
      },
      {
        id: "/pose",
        type: SCENE_SOURCE_TYPE.POSE,
        label: "pose",
      },
      {
        id: "/odom",
        type: SCENE_SOURCE_TYPE.POSE,
        label: "odom",
      },
      {
        id: "/gps",
        type: SCENE_SOURCE_TYPE.LOCATION,
        label: "gps",
      },
      {
        id: "/diagnostics",
        type: SCENE_SOURCE_TYPE.LOG,
        label: "diagnostics",
      },
    ]);
  });

  it("preserves inventory order so per-type defaults are deterministic", () => {
    const sources = mcapSceneSources([
      createTopic("/camera/front/image_rect_compressed"),
      createTopic("/camera/back/image_rect_compressed"),
    ]);

    expect(sources.map((s) => s.label)).toEqual([
      "camera/front",
      "camera/back",
    ]);
  });

  it("does not attach an arbitrary calibration when fuzzy matches tie", () => {
    const sources = mcapSceneSources([
      createTopic("/boxi/hesai/intensity_image", "foxglove.CompressedVideo"),
      createTopic(
        "/boxi/alphasense/front_left/camera_info",
        "sensor_msgs/msg/CameraInfo",
        "cdr",
        "ros2msg",
      ),
      createTopic(
        "/boxi/alphasense/front_right/camera_info",
        "sensor_msgs/msg/CameraInfo",
        "cdr",
        "ros2msg",
      ),
    ]);

    expect(sources[0]).toEqual({
      id: "/boxi/hesai/intensity_image",
      label: "boxi/hesai/intensity_image",
      type: SCENE_SOURCE_TYPE.IMAGE,
    });
  });

  it("classifies JSON-schema ROS topics from Test1-style MCAPs", () => {
    const sources = mcapSceneSources([
      createTopic(
        "IMG1_ltm_pyr_L1",
        "sensor_msgs/CompressedImage",
        "json",
        "jsonschema",
      ),
      createTopic(
        "IMG1_ltm_pyr_L1_left",
        "sensor_msgs/CompressedImage",
        "json",
        "jsonschema",
      ),
      createTopic(
        "IMG1_ltm_pyr_L1_right",
        "sensor_msgs/CompressedImage",
        "json",
        "jsonschema",
      ),
      createTopic(
        "IMG1_ltm_pyr_L1_wide",
        "sensor_msgs/CompressedImage",
        "json",
        "jsonschema",
      ),
      createTopic(
        "GNSS_Position",
        "sensor_msgs/NavSatFix",
        "json",
        "jsonschema",
      ),
    ]);

    expect(sources).toEqual([
      {
        id: "IMG1_ltm_pyr_L1",
        type: SCENE_SOURCE_TYPE.IMAGE,
        label: "IMG1_ltm_pyr_L1",
      },
      {
        id: "IMG1_ltm_pyr_L1_left",
        type: SCENE_SOURCE_TYPE.IMAGE,
        label: "IMG1_ltm_pyr_L1_left",
      },
      {
        id: "IMG1_ltm_pyr_L1_right",
        type: SCENE_SOURCE_TYPE.IMAGE,
        label: "IMG1_ltm_pyr_L1_right",
      },
      {
        id: "IMG1_ltm_pyr_L1_wide",
        type: SCENE_SOURCE_TYPE.IMAGE,
        label: "IMG1_ltm_pyr_L1_wide",
      },
      {
        id: "GNSS_Position",
        type: SCENE_SOURCE_TYPE.LOCATION,
        label: "GNSS_Position",
      },
    ]);
  });

  it("falls back to the full topic when short labels collide", () => {
    const sources = mcapSceneSources([
      createTopic("/camera/front/image_raw"),
      createTopic("/camera/front/image_rect_compressed"),
    ]);

    expect(sources.map((s) => s.label)).toEqual([
      "camera/front/image_raw",
      "camera/front/image_rect_compressed",
    ]);
  });

  it("carries record counts through for layout ranking", () => {
    const dense = createTopic("/cam/image_rect_compressed");
    dense.recordCount = "120";
    const single = createTopic("/cam/image_initial");
    single.recordCount = "1";
    const empty = createTopic("/cam/image_empty");
    empty.recordCount = "0";
    const unknown = createTopic("/cam/image_other");

    const sources = mcapSceneSources([dense, single, empty, unknown]);

    expect(sources.map((s) => s.recordCount)).toEqual([120, 1, 0, undefined]);
  });

  it("skips topics without a resolvable name", () => {
    const unnamed = createTopic("/camera/image_rect_compressed");
    unnamed.displayName = "";
    delete unnamed.metadata["mcap.topic"];

    expect(mcapSceneSources([unnamed])).toEqual([]);
  });
});

describe("mcapStreamPolicies", () => {
  it("assigns a sync policy per source type", () => {
    const policies = mcapStreamPolicies(
      mcapSceneSources([
        createTopic("/cam/image_rect_compressed"),
        createTopic("/cam/annotations", "foxglove.ImageAnnotations"),
        createTopic("/markers/annotations", "foxglove.SceneUpdate"),
        createTopic("/lidar", "foxglove.PointCloud"),
        createTopic("/map", "foxglove.Grid"),
        createTopic(
          "/diagnostics",
          "diagnostic_msgs/DiagnosticArray",
          "ros1",
          "ros1msg",
        ),
      ]),
    );

    // No tolerances: latest-at-or-before with unbounded lookback handles
    // arbitrarily sparse streams at the read layer.
    expect(policies["/cam/image_rect_compressed"]).toEqual({
      mode: PlaybackSyncMode.LATEST,
    });
    expect(policies["/cam/annotations"]).toEqual({
      mode: PlaybackSyncMode.LATEST,
    });
    expect(policies["/markers/annotations"]).toEqual({
      mode: PlaybackSyncMode.LATEST,
    });
    expect(policies["/lidar"]).toEqual({
      mode: PlaybackSyncMode.LATEST,
    });
    // A one-shot static /map stays resolvable for the whole run through the
    // same unbounded lookback.
    expect(policies["/map"]).toEqual({
      mode: PlaybackSyncMode.LATEST,
    });
    expect(policies["/diagnostics"]).toEqual({
      mode: PlaybackSyncMode.LATEST,
    });
  });

  it("leaves latest lookback unbounded", () => {
    const sources = mcapSceneSources([
      createTopic("/cam/image_rect_compressed"),
    ]);

    expect(mcapStreamPolicies(sources)).toEqual({
      "/cam/image_rect_compressed": {
        mode: PlaybackSyncMode.LATEST,
      },
    });
  });

  it("ignores sources with unknown types", () => {
    expect(
      mcapStreamPolicies([{ id: "/radar", type: "radar", label: "radar" }]),
    ).toEqual({});
  });
});

function createTopic(
  topic: string,
  schema = "foxglove.CompressedImage",
  encoding = "protobuf",
  schemaEncoding = "protobuf",
): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    displayName: topic,
    metadata: {
      "mcap.schema_name": schema,
      "mcap.topic": topic,
    },
    payload: {
      $typeName: "fiftyone.multimodal.schemas.v1.PayloadDescriptor",
      encoding,
      schema,
      schemaEncoding,
    },
    streamId: topic,
  };
}
