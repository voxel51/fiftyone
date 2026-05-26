import type { McapTypes } from "@mcap/core";
import { Quaternion, Vector3 } from "three";
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
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapFrameTransformSample,
  McapFrameTransformSet,
} from "../frame-transform-types";
import {
  compareFrameTransformSamplesByTime,
  frameTransformEdgeKey,
} from "../frame-transforms";
import type { McapReadFrameTransformWindowRequest } from "../types";

const TF_STATIC_TOPIC = "/tf_static";
const TF_DYNAMIC_TOPIC = "/tf";
const PROTOBUF_ENCODING = "protobuf";
const FOXGLOVE_FRAME_TRANSFORM_SCHEMA = "foxglove.FrameTransform";
const FOXGLOVE_FRAME_TRANSFORMS_SCHEMA = "foxglove.FrameTransforms";

type McapChannel = McapTypes.TypedMcapRecords["Channel"];
type McapSchema = McapTypes.TypedMcapRecords["Schema"];

/**
 * Reads eager static frame transforms from `/tf_static`.
 */
export async function readMcapFrameTransformBootstrap(
  reader: McapIndexedReaderLike
): Promise<McapFrameTransformSet> {
  const samples: McapFrameTransformSample[] = [];

  for await (const message of reader.readMessages({
    topics: [TF_STATIC_TOPIC],
  })) {
    const channel = reader.channelsById.get(message.channelId);
    if (!channel) {
      continue;
    }

    const schema = reader.schemasById.get(channel.schemaId);
    if (!isSupportedFrameTransformChannel(channel, schema)) {
      continue;
    }

    try {
      samples.push(
        ...normalizeFrameTransformMessage({
          channel,
          message,
          schema,
        })
      );
    } catch {
      continue;
    }
  }

  return createMcapFrameTransformSet({ samples });
}

/**
 * Reads dynamic frame transforms from `/tf` inside a playback timeline window.
 */
export async function readMcapFrameTransformWindow({
  reader,
  request,
  timeline,
}: {
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadFrameTransformWindowRequest;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapFrameTransformSet> {
  const samples: McapFrameTransformSample[] = [];
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: request.endTimeNs,
    startTimeNs: request.startTimeNs,
  });

  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics: [TF_DYNAMIC_TOPIC],
  })) {
    const channel = reader.channelsById.get(message.channelId);
    if (!channel) {
      continue;
    }

    const schema = reader.schemasById.get(channel.schemaId);
    if (!isSupportedFrameTransformChannel(channel, schema)) {
      continue;
    }

    try {
      samples.push(
        ...normalizeFrameTransformMessage({
          channel,
          fallbackTimeNs: timeline.messageTimeNs(message),
          message,
          schema,
        }).filter(
          (sample) =>
            sample.timeNs !== undefined &&
            request.startTimeNs <= sample.timeNs &&
            sample.timeNs <= request.endTimeNs
        )
      );
    } catch {
      continue;
    }
  }

  return createMcapFrameTransformSet({ samples });
}

function normalizeFrameTransformMessage({
  channel,
  fallbackTimeNs,
  message,
  schema,
}: {
  readonly channel: McapChannel;
  readonly fallbackTimeNs?: bigint;
  readonly message: McapTypes.TypedMcapRecords["Message"];
  readonly schema: McapSchema;
}): readonly McapFrameTransformSample[] {
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
      normalizeFrameTransformRecord({
        fallbackTimeNs,
        record: asRecord(transform),
      })
    );
  }

  return [
    normalizeFrameTransformRecord({
      fallbackTimeNs,
      record,
    }),
  ];
}

function normalizeFrameTransformRecord({
  fallbackTimeNs,
  record,
}: {
  readonly fallbackTimeNs?: bigint;
  readonly record: Record<string, unknown>;
}): McapFrameTransformSample {
  const parentFrameId = optionalString(
    record,
    "parentFrameId",
    "parent_frame_id"
  );
  const childFrameId = optionalString(record, "childFrameId", "child_frame_id");
  const translation = optionalRecord(record, "translation");
  const rotation = optionalRecord(record, "rotation");
  const transformTimeNs = timestampNs(optionalRecord(record, "timestamp"));

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
    rotation: new Quaternion(
      requiredNumber(rotation, "x"),
      requiredNumber(rotation, "y"),
      requiredNumber(rotation, "z"),
      requiredNumber(rotation, "w")
    ).normalize(),
    ...(fallbackTimeNs !== undefined
      ? { timeNs: transformTimeNs ?? fallbackTimeNs }
      : {}),
    translation: new Vector3(
      requiredNumber(translation, "x"),
      requiredNumber(translation, "y"),
      requiredNumber(translation, "z")
    ),
  };
}

function createMcapFrameTransformSet({
  samples,
}: {
  readonly samples: readonly McapFrameTransformSample[];
}): McapFrameTransformSet {
  const sortedSamples = [...samples].sort(compareFrameTransformSamples);

  return {
    samples: sortedSamples,
  };
}

function isSupportedFrameTransformChannel(
  channel: McapChannel,
  schema: McapSchema | undefined
): schema is McapSchema {
  return (
    channel.messageEncoding === PROTOBUF_ENCODING &&
    schema?.encoding === PROTOBUF_ENCODING &&
    (schema.name === FOXGLOVE_FRAME_TRANSFORM_SCHEMA ||
      schema.name === FOXGLOVE_FRAME_TRANSFORMS_SCHEMA)
  );
}

function compareFrameTransformSamples(
  left: McapFrameTransformSample,
  right: McapFrameTransformSample
) {
  const edgeOrder = frameTransformEdgeKey(left).localeCompare(
    frameTransformEdgeKey(right)
  );
  if (edgeOrder !== 0) {
    return edgeOrder;
  }

  return compareFrameTransformSamplesByTime(left, right);
}
