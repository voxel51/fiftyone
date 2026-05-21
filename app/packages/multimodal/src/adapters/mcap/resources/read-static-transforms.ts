import type { McapTypes } from "@mcap/core";
import { mcapErrorMessage } from "../errors";
import { createMcapStaticTransformGraph } from "../frame-graph";
import { decodeProtobufMessage } from "../decoders/foxglove/protobuf";
import {
  asRecord,
  optionalRecord,
  optionalString,
  requiredArray,
  requiredNumber,
} from "../decoders/foxglove/protobuf/records";
import { timestampNs } from "../decoders/foxglove/protobuf/timing";
import type { McapIndexedReaderLike } from "../reader";
import type {
  McapStaticTransform,
  McapStaticTransformGraph,
} from "../types";

const TF_STATIC_TOPIC = "/tf_static";
const PROTOBUF_ENCODING = "protobuf";
const FOXGLOVE_FRAME_TRANSFORM_SCHEMA = "foxglove.FrameTransform";
const FOXGLOVE_FRAME_TRANSFORMS_SCHEMA = "foxglove.FrameTransforms";

/**
 * Reads and normalizes static frame transforms from `/tf_static`.
 */
export async function readMcapStaticTransforms(
  reader: McapIndexedReaderLike
): Promise<McapStaticTransformGraph> {
  const diagnostics: string[] = [];
  const transforms: McapStaticTransform[] = [];

  for await (const message of reader.readMessages({ topics: [TF_STATIC_TOPIC] })) {
    const channel = reader.channelsById.get(message.channelId);
    if (!channel) {
      diagnostics.push(
        `Skipped /tf_static message on missing channel ${message.channelId}`
      );
      continue;
    }

    const schema = reader.schemasById.get(channel.schemaId);
    if (!isSupportedStaticTransformChannel(channel, schema)) {
      diagnostics.push(unsupportedChannelDiagnostic(channel, schema));
      continue;
    }

    try {
      transforms.push(
        ...normalizeStaticTransformMessage({ channel, message, schema })
      );
    } catch (error) {
      diagnostics.push(
        `Skipped malformed /tf_static message on channel ${
          message.channelId
        }: ${mcapErrorMessage(error)}`
      );
    }
  }

  return createMcapStaticTransformGraph({ diagnostics, transforms });
}

function normalizeStaticTransformMessage({
  channel,
  message,
  schema,
}: {
  readonly channel: McapTypes.TypedMcapRecords["Channel"];
  readonly message: McapTypes.TypedMcapRecords["Message"];
  readonly schema: McapTypes.TypedMcapRecords["Schema"];
}): readonly McapStaticTransform[] {
  const record = decodeProtobufMessage(
    message.data,
    {
      encoding: channel.messageEncoding,
      schema: schema.name,
      schemaEncoding: schema.encoding,
    },
    {
      schemaData: schema.data,
      sourceTimestamps: {
        logTime: message.logTime,
        publishTime: message.publishTime,
      },
      streamId: channel.topic,
    }
  );

  if (schema.name === FOXGLOVE_FRAME_TRANSFORMS_SCHEMA) {
    return requiredArray(record, "transforms").map((transform) =>
      normalizeStaticTransformRecord(asRecord(transform), message)
    );
  }

  return [normalizeStaticTransformRecord(record, message)];
}

function normalizeStaticTransformRecord(
  record: Record<string, unknown>,
  message: McapTypes.TypedMcapRecords["Message"]
): McapStaticTransform {
  const parentFrameId = optionalString(
    record,
    "parentFrameId",
    "parent_frame_id"
  );
  const childFrameId = optionalString(record, "childFrameId", "child_frame_id");
  const translation = optionalRecord(record, "translation");
  const rotation = optionalRecord(record, "rotation");
  const timestamp = timestampNs(optionalRecord(record, "timestamp"));

  if (!parentFrameId) {
    throw new Error("FrameTransform parent_frame_id is missing");
  }
  if (!childFrameId) {
    throw new Error("FrameTransform child_frame_id is missing");
  }
  if (!translation) {
    throw new Error("FrameTransform translation is missing");
  }
  if (!rotation) {
    throw new Error("FrameTransform rotation is missing");
  }

  return {
    childFrameId,
    parentFrameId,
    rotation: {
      w: requiredNumber(rotation, "w"),
      x: requiredNumber(rotation, "x"),
      y: requiredNumber(rotation, "y"),
      z: requiredNumber(rotation, "z"),
    },
    sourceChannelId: message.channelId,
    sourceTopic: TF_STATIC_TOPIC,
    ...(timestamp !== undefined ? { timestampNs: timestamp } : {}),
    translation: {
      x: requiredNumber(translation, "x"),
      y: requiredNumber(translation, "y"),
      z: requiredNumber(translation, "z"),
    },
  };
}

function isSupportedStaticTransformChannel(
  channel: McapTypes.TypedMcapRecords["Channel"],
  schema: McapTypes.TypedMcapRecords["Schema"] | undefined
) {
  return (
    channel.topic === TF_STATIC_TOPIC &&
    channel.messageEncoding === PROTOBUF_ENCODING &&
    schema?.encoding === PROTOBUF_ENCODING &&
    (schema.name === FOXGLOVE_FRAME_TRANSFORM_SCHEMA ||
      schema.name === FOXGLOVE_FRAME_TRANSFORMS_SCHEMA)
  );
}

function unsupportedChannelDiagnostic(
  channel: McapTypes.TypedMcapRecords["Channel"],
  schema: McapTypes.TypedMcapRecords["Schema"] | undefined
) {
  const schemaName = schema?.name ?? "missing schema";
  const schemaEncoding = schema?.encoding ?? "missing schema encoding";

  return `Skipped unsupported /tf_static channel ${channel.id}: ${channel.messageEncoding}/${schemaEncoding}/${schemaName}`;
}
