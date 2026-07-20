import type { McapTypes } from "@mcap/core";
import { mcapReadCancelledError } from "../errors";
import type { Type } from "protobufjs";
import { Quaternion, Vector3 } from "three";
import { decodeProtobufMessage } from "../decoders/foxglove/protobuf";
import {
  asRecord,
  optionalBigInt,
  optionalRecord,
  optionalString,
  requiredArray,
  requiredNumber,
} from "../decoders/foxglove/protobuf/records";
import {
  rosMessageDefinitionsForChannel,
  rosRecordDecoderForChannel,
  rootRosMessageDefinition,
  type RosMessageDefinition,
} from "../decoders/ros/wire";
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
} from "../frame-transform-wire";
import type { McapReadFrameTransformWindowRequest } from "../types";

const PROTOBUF_ENCODING = "protobuf";
const FOXGLOVE_FRAME_TRANSFORM_CDR_SCHEMA = "foxglove_msgs/msg/FrameTransform";
const FOXGLOVE_FRAME_TRANSFORMS_CDR_SCHEMA =
  "foxglove_msgs/msg/FrameTransforms";
const FOXGLOVE_FRAME_TRANSFORMS_SCHEMA = "foxglove.FrameTransforms";
const TF_MESSAGE_BATCH_FIELD = "transforms";

const SUPPORTED_TRANSFORM_SCHEMAS: ReadonlySet<string> = new Set([
  "foxglove.FrameTransform",
  FOXGLOVE_FRAME_TRANSFORMS_SCHEMA,
]);
const ROS_TF_MESSAGE_SCHEMAS: ReadonlySet<string> = new Set([
  "tf2_msgs/TFMessage",
  "tf2_msgs/msg/TFMessage",
]);
const ROS_TRANSFORM_STAMPED_SCHEMAS: ReadonlySet<string> = new Set([
  "geometry_msgs/TransformStamped",
  "geometry_msgs/msg/TransformStamped",
]);
const FOXGLOVE_CDR_TRANSFORM_SCHEMAS: ReadonlySet<string> = new Set([
  FOXGLOVE_FRAME_TRANSFORM_CDR_SCHEMA,
]);
const FOXGLOVE_CDR_TRANSFORMS_SCHEMAS: ReadonlySet<string> = new Set([
  FOXGLOVE_FRAME_TRANSFORMS_CDR_SCHEMA,
]);

