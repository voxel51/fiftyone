import { Enum, Type } from "protobufjs";
import {
  isRosMessageEncoding,
  rosMessageDefinitionsForChannel,
  rootRosMessageDefinition,
  type RosMessageDefinition,
} from "../message-decoders/ros/wire";
import { protobufFromBinaryDescriptor } from "../compatibility/mcap-support";
import {
  materializeIndexedEntries,
  type McapChannel,
  type McapChunkIndex,
  type McapIndexedMessageTime,
  type McapIndexedReaderLike,
} from "../reader/index";
import type {
  McapEnumerateNumericFieldsRequest,
  McapNumericFieldDescriptor,
  McapNumericFieldAvailability,
  McapTopicNumericFields,
} from "../contracts/index";
import { genericRecordDecoderForChannel } from "./generic-record-decoder";
import { DEFAULT_RAW_PRUNE_BUDGETS } from "./raw-record-prune";

/**
 * Nested-message depth cap for schema walks. Telemetry payloads are
 * shallow; anything deeper is almost certainly a recursive or
 * pathological schema.
 */
const MAX_FIELD_DEPTH = 6;

/**
 * A few messages from one selected indexed chunk are enough to discover
 * ordinary telemetry arrays without making field enumeration scan a source.
 */
const FIELD_SAMPLE_MESSAGE_LIMIT = 3;

/**
 * Keep sampled indexed fields aligned with the raw inspector's array
 * preview. Large sensor buffers must not turn into thousands of plot
 * toggles, while ordinary vectors, matrices, and joint arrays fit whole.
 */
const SAMPLED_ARRAY_ELEMENT_LIMIT = DEFAULT_RAW_PRUNE_BUDGETS.maxArrayLength;

interface NumericFieldWalkResult {
  readonly fields: McapNumericFieldDescriptor[];
  needsSampling: boolean;
}

type NumericChannel = Pick<McapChannel, "id" | "messageEncoding" | "schemaId">;

interface NumericTopicPlan {
  readonly channel: NumericChannel;
  readonly encoding: McapTopicNumericFields["encoding"];
  readonly needsSampling: boolean;
  readonly schemaAvailability: McapNumericFieldAvailability;
  readonly schemaFields: readonly McapNumericFieldDescriptor[];
  readonly topic: string;
}

const PROTOBUF_NUMERIC_SCALAR_TYPES: ReadonlySet<string> = new Set([
  "double",
  "float",
  "int32",
  "uint32",
  "sint32",
  "fixed32",
  "sfixed32",
  "int64",
  "uint64",
  "sint64",
  "fixed64",
  "sfixed64",
  "bool",
]);

const ROS_NUMERIC_SCALAR_TYPES: ReadonlySet<string> = new Set([
  "byte",
  "char",
  "bool",
  "boolean",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float32",
  "float64",
  "float",
  "double",
]);

function rosNumericFields(
  definitions: readonly RosMessageDefinition[],
): NumericFieldWalkResult {
  const root = rootRosMessageDefinition(definitions);
  if (!root) {
    return { fields: [], needsSampling: false };
  }
  const definitionsByName = new Map(
    definitions
      .filter((definition) => definition.name)
      .map((definition) => [definition.name ?? "", definition] as const),
  );
  const result: NumericFieldWalkResult = { fields: [], needsSampling: false };
  const visited = new Set(root.name ? [root.name] : []);
  walkRosDefinition(root, definitionsByName, "", visited, result);
  return result;
}

function walkRosDefinition(
  definition: RosMessageDefinition,
  definitionsByName: ReadonlyMap<string, RosMessageDefinition>,
  prefix: string,
  visited: Set<string>,
  result: NumericFieldWalkResult,
): void {
  if (visited.size > MAX_FIELD_DEPTH) {
    return;
  }

  for (const field of definition.definitions) {
    if (field.isConstant) {
      continue;
    }
    if (field.isArray) {
      result.needsSampling = true;
      continue;
    }

    const path = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.enumType) {
      result.fields.push({ path, valueType: "enum" });
      continue;
    }

    if (field.isComplex) {
      const nested = definitionsByName.get(field.type);
      if (!nested || visited.has(field.type)) {
        continue;
      }
      visited.add(field.type);
      walkRosDefinition(nested, definitionsByName, path, visited, result);
      visited.delete(field.type);
      continue;
    }

    if (ROS_NUMERIC_SCALAR_TYPES.has(field.type)) {
      result.fields.push({ path, valueType: field.type });
    }
  }
}

