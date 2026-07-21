import { Enum, Type } from "protobufjs";
import {
  isRosMessageEncoding,
  rosMessageDefinitionsForChannel,
  rootRosMessageDefinition,
  type RosMessageDefinition,
} from "../decoders/ros/wire";
import { protobufFromBinaryDescriptor } from "../shared/mcap-support";
import type { McapIndexedReaderLike } from "../reader";
import type {
  McapEnumerateNumericFieldsRequest,
  McapNumericFieldDescriptor,
  McapNumericFieldAvailability,
  McapTopicNumericFields,
} from "../shared/types";
import { genericRecordDecoderForChannel } from "./generic-record-decoder";
import { DEFAULT_RAW_PRUNE_BUDGETS } from "./raw-record-prune";

/**
 * Nested-message depth cap for schema walks. Telemetry payloads are
 * shallow; anything deeper is almost certainly a recursive or
 * pathological schema.
 */
const MAX_FIELD_DEPTH = 6;

/**
 * A few messages are enough to discover ordinary telemetry arrays without
 * making field enumeration scan each topic.
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
  hasArrays: boolean;
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

/**
 * Enumerates numeric leaf field paths of a protobufjs message type in
 * declaration order. Repeated fields have no schema-level length, so this
 * walk leaves them for bounded message sampling during topic enumeration.
 * Map fields remain unsupported. Nested messages recurse up to
 * `MAX_FIELD_DEPTH` with a cycle guard for self-referential schemas.
 */
export function walkProtobufNumericFields(
  type: Type,
): readonly McapNumericFieldDescriptor[] {
  return protobufNumericFields(type).fields;
}

/**
 * Enumerates numeric leaf field paths of parsed ROS message definitions.
 * Arrays are left for bounded message sampling during topic enumeration;
 * nested complex fields recurse up to `MAX_FIELD_DEPTH` with a cycle guard.
 */
export function walkRosNumericFields(
  definitions: readonly RosMessageDefinition[],
): readonly McapNumericFieldDescriptor[] {
  return rosNumericFields(definitions).fields;
}

