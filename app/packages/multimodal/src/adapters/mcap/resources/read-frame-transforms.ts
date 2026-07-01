import type { McapTypes } from "@mcap/core";
import type { Type } from "protobufjs";
import { Quaternion, Vector3 } from "three";
import { decodeProtobufMessage } from "../decoders/foxglove/protobuf";
import {
  asRecord,
  optionalRecord,
  optionalString,
  requiredArray,
  requiredNumber,
} from "../decoders/foxglove/protobuf/records";
import { protobufFromBinaryDescriptor } from "../mcap-support";
import { timestampNs } from "../decoders/foxglove/protobuf/timing";
import type { McapIndexedReaderLike } from "../reader";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapFrameTransformSample,
  McapFrameTransformSet,
  McapFrameTransformTopicStats,
} from "../frame-transform-types";
import {
  compareFrameTransformSamplesByTime,
  frameTransformEdgeKey,
} from "../frame-transforms";
import type { McapReadFrameTransformWindowRequest } from "../types";

const PROTOBUF_ENCODING = "protobuf";
const FOXGLOVE_FRAME_TRANSFORMS_SCHEMA = "foxglove.FrameTransforms";

const SUPPORTED_TRANSFORM_SCHEMAS: ReadonlySet<string> = new Set([
  "foxglove.FrameTransform",
  FOXGLOVE_FRAME_TRANSFORMS_SCHEMA,
]);

type FrameTransformSchemaMatch =
  | {
      readonly kind: "single";
    }
  | {
      readonly kind: "batch";
      readonly repeatedFieldName: string;
    };

/**
 * Bootstrap only scans channels that are likely static, and only when they
 * are small. Topic conventions such as `/tf_static` are accepted directly;
 * ambiguous low-count channels are first classified by decoding one transform
 * message. Dynamic channels are left to bounded window reads instead of
 * blocking first playback.
 */
const BOOTSTRAP_CHANNEL_MESSAGE_CAP = 256n;
const STATIC_TRANSFORM_TOPIC_SEGMENTS: ReadonlySet<string> = new Set([
  "static_tf",
  "static_transform",
  "static_transforms",
  "tf_static",
]);

type McapChannel = McapTypes.TypedMcapRecords["Channel"];
type McapSchema = McapTypes.TypedMcapRecords["Schema"];

interface FrameTransformChannel {
  readonly channel: McapChannel;
  readonly match: FrameTransformSchemaMatch;
  readonly messageCount: bigint | undefined;
  readonly schema: McapSchema;
}

interface FrameTransformReadStats {
  encodedPayloadBytes: number;
  messageCount: number;
  topicStats: Map<string, McapFrameTransformTopicStats>;
  topics: readonly string[];
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
    const match = classifyFrameTransformSchema(schema);
    if (!match) {
      continue;
    }
    channels.push({
      channel,
      match,
      messageCount: reader.statistics?.channelMessageCounts.get(channel.id),
      schema,
    });
  }

  return channels;
}

/**
 * Reads eager static frame transforms by schema discovery. A channel is
 * scanned in bootstrap only if it is below the bootstrap cap and either has a
 * known static-transform topic convention or an ambiguous first decoded sample
 * with no timestamp. This keeps bootstrap off broad dynamic transform channels.
 * A sample is emitted as static when the decoded transform message has no
 * `timestamp` (Foxglove convention for "always valid").
 */
