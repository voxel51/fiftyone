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

const PROTOBUF_ENCODING = "protobuf";
const FOXGLOVE_FRAME_TRANSFORMS_SCHEMA = "foxglove.FrameTransforms";

// TODO: Also accept tf2_msgs/msg/TFMessage (ROS) and CDR-encoded
// foxglove.FrameTransform once a CDR decoder lands. Schema discovery will
// pick those channels up automatically — only the wire decoder is missing.
const SUPPORTED_TRANSFORM_SCHEMAS: ReadonlySet<string> = new Set([
  "foxglove.FrameTransform",
  FOXGLOVE_FRAME_TRANSFORMS_SCHEMA,
]);

/**
 * Bootstrap scans schema-discovered channels with at most this many messages
 * each. Static transform channels publish on the order of one message per
 * child frame (a few dozen at most); dynamic channels publish at sensor rate
 * (thousands+). Channels above the cap are deferred to window reads, which
 * also recover any rare no-timestamp samples on dynamic channels.
 */
const BOOTSTRAP_CHANNEL_MESSAGE_CAP = 256n;

type McapChannel = McapTypes.TypedMcapRecords["Channel"];
type McapSchema = McapTypes.TypedMcapRecords["Schema"];

interface FrameTransformChannel {
  readonly channel: McapChannel;
  readonly messageCount: bigint | undefined;
  readonly schema: McapSchema;
}

/**
 * Discovers transform-capable channels from MCAP summary metadata. Footer-only;
 * does not read messages. A channel qualifies when its schema is a known
 * Foxglove frame transform schema and both channel and schema encodings are
 * decodable today.
 */
function discoverFrameTransformChannels(
  reader: McapIndexedReaderLike,
): readonly FrameTransformChannel[] {
  const channels: FrameTransformChannel[] = [];
  for (const channel of reader.channelsById.values()) {
    if (channel.messageEncoding !== PROTOBUF_ENCODING) {
      continue;
    }
    const schema = reader.schemasById.get(channel.schemaId);
    if (!schema || schema.encoding !== PROTOBUF_ENCODING) {
      continue;
    }
    if (!SUPPORTED_TRANSFORM_SCHEMAS.has(schema.name)) {
      continue;
    }
    channels.push({
      channel,
      messageCount: reader.statistics?.channelMessageCounts.get(channel.id),
      schema,
    });
  }

  return channels;
}

/**
 * Reads eager static frame transforms by schema discovery. A channel is
 * scanned in bootstrap only if its summary message count is at or below the
 * bootstrap cap, keeping bootstrap fast for files with chatty dynamic
 * transform channels. A sample is emitted as static when the decoded
 * transform message has no `timestamp` (Foxglove convention for
 * "always valid").
 */
export async function readMcapFrameTransformBootstrap(
  reader: McapIndexedReaderLike,
): Promise<McapFrameTransformSet> {
  const bootstrapChannels = discoverFrameTransformChannels(reader).filter(
    (entry) =>
      entry.messageCount === undefined ||
      entry.messageCount <= BOOTSTRAP_CHANNEL_MESSAGE_CAP,
  );
  if (bootstrapChannels.length === 0) {
    return createMcapFrameTransformSet({ samples: [] });
  }
  const channelsById = indexByChannelId(bootstrapChannels);

  const samples: McapFrameTransformSample[] = [];
  for await (const message of reader.readMessages({
    topics: bootstrapChannels.map((entry) => entry.channel.topic),
  })) {
    const entry = channelsById.get(message.channelId);
    if (!entry) {
      continue;
    }
    try {
      for (const sample of normalizeFrameTransformMessage({
        channel: entry.channel,
        message,
        schema: entry.schema,
      })) {
        if (sample.timeNs === undefined) {
          samples.push(sample);
        }
      }
    } catch {
      continue;
    }
  }

  return createMcapFrameTransformSet({ samples });
}

/**
 * Reads dynamic frame transforms in a playback timeline window from every
 * schema-discovered transform channel. Per-sample classification: a sample
 * with a message-level timestamp inside the requested window is dynamic;
 * a sample with no timestamp is emitted as static (no `timeNs`) so callers
 * can store it for all time, matching Foxglove convention.
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
  const transformChannels = discoverFrameTransformChannels(reader);
  if (transformChannels.length === 0) {
    return createMcapFrameTransformSet({ samples: [] });
  }
  const channelsById = indexByChannelId(transformChannels);
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: request.endTimeNs,
    startTimeNs: request.startTimeNs,
  });

  const samples: McapFrameTransformSample[] = [];
  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics: transformChannels.map((entry) => entry.channel.topic),
  })) {
    const entry = channelsById.get(message.channelId);
    if (!entry) {
      continue;
    }
    try {
      for (const sample of normalizeFrameTransformMessage({
        channel: entry.channel,
        message,
        schema: entry.schema,
      })) {
        if (sample.timeNs === undefined) {
          samples.push(sample);
          continue;
        }
        if (
          request.startTimeNs <= sample.timeNs &&
          sample.timeNs <= request.endTimeNs
        ) {
          samples.push(sample);
        }
      }
    } catch {
      continue;
    }
  }

  return createMcapFrameTransformSet({ samples });
}

function indexByChannelId(entries: readonly FrameTransformChannel[]) {
  return new Map(entries.map((entry) => [entry.channel.id, entry]));
}

function normalizeFrameTransformMessage({
  channel,
  message,
  schema,
}: {
  readonly channel: McapChannel;
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
    },
  );

  if (schema.name === FOXGLOVE_FRAME_TRANSFORMS_SCHEMA) {
    return requiredArray(record, "transforms").map((transform) =>
      normalizeFrameTransformRecord(asRecord(transform)),
    );
  }

  return [normalizeFrameTransformRecord(record)];
}

function normalizeFrameTransformRecord(
  record: Record<string, unknown>,
): McapFrameTransformSample {
  const parentFrameId = optionalString(
    record,
    "parentFrameId",
    "parent_frame_id",
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
      requiredNumber(rotation, "w"),
    ).normalize(),
    ...(transformTimeNs !== undefined ? { timeNs: transformTimeNs } : {}),
    translation: new Vector3(
      requiredNumber(translation, "x"),
      requiredNumber(translation, "y"),
      requiredNumber(translation, "z"),
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

function compareFrameTransformSamples(
  left: McapFrameTransformSample,
  right: McapFrameTransformSample,
) {
  const edgeOrder = frameTransformEdgeKey(left).localeCompare(
    frameTransformEdgeKey(right),
  );
  if (edgeOrder !== 0) {
    return edgeOrder;
  }

  return compareFrameTransformSamplesByTime(left, right);
}