function rosNumericFields(
  definitions: readonly RosMessageDefinition[],
): NumericFieldWalkResult {
  const root = rootRosMessageDefinition(definitions);
  if (!root) {
    return { fields: [], hasArrays: false };
  }
  const definitionsByName = new Map(
    definitions
      .filter((definition) => definition.name)
      .map((definition) => [definition.name ?? "", definition] as const),
  );
  const result: NumericFieldWalkResult = { fields: [], hasArrays: false };
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
      result.hasArrays = true;
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
      continue;
    }
    if (field.repeated) {
      result.hasArrays = true;
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
  const result: NumericFieldWalkResult = { fields: [], hasArrays: false };
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
 * parsed message definitions. Schemas containing arrays additionally sample
 * a few decoded messages to discover bounded indexed paths; JSON channels do
 * the same because they carry no walkable schema. Other encodings return an
 * explicit unsupported-encoding entry. Never throws per topic; schema parse
 * or sampling failures degrade gracefully so one bad channel cannot hide the
 * rest.
 */
export async function enumerateMcapNumericFields(
  reader: McapIndexedReaderLike,
  request?: Pick<McapEnumerateNumericFieldsRequest, "topics">,
): Promise<readonly McapTopicNumericFields[]> {
  const requestedTopics = request?.topics && new Set(request.topics);
  const channelsByTopic = new Map<
    string,
    { readonly messageEncoding: string; readonly schemaId: number }
  >();
  for (const channel of reader.channelsById.values()) {
    if (requestedTopics && !requestedTopics.has(channel.topic)) {
      continue;
    }
    if (!channelsByTopic.has(channel.topic)) {
      channelsByTopic.set(channel.topic, channel);
    }
  }

  const results: McapTopicNumericFields[] = [];
  for (const [topic, channel] of channelsByTopic) {
    const schema = reader.schemasById.get(channel.schemaId);
    if (
      channel.messageEncoding === "protobuf" &&
      schema?.encoding === "protobuf" &&
      schema.name &&
      schema.data.byteLength > 0
    ) {
      const schemaFields = protobufFieldsForSchema(schema.data, schema.name);
      const sampledFields = schemaFields.hasArrays
        ? await sampleNumericFieldsForTopic(reader, topic, channel)
        : [];
      const fields = mergeNumericFields(schemaFields.fields, sampledFields);
      results.push({
        availability:
          schemaFields.availability === "schema-unavailable"
            ? schemaFields.availability
            : availabilityForFields(fields),
        encoding: "protobuf",
        fields,
        ...(schemaFields.hasArrays ? { sampled: true } : {}),
        topic,
      });
      continue;
    }
    if (channel.messageEncoding === "protobuf") {
      results.push({
        availability: "schema-unavailable",
        encoding: "protobuf",
        fields: [],
        topic,
      });
      continue;
    }

    if (channel.messageEncoding === "json") {
      const fields = await sampleNumericFieldsForTopic(reader, topic, channel);
      results.push({
        availability: availabilityForFields(fields),
        encoding: "json",
        fields,
        sampled: true,
        topic,
      });
      continue;
    }

    if (isRosMessageEncoding(channel.messageEncoding)) {
      const schemaFields = rosFieldsForChannel(reader, channel);
      const sampledFields = schemaFields.hasArrays
        ? await sampleNumericFieldsForTopic(reader, topic, channel)
        : [];
      const fields = mergeNumericFields(schemaFields.fields, sampledFields);
      results.push({
        availability:
          schemaFields.availability === "schema-unavailable"
            ? schemaFields.availability
            : availabilityForFields(fields),
        encoding: channel.messageEncoding,
        fields,
        ...(schemaFields.hasArrays ? { sampled: true } : {}),
        topic,
      });
      continue;
    }

    results.push({
      availability: "unsupported-encoding",
      encoding: "unsupported",
      fields: [],
      topic,
    });
  }

  return results.sort((a, b) => a.topic.localeCompare(b.topic));
}

function rosFieldsForChannel(
  reader: McapIndexedReaderLike,
  channel: { readonly messageEncoding: string; readonly schemaId: number },
): {
  readonly availability: McapNumericFieldAvailability;
  readonly fields: readonly McapNumericFieldDescriptor[];
  readonly hasArrays: boolean;
} {
  try {
    const definitions = rosMessageDefinitionsForChannel(reader, channel);
    if (!definitions) {
      return {
        availability: "schema-unavailable",
        fields: [],
        hasArrays: false,
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
      hasArrays: false,
    };
  }
}

function protobufFieldsForSchema(
  schemaData: Uint8Array,
  schemaName: string,
): {
  readonly availability: McapNumericFieldAvailability;
  readonly fields: readonly McapNumericFieldDescriptor[];
  readonly hasArrays: boolean;
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
      hasArrays: false,
    };
  }
}

function availabilityForFields(
  fields: readonly McapNumericFieldDescriptor[],
): McapNumericFieldAvailability {
  return fields.length > 0 ? "ready" : "no-numeric-fields";
}

async function sampleNumericFieldsForTopic(
  reader: McapIndexedReaderLike,
  topic: string,
  channel: { readonly messageEncoding: string; readonly schemaId: number },
): Promise<readonly McapNumericFieldDescriptor[]> {
  const decodeRecord = genericRecordDecoderForChannel(reader, channel);
  if (!decodeRecord) {
    return [];
  }

  const samples: Record<string, unknown>[] = [];
  try {
    for await (const message of reader.readMessages({ topics: [topic] })) {
      try {
        samples.push(decodeRecord(message.data));
      } catch {
        // Malformed sample — keep scanning up to the sample limit.
      }
      if (samples.length >= FIELD_SAMPLE_MESSAGE_LIMIT) {
        break;
      }
    }
  } catch {
    // Read failure degrades to whatever samples were collected.
  }
  return numericFieldsFromSamples(samples);
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
    return value;
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