export async function readMcapFrameTransformBootstrap(
  reader: McapIndexedReaderLike,
): Promise<McapFrameTransformSet> {
  const bootstrapChannels: FrameTransformChannel[] = [];
  for (const entry of discoverFrameTransformChannels(reader)) {
    if (await shouldBootstrapFrameTransformChannel(reader, entry)) {
      bootstrapChannels.push(entry);
    }
  }
  if (bootstrapChannels.length === 0) {
    return createMcapFrameTransformSet({ samples: [] });
  }
  const channelsById = indexByChannelId(bootstrapChannels);
  const readStats = createFrameTransformReadStats(
    bootstrapChannels.map((entry) => entry.channel.topic),
  );

  const samples: McapFrameTransformSample[] = [];
  for await (const message of reader.readMessages({
    topics: bootstrapChannels.map((entry) => entry.channel.topic),
  })) {
    const entry = channelsById.get(message.channelId);
    if (!entry) {
      continue;
    }
    recordFrameTransformMessage(readStats, entry.channel.topic, message);
    try {
      for (const sample of normalizeFrameTransformMessage({
        channel: entry.channel,
        match: entry.match,
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

  return createMcapFrameTransformSet({ readStats, samples });
}

async function shouldBootstrapFrameTransformChannel(
  reader: McapIndexedReaderLike,
  entry: FrameTransformChannel,
): Promise<boolean> {
  if (
    entry.messageCount !== undefined &&
    entry.messageCount > BOOTSTRAP_CHANNEL_MESSAGE_CAP
  ) {
    return false;
  }
  if (isStaticTransformBootstrapTopic(entry.channel.topic)) {
    return true;
  }

  return firstTransformMessageHasStaticSample(reader, entry);
}

async function firstTransformMessageHasStaticSample(
  reader: McapIndexedReaderLike,
  entry: FrameTransformChannel,
): Promise<boolean> {
  for await (const message of reader.readMessages({
    topics: [entry.channel.topic],
  })) {
    if (message.channelId !== entry.channel.id) {
      continue;
    }
    try {
      return normalizeFrameTransformMessage({
        channel: entry.channel,
        match: entry.match,
        message,
        schema: entry.schema,
      }).some((sample) => sample.timeNs === undefined);
    } catch {
      return false;
    }
  }

  return false;
}

function isStaticTransformBootstrapTopic(topic: string): boolean {
  const segments = topic
    .toLowerCase()
    .split(/[/.:-]+/)
    .filter(Boolean);
  if (
    segments.some((segment) => STATIC_TRANSFORM_TOPIC_SEGMENTS.has(segment))
  ) {
    return true;
  }

  return segments.some((segment, index) => {
    const nextSegment = segments[index + 1];
    return (
      (segment === "tf" && nextSegment === "static") ||
      (segment === "static" &&
        (nextSegment === "tf" ||
          nextSegment === "transform" ||
          nextSegment === "transforms"))
    );
  });
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
  const readStats = createFrameTransformReadStats(
    transformChannels.map((entry) => entry.channel.topic),
  );
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
    recordFrameTransformMessage(readStats, entry.channel.topic, message);
    try {
      for (const sample of normalizeFrameTransformMessage({
        channel: entry.channel,
        match: entry.match,
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

  return createMcapFrameTransformSet({ readStats, samples });
}

function createFrameTransformReadStats(
  topics: readonly string[],
): FrameTransformReadStats {
  return {
    encodedPayloadBytes: 0,
    messageCount: 0,
    topicStats: new Map(),
    topics,
  };
}

function recordFrameTransformMessage(
  stats: FrameTransformReadStats,
  topic: string,
  message: McapTypes.TypedMcapRecords["Message"],
): void {
  stats.encodedPayloadBytes += message.data.byteLength;
  stats.messageCount += 1;
  const topicStats = stats.topicStats.get(topic) ?? {
    encodedPayloadBytes: 0,
    messageCount: 0,
    topic,
  };
  stats.topicStats.set(topic, {
    ...topicStats,
    encodedPayloadBytes:
      topicStats.encodedPayloadBytes + message.data.byteLength,
    messageCount: topicStats.messageCount + 1,
  });
}

function indexByChannelId(entries: readonly FrameTransformChannel[]) {
  return new Map(entries.map((entry) => [entry.channel.id, entry]));
}

function normalizeFrameTransformMessage({
  channel,
  match,
  message,
  schema,
}: {
  readonly channel: McapChannel;
  readonly match: FrameTransformSchemaMatch;
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

  if (match.kind === "batch") {
    return requiredArray(record, match.repeatedFieldName).map((transform) =>
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

function classifyFrameTransformSchema(
  schema: McapSchema,
): FrameTransformSchemaMatch | null {
  if (schema.encoding !== PROTOBUF_ENCODING) {
    return null;
  }

  if (schema.name === FOXGLOVE_FRAME_TRANSFORMS_SCHEMA) {
    return {
      kind: "batch",
      repeatedFieldName: "transforms",
    };
  }
  if (SUPPORTED_TRANSFORM_SCHEMAS.has(schema.name)) {
    return {
      kind: "single",
    };
  }

  try {
    const root = protobufFromBinaryDescriptor(schema.data);
    const type = root.lookupType(schema.name);
    type.resolveAll();
    if (isFrameTransformType(type)) {
      return {
        kind: "single",
      };
    }

    const repeatedTransformField = type.fieldsArray.find(
      (field) =>
        field.repeated &&
        field.resolvedType &&
        isFrameTransformType(field.resolvedType as Type),
    );
    if (repeatedTransformField) {
      return {
        kind: "batch",
        repeatedFieldName: repeatedTransformField.name,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function isFrameTransformType(type: Type): boolean {
  const parentField = fieldByName(type, "parentFrameId", "parent_frame_id");
  const childField = fieldByName(type, "childFrameId", "child_frame_id");
  const translationField = fieldByName(type, "translation");
  const rotationField = fieldByName(type, "rotation");

  return (
    parentField?.type === "string" &&
    childField?.type === "string" &&
    isVector3Type(translationField?.resolvedType as Type | null | undefined) &&
    isQuaternionType(rotationField?.resolvedType as Type | null | undefined)
  );
}

function isVector3Type(type: Type | null | undefined): boolean {
  return Boolean(
    type &&
    numericField(type, "x") &&
    numericField(type, "y") &&
    numericField(type, "z"),
  );
}

function isQuaternionType(type: Type | null | undefined): boolean {
  return Boolean(
    type &&
    numericField(type, "x") &&
    numericField(type, "y") &&
    numericField(type, "z") &&
    numericField(type, "w"),
  );
}

function numericField(type: Type, name: string): boolean {
  const field = fieldByName(type, name);
  return field?.type === "double" || field?.type === "float";
}

function fieldByName(type: Type, ...names: string[]) {
  for (const name of names) {
    const field = type.fields[name];
    if (field) {
      return field;
    }
  }

  return undefined;
}

function createMcapFrameTransformSet({
  readStats,
  samples,
}: {
  readonly readStats?: FrameTransformReadStats;
  readonly samples: readonly McapFrameTransformSample[];
}): McapFrameTransformSet {
  const sortedSamples = [...samples].sort(compareFrameTransformSamples);

  return {
    ...(readStats?.messageCount
      ? {
          encodedPayloadBytes: readStats.encodedPayloadBytes,
          messageCount: readStats.messageCount,
          topicStats: [...readStats.topicStats.values()],
          topics: readStats.topics,
        }
      : {}),
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
