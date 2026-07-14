import { Enum, Type } from "protobufjs";
import { decodeJsonRecord } from "../decoders/json/decode";
import {
  isRosMessageEncoding,
  rosMessageDefinitionsForChannel,
  rootRosMessageDefinition,
  type RosMessageDefinition,
} from "../decoders/ros/wire";
import { protobufFromBinaryDescriptor } from "../mcap-support";
import type { McapIndexedReaderLike } from "../reader";
import type {
  McapEnumerateNumericFieldsRequest,
  McapNumericFieldDescriptor,
  McapNumericFieldAvailability,
  McapTopicNumericFields,
} from "../types";

/**
 * Nested-message depth cap for schema walks. Telemetry payloads are
 * shallow; anything deeper is almost certainly a recursive or
 * pathological schema.
 */
const MAX_FIELD_DEPTH = 6;

/**
 * JSON channels carry no walkable schema, so fields come from decoding
 * a handful of messages. Sampling more only helps schemas whose fields
 * appear late, which the `sampled` flag already discloses.
 */
const JSON_SAMPLE_MESSAGE_LIMIT = 3;

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
 * declaration order. Repeated and map fields are skipped because plots use
 * scalar series; nested messages recurse up to `MAX_FIELD_DEPTH` with a
 * cycle guard for self-referential schemas.
 */
export function walkProtobufNumericFields(
  type: Type,
): readonly McapNumericFieldDescriptor[] {
  const fields: McapNumericFieldDescriptor[] = [];
  walkProtobufType(type, "", new Set([type.fullName]), fields);
  return fields;
}

/**
 * Enumerates numeric leaf field paths of parsed ROS message definitions.
 * Arrays are skipped to match the scalar-only plot contract; nested complex
 * fields recurse up to `MAX_FIELD_DEPTH` with a cycle guard.
 */
export function walkRosNumericFields(
  definitions: readonly RosMessageDefinition[],
): readonly McapNumericFieldDescriptor[] {
  const root = rootRosMessageDefinition(definitions);
  if (!root) {
    return [];
  }
  const definitionsByName = new Map(
    definitions
      .filter((definition) => definition.name)
      .map((definition) => [definition.name ?? "", definition] as const),
  );
  const fields: McapNumericFieldDescriptor[] = [];
  const visited = new Set(root.name ? [root.name] : []);
  walkRosDefinition(root, definitionsByName, "", visited, fields);
  return fields;
}

function walkRosDefinition(
  definition: RosMessageDefinition,
  definitionsByName: ReadonlyMap<string, RosMessageDefinition>,
  prefix: string,
  visited: Set<string>,
  out: McapNumericFieldDescriptor[],
): void {
  if (visited.size > MAX_FIELD_DEPTH) {
    return;
  }

  for (const field of definition.definitions) {
    if (field.isConstant || field.isArray) {
      continue;
    }

    const path = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.enumType) {
      out.push({ path, valueType: "enum" });
      continue;
    }

    if (field.isComplex) {
      const nested = definitionsByName.get(field.type);
      if (!nested || visited.has(field.type)) {
        continue;
      }
      visited.add(field.type);
      walkRosDefinition(nested, definitionsByName, path, visited, out);
      visited.delete(field.type);
      continue;
    }

    if (ROS_NUMERIC_SCALAR_TYPES.has(field.type)) {
      out.push({ path, valueType: field.type });
    }
  }
}

function walkProtobufType(
  type: Type,
  prefix: string,
  visited: Set<string>,
  out: McapNumericFieldDescriptor[],
): void {
  if (visited.size > MAX_FIELD_DEPTH) {
    return;
  }

  for (const field of type.fieldsArray) {
    field.resolve();
    if (field.repeated || field.map) {
      continue;
    }

    const path = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.resolvedType instanceof Enum) {
      out.push({ path, valueType: "enum" });
      continue;
    }

    if (field.resolvedType instanceof Type) {
      if (visited.has(field.resolvedType.fullName)) {
        continue;
      }
      visited.add(field.resolvedType.fullName);
      walkProtobufType(field.resolvedType, path, visited, out);
      visited.delete(field.resolvedType.fullName);
      continue;
    }

    if (PROTOBUF_NUMERIC_SCALAR_TYPES.has(field.type)) {
      out.push({ path, valueType: field.type });
    }
  }
}