function walkProtobufType(
  type: Type,
  prefix: string,
  visited: Set<string>,
  result: NumericFieldWalkResult,
): void {
  if (visited.size > MAX_FIELD_DEPTH) {
    return;
  }

  for (const field of type.fieldsArray) {
    field.resolve();
    if (field.map) {
      result.needsSampling = true;
      continue;
    }
    if (field.repeated) {
      result.needsSampling = true;
      continue;
    }

    const path = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.resolvedType instanceof Enum) {
      result.fields.push({ path, valueType: "enum" });
      continue;
    }

    if (field.resolvedType instanceof Type) {
      if (visited.has(field.resolvedType.fullName)) {
        continue;
      }
      visited.add(field.resolvedType.fullName);
      walkProtobufType(field.resolvedType, path, visited, result);
      visited.delete(field.resolvedType.fullName);
      continue;
    }

    if (PROTOBUF_NUMERIC_SCALAR_TYPES.has(field.type)) {
      result.fields.push({ path, valueType: field.type });
    }
  }
}

function protobufNumericFields(type: Type): NumericFieldWalkResult {
  const result: NumericFieldWalkResult = { fields: [], needsSampling: false };
  walkProtobufType(type, "", new Set([type.fullName]), result);
  return result;
}

/**
 * Collects numeric leaf field paths from sampled message records. Arrays are
 * addressed by dotted indexes (`position.0`) and bounded to the same first 50
 * elements shown by the raw-message inspector. The union across samples is
 * returned in first-seen order.
 */
export function numericFieldsFromSamples(
  samples: readonly Record<string, unknown>[],
): readonly McapNumericFieldDescriptor[] {
  const byPath = new Map<string, McapNumericFieldDescriptor>();
  for (const sample of samples) {
    walkSampleValue(sample, "", 0, byPath);
  }
  return [...byPath.values()];
}

