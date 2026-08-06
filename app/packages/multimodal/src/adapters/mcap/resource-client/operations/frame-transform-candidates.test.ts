import { describe, expect, it } from "vitest";
import {
  CUSTOM_TRANSFORM_BUNDLE_MESSAGE,
  CUSTOM_TRANSFORM_BUNDLE_SCHEMA_DATA,
  FRAME_TRANSFORM_MESSAGE,
  FRAME_TRANSFORM_SCHEMA_DATA,
  createChannel,
  createMessage,
  createReader,
  createSchema,
} from "../inline-client.test-fixtures";
import {
  discoverFrameTransformChannels,
  isStaticTransformBootstrapTopic,
  normalizeFrameTransformMessage,
  type FrameTransformChannel,
} from "./frame-transform-candidates";

describe("frame transform candidates", () => {
  it("discovers and normalizes a known Foxglove protobuf schema", () => {
    const reader = createReader({
      channelsById: new Map([
        [7, createChannel({ id: 7, schemaId: 3, topic: "/tf" })],
      ]),
      schemasById: new Map([
        [
          3,
          createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
            id: 3,
            name: "foxglove.FrameTransform",
          }),
        ],
      ]),
    });

    const [entry] = discoverFrameTransformChannels(reader);
    if (!entry) throw new Error("Expected a transform candidate");
    expect(
      normalizeFrameTransformMessage({
        entry,
        message: createMessage(FRAME_TRANSFORM_MESSAGE),
      }),
    ).toMatchObject([
      {
        childFrameId: "lidar",
        parentFrameId: "map",
        timeNs: 7_000_000_020n,
        translation: { x: 1, y: 2, z: 3 },
      },
    ]);
  });

  it("discovers structural protobuf bundles and their repeated field", () => {
    const reader = createReader({
      channelsById: new Map([
        [7, createChannel({ id: 7, schemaId: 3, topic: "/calibration" })],
      ]),
      schemasById: new Map([
        [
          3,
          createSchema(CUSTOM_TRANSFORM_BUNDLE_SCHEMA_DATA, {
            id: 3,
            name: "custom.CalibrationBundle",
          }),
        ],
      ]),
    });

    const [entry] = discoverFrameTransformChannels(reader);
    if (!entry) throw new Error("Expected a transform bundle candidate");
    expect(entry.match).toEqual({
      format: "foxglove",
      kind: "batch",
      repeatedFieldName: "poses",
    });
    expect(
      normalizeFrameTransformMessage({
        entry,
        message: createMessage(CUSTOM_TRANSFORM_BUNDLE_MESSAGE),
      }),
    ).toMatchObject([
      {
        childFrameId: "custom_lidar",
        parentFrameId: "map",
        translation: { x: 4, y: 5, z: 6 },
      },
    ]);
  });

  it("contains malformed descriptor failures during discovery", () => {
    const reader = createReader({
      channelsById: new Map([[7, createChannel({ id: 7, schemaId: 3 })]]),
      schemasById: new Map([
        [
          3,
          createSchema(Uint8Array.of(255), {
            id: 3,
            name: "custom.Unknown",
          }),
        ],
      ]),
    });

    expect(discoverFrameTransformChannels(reader)).toEqual([]);
  });

  it("keeps malformed ROS timestamps untimed", () => {
    const entry: FrameTransformChannel = {
      channel: createChannel({ id: 7, schemaId: 3, topic: "/tf" }),
      decodeRecord: () => ({
        transforms: [
          {
            child_frame_id: "lidar",
            header: { frame_id: "map", stamp: {} },
            transform: {
              rotation: { w: 1, x: 0, y: 0, z: 0 },
              translation: { x: 1, y: 2, z: 3 },
            },
          },
        ],
      }),
      match: {
        format: "ros-tf-message",
        kind: "batch",
        repeatedFieldName: "transforms",
      },
      messageCount: undefined,
    };

    expect(
      normalizeFrameTransformMessage({
        entry,
        message: createMessage(new Uint8Array()),
      })[0]?.timeNs,
    ).toBeUndefined();
  });

  it("recognizes compound static-transform topic spellings", () => {
    expect(isStaticTransformBootstrapTopic("/sensors/static/transforms")).toBe(
      true,
    );
    expect(isStaticTransformBootstrapTopic("/sensors/tf")).toBe(false);
  });
});