/**
 * Collects numeric leaf field paths from sampled JSON message records.
 * The union across samples, in first-seen order.
 */
export function jsonNumericFieldsFromSamples(
  samples: readonly Record<string, unknown>[],
): readonly McapNumericFieldDescriptor[] {
  const byPath = new Map<string, McapNumericFieldDescriptor>();
  for (const sample of samples) {
    walkJsonRecord(sample, "", 0, byPath);
  }
  return [...byPath.values()];
}

function walkJsonRecord(
  record: Record<string, unknown>,
  prefix: string,
  depth: number,
  out: Map<string, McapNumericFieldDescriptor>,
): void {
  if (depth >= MAX_FIELD_DEPTH) {
    return;
  }

  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "number") {
      if (!out.has(path)) {
        out.set(path, { path, valueType: "number" });
      }
      continue;
    }

    if (typeof value === "boolean") {
      if (!out.has(path)) {
        out.set(path, { path, valueType: "bool" });
      }
      continue;
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      walkJsonRecord(value as Record<string, unknown>, path, depth + 1, out);
    }
  }
}

/**
 * Enumerates plottable numeric fields for every requested topic.
 * Protobuf channels walk their binary descriptor, ROS channels walk their
 * parsed message definitions (both zero message reads), JSON channels
 * sample a few decoded messages, and other encodings return an explicit
 * unsupported-encoding entry. Never throws per topic; schema parse or
 * sampling failures degrade to an empty field list with an availability
 * reason so one bad channel cannot hide the rest.
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
      const { availability, fields } = protobufFieldsForSchema(
        schema.data,
        schema.name,
      );
      results.push({
        availability,
        encoding: "protobuf",
        fields,
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
      const fields = await jsonFieldsForTopic(reader, topic);
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
      const { availability, fields } = rosFieldsForChannel(reader, channel);
      results.push({
        availability,
        encoding: channel.messageEncoding,
        fields,
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
} {
  try {
    const definitions = rosMessageDefinitionsForChannel(reader, channel);
    if (!definitions) {
      return { availability: "schema-unavailable", fields: [] };
    }
    const fields = walkRosNumericFields(definitions);
    return { availability: availabilityForFields(fields), fields };
  } catch {
    return { availability: "schema-unavailable", fields: [] };
  }
}

function protobufFieldsForSchema(
  schemaData: Uint8Array,
  schemaName: string,
): {
  readonly availability: McapNumericFieldAvailability;
  readonly fields: readonly McapNumericFieldDescriptor[];
} {
  try {
    const root = protobufFromBinaryDescriptor(schemaData);
    const fields = walkProtobufNumericFields(root.lookupType(schemaName));
    return { availability: availabilityForFields(fields), fields };
  } catch {
    // Unparseable descriptor — list the topic without fields rather
    // than failing the whole enumeration.
    return { availability: "schema-unavailable", fields: [] };
  }
}

function availabilityForFields(
  fields: readonly McapNumericFieldDescriptor[],
): McapNumericFieldAvailability {
  return fields.length > 0 ? "ready" : "no-numeric-fields";
}

async function jsonFieldsForTopic(
  reader: McapIndexedReaderLike,
  topic: string,
): Promise<readonly McapNumericFieldDescriptor[]> {
  const samples: Record<string, unknown>[] = [];
  try {
    for await (const message of reader.readMessages({ topics: [topic] })) {
      try {
        samples.push(decodeJsonRecord(message.data));
      } catch {
        // Malformed sample — keep scanning up to the sample limit.
      }
      if (samples.length >= JSON_SAMPLE_MESSAGE_LIMIT) {
        break;
      }
    }
  } catch {
    // Read failure degrades to whatever samples were collected.
  }

  return jsonNumericFieldsFromSamples(samples);
}