function walkSampleValue(
  value: unknown,
  prefix: string,
  depth: number,
  out: Map<string, McapNumericFieldDescriptor>,
): void {
  const valueType = sampledNumericValueType(value);
  if (prefix && valueType) {
    if (!out.has(prefix)) {
      out.set(prefix, { path: prefix, valueType });
    }
    return;
  }

  if (valueType) {
    return;
  }

  if (value === null || typeof value !== "object" || depth >= MAX_FIELD_DEPTH) {
    return;
  }

  const array = sampledArray(value);
  if (array) {
    const keep = Math.min(array.length, SAMPLED_ARRAY_ELEMENT_LIMIT);
    for (let index = 0; index < keep; index += 1) {
      const path = prefix ? `${prefix}.${index}` : String(index);
      walkSampleValue(array[index], path, depth + 1, out);
    }
    return;
  }

  if (ArrayBuffer.isView(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    walkSampleValue(child, path, depth + 1, out);
  }
}

/**
 * Enumerates plottable numeric fields for every requested topic.
 * Protobuf channels walk their binary descriptor and ROS channels walk their
 * parsed message definitions without touching message data. Schemas
 * containing dynamic paths and JSON channels fall back to at most three
 * messages from one indexed chunk per dynamic channel. Shared chunks are
 * deduplicated. Other encodings return an explicit unsupported-encoding entry.
 * Never throws per topic; schema parse or bounded sampling failures degrade
 * gracefully so one bad channel cannot hide the rest.
 */
export async function enumerateMcapNumericFields(
  reader: McapIndexedReaderLike,
  request?: Pick<
    McapEnumerateNumericFieldsRequest,
    "includeDataFallback" | "sampleTimeNs" | "topics"
  >,
): Promise<readonly McapTopicNumericFields[]> {
  const requestedTopics = request?.topics && new Set(request.topics);
  const channelsByTopic = new Map<string, NumericChannel[]>();
  for (const channel of reader.channelsById.values()) {
    if (requestedTopics && !requestedTopics.has(channel.topic)) {
      continue;
    }
    const channels = channelsByTopic.get(channel.topic) ?? [];
    channels.push(channel);
    channelsByTopic.set(channel.topic, channels);
  }

  const plans: NumericTopicPlan[] = [];
  for (const [topic, channels] of channelsByTopic) {
    for (const channel of channels.sort((left, right) => left.id - right.id)) {
      plans.push(numericTopicPlan(reader, topic, channel));
    }
  }

  const sampledFieldsByTopic =
    request?.includeDataFallback === false
      ? new Map<string, readonly McapNumericFieldDescriptor[]>()
      : await sampleNumericFieldsForTopics(
          reader,
          plans.filter((plan) => plan.needsSampling),
          request?.sampleTimeNs,
        );
  const results: McapTopicNumericFields[] = [];
  for (const [topic] of channelsByTopic) {
    const topicPlans = plans.filter((plan) => plan.topic === topic);
    const fields = mergeNumericFields(
      topicPlans.flatMap((plan) => plan.schemaFields),
      sampledFieldsByTopic.get(topic) ?? [],
    );
    results.push({
      availability: aggregateAvailability(topicPlans, fields),
      encoding: aggregateEncoding(topicPlans),
      fields,
      ...(topicPlans.some((plan) => plan.needsSampling)
        ? { sampled: true }
        : {}),
      topic,
    });
  }

  return results.sort((a, b) => a.topic.localeCompare(b.topic));
}

function numericTopicPlan(
  reader: McapIndexedReaderLike,
  topic: string,
  channel: NumericChannel,
): NumericTopicPlan {
  const schema = reader.schemasById.get(channel.schemaId);
  if (
    channel.messageEncoding === "protobuf" &&
    schema?.encoding === "protobuf" &&
    schema.name &&
    schema.data.byteLength > 0
  ) {
    const schemaFields = protobufFieldsForSchema(schema.data, schema.name);
    return {
      channel,
      encoding: "protobuf",
      needsSampling: schemaFields.needsSampling,
      schemaAvailability: schemaFields.availability,
      schemaFields: schemaFields.fields,
      topic,
    };
  }
  if (channel.messageEncoding === "protobuf") {
    return {
      channel,
      encoding: "protobuf",
      needsSampling: false,
      schemaAvailability: "schema-unavailable",
      schemaFields: [],
      topic,
    };
  }
  if (channel.messageEncoding === "json") {
    return {
      channel,
      encoding: "json",
      needsSampling: true,
      schemaAvailability: "no-numeric-fields",
      schemaFields: [],
      topic,
    };
  }
  if (isRosMessageEncoding(channel.messageEncoding)) {
    const schemaFields = rosFieldsForChannel(reader, channel);
    return {
      channel,
      encoding: channel.messageEncoding,
      needsSampling: schemaFields.needsSampling,
      schemaAvailability: schemaFields.availability,
      schemaFields: schemaFields.fields,
      topic,
    };
  }
  return {
    channel,
    encoding: "unsupported",
    needsSampling: false,
    schemaAvailability: "unsupported-encoding",
    schemaFields: [],
    topic,
  };
}

function aggregateAvailability(
  plans: readonly NumericTopicPlan[],
  fields: readonly McapNumericFieldDescriptor[],
): McapNumericFieldAvailability {
  if (fields.length > 0) return "ready";
  if (plans.some((plan) => plan.schemaAvailability === "schema-unavailable")) {
    return "schema-unavailable";
  }
  if (
    plans.some((plan) => plan.schemaAvailability === "unsupported-encoding")
  ) {
    return "unsupported-encoding";
  }
  return "no-numeric-fields";
}

function aggregateEncoding(
  plans: readonly NumericTopicPlan[],
): McapTopicNumericFields["encoding"] {
  const encodings = new Set(plans.map((plan) => plan.encoding));
  return encodings.size === 1 ? (plans[0]?.encoding ?? "unsupported") : "mixed";
}

function rosFieldsForChannel(
  reader: McapIndexedReaderLike,
  channel: { readonly messageEncoding: string; readonly schemaId: number },
): {
  readonly availability: McapNumericFieldAvailability;
  readonly fields: readonly McapNumericFieldDescriptor[];
  readonly needsSampling: boolean;
} {
  try {
    const definitions = rosMessageDefinitionsForChannel(reader, channel);
    if (!definitions) {
      return {
        availability: "schema-unavailable",
        fields: [],
        needsSampling: false,
      };
    }
    const result = rosNumericFields(definitions);
    return {
      availability: availabilityForFields(result.fields),
      ...result,
    };
  } catch {
    return {
      availability: "schema-unavailable",
      fields: [],
      needsSampling: false,
    };
  }
}

function protobufFieldsForSchema(
  schemaData: Uint8Array,
  schemaName: string,
): {
  readonly availability: McapNumericFieldAvailability;
  readonly fields: readonly McapNumericFieldDescriptor[];
  readonly needsSampling: boolean;
} {
  try {
    const root = protobufFromBinaryDescriptor(schemaData);
    const type = root.lookupType(schemaName);
    const result = protobufNumericFields(type);
    return {
      availability: availabilityForFields(result.fields),
      ...result,
    };
  } catch {
    // Unparseable descriptor — list the topic without fields rather
    // than failing the whole enumeration.
    return {
      availability: "schema-unavailable",
      fields: [],
      needsSampling: false,
    };
  }
}

function availabilityForFields(
  fields: readonly McapNumericFieldDescriptor[],
): McapNumericFieldAvailability {
  return fields.length > 0 ? "ready" : "no-numeric-fields";
}

async function sampleNumericFieldsForTopics(
  reader: McapIndexedReaderLike,
  plans: readonly NumericTopicPlan[],
  sampleTimeNs?: bigint,
): Promise<ReadonlyMap<string, readonly McapNumericFieldDescriptor[]>> {
  if (!reader.readIndexedMessageTimes || !reader.readIndexedMessages) {
    return new Map();
  }

  const decodersByChannelId = new Map(
    plans.flatMap((plan) => {
      const decoder = genericRecordDecoderForChannel(reader, plan.channel);
      return decoder ? [[plan.channel.id, decoder] as const] : [];
    }),
  );
  const decodablePlans = plans.filter((plan) =>
    decodersByChannelId.has(plan.channel.id),
  );
  const chunks = new Map<bigint, McapChunkIndex>();
  for (const plan of decodablePlans) {
    const chunk = selectSampleChunk(reader, [plan.channel], sampleTimeNs);
    if (chunk) chunks.set(chunk.chunkStartOffset, chunk);
  }
  if (chunks.size === 0 || decodablePlans.length === 0) {
    return new Map();
  }

  const sampleCounts = new Map<number, number>(
    decodablePlans.map((plan) => [plan.channel.id, 0]),
  );
  const saturatedChannels = new Set<number>();
  const entries: McapIndexedMessageTime[] = [];
  try {
    for (const chunk of chunks.values()) {
      const topics = [
        ...new Set(
          decodablePlans
            .filter((plan) => chunk.messageIndexOffsets.has(plan.channel.id))
            .map((plan) => plan.topic),
        ),
      ];
      for await (const entry of reader.readIndexedMessageTimes({
        chunkStartOffsets: [chunk.chunkStartOffset],
        topics,
      })) {
        const count = sampleCounts.get(entry.channelId);
        if (count === undefined || count >= FIELD_SAMPLE_MESSAGE_LIMIT) {
          continue;
        }
        entries.push(entry);
        const nextCount = count + 1;
        sampleCounts.set(entry.channelId, nextCount);
        if (nextCount === FIELD_SAMPLE_MESSAGE_LIMIT) {
          saturatedChannels.add(entry.channelId);
        }
      }
      if (saturatedChannels.size === sampleCounts.size) break;
    }
  } catch {
    return new Map();
  }
  if (entries.length === 0) {
    return new Map();
  }

  const samplesByTopic = new Map<string, Record<string, unknown>[]>();
  try {
    const messages = await materializeIndexedEntries(reader, entries);
    for (const [index, message] of messages.entries()) {
      const entry = entries[index];
      const decoder = entry && decodersByChannelId.get(entry.channelId);
      if (!entry || !decoder) {
        continue;
      }
      try {
        const samples = samplesByTopic.get(entry.topic) ?? [];
        samples.push(decoder(message.data));
        samplesByTopic.set(entry.topic, samples);
      } catch {
        // Malformed sample — keep the other messages from the same chunk.
      }
    }
  } catch {
    // Read failure degrades to no sampled fields.
  }
  return new Map(
    [...samplesByTopic].map(([topic, samples]) => [
      topic,
      numericFieldsFromSamples(samples),
    ]),
  );
}

/**
 * Chooses one fallback chunk for a set of channels without racing duplicate
 * reads. Callers use one selection per dynamic channel and deduplicate shared
 * chunks, so every schema/channel can contribute while physical work remains
 * explicitly bounded.
 */
function selectSampleChunk(
  reader: McapIndexedReaderLike,
  channels: readonly Pick<NumericChannel, "id">[],
  sampleTimeNs?: bigint,
): McapChunkIndex | undefined {
  const channelIds = new Set(channels.map((channel) => channel.id));
  if (channelIds.size === 0) {
    return undefined;
  }
  const chunks = reader.chunkIndexes
    .filter((chunk: McapChunkIndex) => {
      for (const channelId of channelIds) {
        if (chunk.messageIndexOffsets.has(channelId)) {
          return true;
        }
      }
      return false;
    })
    .sort((left: McapChunkIndex, right: McapChunkIndex) => {
      if (left.messageStartTime !== right.messageStartTime) {
        return left.messageStartTime < right.messageStartTime ? -1 : 1;
      }
      return left.chunkStartOffset < right.chunkStartOffset ? -1 : 1;
    });
  const first = chunks[0];
  if (!first || sampleTimeNs === undefined) {
    return first;
  }

  const nearest = chunks.reduce(
    (best: McapChunkIndex, candidate: McapChunkIndex) =>
      distanceToChunk(candidate, sampleTimeNs) <
      distanceToChunk(best, sampleTimeNs)
        ? candidate
        : best,
  );
  if (nearest.chunkStartOffset === first.chunkStartOffset) {
    return first;
  }
  return nearest.chunkLength <= first.chunkLength ? nearest : first;
}

function distanceToChunk(chunk: McapChunkIndex, timeNs: bigint): bigint {
  if (timeNs < chunk.messageStartTime) {
    return chunk.messageStartTime - timeNs;
  }
  if (timeNs > chunk.messageEndTime) {
    return timeNs - chunk.messageEndTime;
  }
  return 0n;
}

function mergeNumericFields(
  schemaFields: readonly McapNumericFieldDescriptor[],
  sampledFields: readonly McapNumericFieldDescriptor[],
): readonly McapNumericFieldDescriptor[] {
  const byPath = new Map(
    schemaFields.map((field) => [field.path, field] as const),
  );
  for (const field of sampledFields) {
    if (!byPath.has(field.path)) {
      byPath.set(field.path, field);
    }
  }
  return [...byPath.values()];
}

function sampledNumericValueType(value: unknown): string | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? "number" : undefined;
  }
  if (typeof value === "boolean") {
    return "bool";
  }
  if (typeof value === "bigint") {
    return "bigint";
  }
  if (
    value !== null &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { readonly toNumber?: unknown }).toNumber === "function"
  ) {
    return "int64";
  }
  return undefined;
}

function sampledArray(
  value: object,
): { readonly [index: number]: unknown; readonly length: number } | undefined {
  if (Array.isArray(value)) {
    return value as unknown as {
      readonly [index: number]: unknown;
      readonly length: number;
    };
  }
  if (
    ArrayBuffer.isView(value) &&
    !(value instanceof DataView) &&
    !(value instanceof Uint8Array) &&
    "length" in value &&
    typeof value.length === "number"
  ) {
    return value as unknown as {
      readonly length: number;
      readonly [index: number]: unknown;
    };
  }
  return undefined;
}
