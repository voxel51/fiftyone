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
  readonly match: FrameTransformSchemaMatch;
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

  return createMcapFrameTransformSet({ samples });
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
