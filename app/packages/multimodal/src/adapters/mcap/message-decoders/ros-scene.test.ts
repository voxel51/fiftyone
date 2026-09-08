import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import {
  rosDetection2DArrayDecoders,
  rosDetection3DArrayDecoders,
  rosMarkerArrayDecoders,
} from "./ros/index";
import {
  ROS2_DETECTION_2D_ARRAY_SCHEMA,
  ROS2_DETECTION_3D_ARRAY_SCHEMA,
  ROS2_MARKER_ARRAY_SCHEMA,
  colorRecord,
  decoderForSchemaEncoding,
  detection2DRecord,
  detection3DRecord,
  markerRecord,
  poseRecord,
  ros2Header,
  ros2Message,
  schemaData,
  vectorRecord,
} from "./ros.test-helpers";

describe("ROS detection and marker decoders", () => {
  it("decodes ros2 vision detections into transient viewer overlays", () => {
    const detections2d = decoderForSchemaEncoding(
      rosDetection2DArrayDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_DETECTION_2D_ARRAY_SCHEMA, {
        detections: [
          detection2DRecord({
            classId: "car",
            id: "track-1",
            score: 0.93,
            x: 50,
            y: 40,
          }),
        ],
        header: ros2Header({ frameId: "camera", nanosec: 18, sec: 17 }),
      }),
      { schemaData: schemaData(ROS2_DETECTION_2D_ARRAY_SCHEMA) },
    );
    const detections3d = decoderForSchemaEncoding(
      rosDetection3DArrayDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_DETECTION_3D_ARRAY_SCHEMA, {
        detections: [
          detection3DRecord({
            classId: "pedestrian",
            id: "track-9",
            score: 0.81,
          }),
        ],
        header: ros2Header({ frameId: "map", nanosec: 20, sec: 19 }),
      }),
      {
        schemaData: schemaData(ROS2_DETECTION_3D_ARRAY_SCHEMA),
        streamId: "/detections3d",
      },
    );

    expect(detections2d.visualization?.kind).toBe(
      VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
    );
    expect(detections3d.visualization?.kind).toBe(
      VISUALIZATION_KIND.SCENE_UPDATE,
    );
    if (
      detections2d.visualization?.kind !==
        VISUALIZATION_KIND.IMAGE_ANNOTATIONS ||
      detections3d.visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE
    ) {
      throw new Error("Expected detection visualizations");
    }
    expect(detections2d.visualization.points[0]).toMatchObject({
      points: [
        [40, 30],
        [60, 30],
        [60, 50],
        [40, 50],
      ],
      type: "line-loop",
    });
    expect(detections2d.visualization.texts[0]).toMatchObject({
      position: [40, 16],
      text: "car 0.93",
    });
    expect(detections2d.attributes).toMatchObject({
      boxCount: 1,
      classIds: ["car"],
      detectionCount: 1,
      frameId: "camera",
      textCount: 1,
    });
    expect(detections3d.visualization.deletions).toEqual([
      { id: "", timestampNs: 19_000_000_020n, type: "all" },
    ]);
    expect(detections3d.visualization.entities[0]).toMatchObject({
      cubeCount: 1,
      frameId: "map",
      id: "/detections3d:detection3d:track-9",
      metadata: {
        classId: "pedestrian",
        id: "track-9",
        score: "0.8100",
        source: "vision_msgs",
      },
      textCount: 1,
      timestampNs: 19_000_000_020n,
    });
    expect(detections3d.visualization.entities[0]?.cubes[0]?.size).toEqual([
      2, 1, 1.5,
    ]);
  });

  it("decodes ros2 MarkerArray into scene-update entities and deletions", () => {
    const output = decoderForSchemaEncoding(
      rosMarkerArrayDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_MARKER_ARRAY_SCHEMA, {
        markers: [
          markerRecord({
            color: colorRecord([1, 0, 0, 0.5]),
            frameLocked: true,
            id: 7,
            lifetime: { nanosec: 4, sec: 3 },
            ns: "boxes",
            pose: poseRecord([1, 2, 3], [0, 0, 0, 1]),
            scale: vectorRecord([4, 5, 6]),
            type: 1,
          }),
          markerRecord({
            color: colorRecord([0, 1, 0, 1]),
            id: 2,
            ns: "plan",
            points: [
              vectorRecord([0, 0, 0]),
              vectorRecord([1, 0, 0]),
              vectorRecord([1, 1, 0]),
            ],
            scale: vectorRecord([2, 1, 1]),
            type: 4,
          }),
          markerRecord({
            color: colorRecord([0, 0, 1, 1]),
            id: 3,
            ns: "labels",
            pose: poseRecord([0, 0, 2], [0, 0, 0, 1]),
            scale: vectorRecord([1, 1, 1.5]),
            text: "car",
            type: 9,
          }),
          markerRecord({ action: 2, id: 8, ns: "boxes", type: 1 }),
          markerRecord({ action: 3, id: 0, ns: "ignored", type: 1 }),
        ],
      }),
      {
        schemaData: schemaData(ROS2_MARKER_ARRAY_SCHEMA),
        streamId: "/markers",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE) {
      throw new Error("Expected scene update visualization");
    }

    expect(output.attributes).toMatchObject({
      deletionCount: 2,
      entityCount: 3,
      markerCount: 5,
      transparentMarkerCount: 0,
      unsupportedMarkerCount: 0,
    });
    expect(output.visualization.entities[0]).toMatchObject({
      cubeCount: 1,
      frameId: "map",
      frameLocked: true,
      id: "/markers:boxes:7",
      lifetimeNs: 3_000_000_004n,
      metadata: {
        id: "7",
        namespace: "boxes",
        source: "visualization_msgs/Marker",
        type: "CUBE",
      },
      timestampNs: 21_000_000_022n,
    });
    expect(output.visualization.entities[0]?.cubes[0]).toMatchObject({
      color: [1, 0, 0, 0.5],
      pose: { position: [1, 2, 3], quaternion: [0, 0, 0, 1] },
      size: [4, 5, 6],
    });
    expect(output.visualization.entities[1]?.lines[0]).toMatchObject({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      thickness: 2,
      type: "line-strip",
    });
    expect(output.visualization.entities[2]?.texts[0]).toMatchObject({
      billboard: true,
      fontSize: 1.5,
      text: "car",
    });
    expect(output.visualization.deletions).toEqual([
      {
        id: "/markers:boxes:8",
        timestampNs: 21_000_000_022n,
        type: "matching-id",
      },
      {
        id: "",
        timestampNs: 21_000_000_022n,
        type: "all",
      },
    ]);
  });

  it("marks oversized ros2 marker point lists as unsupported", () => {
    const points = Array.from({ length: 513 }, (_, index) =>
      vectorRecord([index, 0, 0]),
    );
    const output = decoderForSchemaEncoding(
      rosMarkerArrayDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_MARKER_ARRAY_SCHEMA, {
        markers: [
          markerRecord({
            id: 10,
            ns: "too-many-cubes",
            points,
            type: 6,
          }),
          markerRecord({
            id: 11,
            ns: "too-many-spheres",
            points,
            type: 7,
          }),
        ],
      }),
      {
        schemaData: schemaData(ROS2_MARKER_ARRAY_SCHEMA),
        streamId: "/markers",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE) {
      throw new Error("Expected scene update visualization");
    }
    expect(output.visualization.entities).toEqual([]);
    expect(output.attributes).toMatchObject({
      entityCount: 0,
      unsupportedMarkerCount: 2,
      unsupportedMarkerTypes: ["CUBE_LIST(513)", "SPHERE_LIST(513)"],
    });
  });
});
