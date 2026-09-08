import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import {
  foxglovePoseInFrameDecoder,
  foxgloveSceneUpdateCdrDecoders,
} from "./foxglove/index";
import { POSE_IN_FRAME_FIXTURE } from "./foxglove.test-fixtures";
import {
  ROS2_SCENE_UPDATE_SCHEMA,
  concatProtobufFields,
  decoderForSchemaEncoding,
  protobufBytesField,
  protobufDoubleField,
  ros2Message,
  schemaData,
} from "./foxglove.test-helpers";

describe("Foxglove pose and scene decoders", () => {
  it("decodes protobuf pose-in-frame payloads", () => {
    // foxglove.PoseInFrame field numbers: frame_id=2, pose=3
    // (foxglove.Pose: position=1, orientation=2; doubles x=1,y=2,z=3,w=4).
    const output = foxglovePoseInFrameDecoder.decode(
      concatProtobufFields(
        protobufBytesField(2, new TextEncoder().encode("map")),
        protobufBytesField(
          3,
          concatProtobufFields(
            protobufBytesField(
              1,
              concatProtobufFields(
                protobufDoubleField(1, 995),
                protobufDoubleField(2, 1375),
                protobufDoubleField(3, 0.5),
              ),
            ),
            protobufBytesField(
              2,
              concatProtobufFields(
                protobufDoubleField(3, 0.707),
                protobufDoubleField(4, 0.707),
              ),
            ),
          ),
        ),
      ),
      {
        schemaData: POSE_IN_FRAME_FIXTURE.schemaData,
        sourceTimestamps: { captureTime: 10n },
        streamId: "/pose",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POSE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POSE) {
      throw new Error("Expected pose visualization");
    }
    expect(output.visualization).toMatchObject({
      coordinateFrameId: "map",
      position: [995, 1375, 0.5],
      quaternion: [0, 0, 0.707, 0.707],
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
  });

  it("decodes cdr scene update messages with Foxglove ROS2 schemas", () => {
    const output = decoderForSchemaEncoding(
      foxgloveSceneUpdateCdrDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_SCENE_UPDATE_SCHEMA, {
        deletions: [],
        entities: [
          {
            frame_id: "map",
            frame_locked: true,
            id: "debug/ego",
            timestamp: { nanosec: 5, sec: 4 },
          },
        ],
      }),
      { schemaData: schemaData(ROS2_SCENE_UPDATE_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE) {
      throw new Error("Expected scene update visualization");
    }
    expect(output.visualization.entities).toHaveLength(1);
    expect(output.visualization.entities[0]).toMatchObject({
      frameId: "map",
      frameLocked: true,
      id: "debug/ego",
      timestampNs: 4_000_000_005n,
    });
    expect(output.attributes).toMatchObject({
      deletionCount: 0,
      entityCount: 1,
    });
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(4_000_000_005n);
  });
});