type FrameTransformSchemaMatch =
  | {
      readonly format: "foxglove";
      readonly kind: "single";
    }
  | {
      readonly format: "foxglove" | "ros-tf-message";
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
type McapMessage = McapTypes.TypedMcapRecords["Message"];
type McapSchema = McapTypes.TypedMcapRecords["Schema"];

interface FrameTransformChannel {
  readonly channel: McapChannel;
  readonly decodeRecord: (message: McapMessage) => Record<string, unknown>;
  readonly match: FrameTransformSchemaMatch;
  readonly messageCount: bigint | undefined;
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
 * Foxglove frame transform schema or a ROS tf2_msgs/TFMessage schema and both
 * channel and schema encodings are decodable today.
 */
function discoverFrameTransformChannels(
  reader: McapIndexedReaderLike,
): readonly FrameTransformChannel[] {
  const channels: FrameTransformChannel[] = [];
  for (const channel of reader.channelsById.values()) {
    const schema = reader.schemasById.get(channel.schemaId);
    if (!schema) {
      continue;
    }
    const decoder = frameTransformDecoderForChannel(reader, channel, schema);
    if (!decoder) {
      continue;
    }
    channels.push({
      channel,
      ...decoder,
      messageCount: reader.statistics?.channelMessageCounts.get(channel.id),
    });
  }

  return channels;
}

function frameTransformDecoderForChannel(
  reader: McapIndexedReaderLike,
  channel: McapChannel,
  schema: McapSchema,
): Pick<FrameTransformChannel, "decodeRecord" | "match"> | null {
  if (
    channel.messageEncoding === PROTOBUF_ENCODING &&
    schema.encoding === PROTOBUF_ENCODING
  ) {
    const match = classifyProtobufFrameTransformSchema(schema);
    if (!match) {
      return null;
    }

    return {
      decodeRecord: (message) =>
        decodeProtobufMessage(
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
        ),
      match,
    };
  }

  const match = classifyRosFrameTransformSchema(reader, channel, schema);
  if (!match) {
    return null;
  }
  const decodeRosRecord = rosRecordDecoderForChannel(reader, channel);
  if (!decodeRosRecord) {
    return null;
  }

  return {
    decodeRecord: (message) => decodeRosRecord(message.data),
    match,
  };
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
        entry,
        message,
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
        entry,
        message,
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
  readSignal,
  request,
  timeline,
}: {
  readonly reader: McapIndexedReaderLike;
  readonly readSignal?: { readonly current: AbortSignal | null };
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

  const transformTopics = transformChannels.map((entry) => entry.channel.topic);
  // Transform payloads are tiny but interleaved into mixed chunks, so the
  // serial read loop below otherwise pays one round trip per chunk touch on
  // remote transports. Racing reads coalesce on shared byte-cache fill keys.
  void reader.prefetchWindow?.({
    endTimeNs: endTime,
    startTimeNs: startTime,
    topics: transformTopics,
  });

  const samples: McapFrameTransformSample[] = [];
  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics: transformTopics,
  })) {
    if (readSignal?.current?.aborted) {
      throw mcapReadCancelledError();
    }
    const entry = channelsById.get(message.channelId);
    if (!entry) {
      continue;
    }
    recordFrameTransformMessage(readStats, entry.channel.topic, message);
    try {
      for (const sample of normalizeFrameTransformMessage({
        entry,
        message,
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
  entry,
  message,
}: {
  readonly entry: FrameTransformChannel;
  readonly message: McapMessage;
}): readonly McapFrameTransformSample[] {
  const record = entry.decodeRecord(message);
  const staticTopic = isStaticTransformBootstrapTopic(entry.channel.topic);

  if (entry.match.kind === "batch") {
    return requiredArray(record, entry.match.repeatedFieldName).map(
      (transform) =>
        normalizeFrameTransformRecord(asRecord(transform), {
          format: entry.match.format,
          staticTopic,
        }),
    );
  }

  return [
    normalizeFrameTransformRecord(record, {
      format: entry.match.format,
      staticTopic,
    }),
  ];
}

function normalizeFrameTransformRecord(
  record: Record<string, unknown>,
  {
    format,
    staticTopic,
  }: {
    readonly format: FrameTransformSchemaMatch["format"];
    readonly staticTopic: boolean;
  },
): McapFrameTransformSample {
  if (format === "ros-tf-message") {
    return normalizeRosTransformStampedRecord(record, staticTopic);
  }

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

function normalizeRosTransformStampedRecord(
  record: Record<string, unknown>,
  staticTopic: boolean,
): McapFrameTransformSample {
  const header = optionalRecord(record, "header");
  const transform = optionalRecord(record, "transform");
  const parentFrameId = header
    ? optionalString(header, "frame_id", "frameId")
    : undefined;
  const childFrameId = optionalString(record, "child_frame_id", "childFrameId");
  const translation = transform
    ? optionalRecord(transform, "translation")
    : undefined;
  const rotation = transform
    ? optionalRecord(transform, "rotation")
    : undefined;
  const transformTimeNs = staticTopic
    ? undefined
    : rosTimestampNs(header ? optionalRecord(header, "stamp") : undefined);

  if (!parentFrameId) {
    throw new Error("TransformStamped header.frame_id is missing");
  }
  if (!childFrameId) {
    throw new Error("TransformStamped child_frame_id is missing");
  }
  if (!translation) {
    throw new Error("TransformStamped translation is missing");
  }
  if (!rotation) {
    throw new Error("TransformStamped rotation is missing");
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

function rosTimestampNs(timestamp: Record<string, unknown> | undefined) {
  if (!timestamp) {
    return undefined;
  }

  const seconds =
    optionalBigInt(timestamp, "sec") ??
    optionalBigInt(timestamp, "seconds") ??
    0n;
  const nanos =
    optionalBigInt(timestamp, "nsec") ??
    optionalBigInt(timestamp, "nanosec") ??
    optionalBigInt(timestamp, "nanos") ??
    0n;

  return seconds * 1_000_000_000n + nanos;
}

function classifyProtobufFrameTransformSchema(
  schema: McapSchema,
): FrameTransformSchemaMatch | null {
  if (schema.encoding !== PROTOBUF_ENCODING) {
    return null;
  }

  if (schema.name === FOXGLOVE_FRAME_TRANSFORMS_SCHEMA) {
    return {
      format: "foxglove",
      kind: "batch",
      repeatedFieldName: "transforms",
    };
  }
  if (SUPPORTED_TRANSFORM_SCHEMAS.has(schema.name)) {
    return {
      format: "foxglove",
      kind: "single",
    };
  }

  try {
    const root = protobufFromBinaryDescriptor(schema.data);
    const type = root.lookupType(schema.name);
    type.resolveAll();
    if (isFrameTransformType(type)) {
      return {
        format: "foxglove",
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
        format: "foxglove",
        kind: "batch",
        repeatedFieldName: repeatedTransformField.name,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function classifyRosFrameTransformSchema(
  reader: McapIndexedReaderLike,
  channel: McapChannel,
  schema: McapSchema,
): FrameTransformSchemaMatch | null {
  const definitions = rosMessageDefinitionsForChannel(reader, channel);
  const root = definitions ? rootRosMessageDefinition(definitions) : undefined;
  if (!root) {
    return null;
  }

  if (isFoxgloveCdrFrameTransformSchema(schema, root)) {
    return {
      format: "foxglove",
      kind: "single",
    };
  }

  if (isFoxgloveCdrFrameTransformsSchema(schema, root)) {
    return {
      format: "foxglove",
      kind: "batch",
      repeatedFieldName: "transforms",
    };
  }

  if (!isRosTfMessageSchema(schema, root)) {
    return null;
  }

  const transformsField = root.definitions.find(
    (field) => field.name === TF_MESSAGE_BATCH_FIELD,
  );
  if (
    !transformsField?.isArray ||
    !transformsField.isComplex ||
    !ROS_TRANSFORM_STAMPED_SCHEMAS.has(transformsField.type)
  ) {
    return null;
  }

  return {
    format: "ros-tf-message",
    kind: "batch",
    repeatedFieldName: TF_MESSAGE_BATCH_FIELD,
  };
}

function isRosTfMessageSchema(
  schema: McapSchema,
  definition: RosMessageDefinition,
): boolean {
  return (
    ROS_TF_MESSAGE_SCHEMAS.has(schema.name) ||
    (definition.name !== undefined &&
      ROS_TF_MESSAGE_SCHEMAS.has(definition.name))
  );
}

function isFoxgloveCdrFrameTransformSchema(
  schema: McapSchema,
  definition: RosMessageDefinition,
): boolean {
  return (
    FOXGLOVE_CDR_TRANSFORM_SCHEMAS.has(schema.name) ||
    (definition.name !== undefined &&
      FOXGLOVE_CDR_TRANSFORM_SCHEMAS.has(definition.name))
  );
}

function isFoxgloveCdrFrameTransformsSchema(
  schema: McapSchema,
  definition: RosMessageDefinition,
): boolean {
  return (
    FOXGLOVE_CDR_TRANSFORMS_SCHEMAS.has(schema.name) ||
    (definition.name !== undefined &&
      FOXGLOVE_CDR_TRANSFORMS_SCHEMAS.has(definition.name))
  );
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
