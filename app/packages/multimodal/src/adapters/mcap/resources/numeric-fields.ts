import { Enum, Type } from "protobufjs";
import { decodeJsonRecord } from "../decoders/json/decode";
import { protobufFromBinaryDescriptor } from "../mcap-support";
import type { McapIndexedReaderLike } from "../reader";
import type {
  McapEnumerateNumericFieldsRequest,
  McapNumericFieldDescriptor,
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

/**
 * Enumerates numeric leaf field paths of a protobufjs message type in
 * declaration order. Repeated and map fields are skipped (v1 plots
 * scalars only); nested messages recurse up to `MAX_FIELD_DEPTH` with a
 * cycle guard for self-referential schemas.
 */
export function walkProtobufNumericFields(
  type: Type,
): readonly McapNumericFieldDescriptor[] {
  const fields: McapNumericFieldDescriptor[] = [];
  walkProtobufType(type, "", new Set([type.fullName]), fields);
  return fields;
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
 * Protobuf channels walk their binary descriptor (zero message reads);
 * JSON channels sample a few decoded messages; other encodings return
 * an explicit `unsupported` entry. Never throws per-topic — schema
 * parse or sampling failures degrade to an empty field list so one bad
 * channel cannot hide the rest.
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
      results.push({
        encoding: "protobuf",
        fields: protobufFieldsForSchema(schema.data, schema.name),
        topic,
      });
      continue;
    }

    if (channel.messageEncoding === "json") {
      results.push({
        encoding: "json",
        fields: await jsonFieldsForTopic(reader, topic),
        sampled: true,
        topic,
      });
      continue;
    }

    results.push({ encoding: "unsupported", fields: [], topic });
  }

  return results.sort((a, b) => a.topic.localeCompare(b.topic));
}

function protobufFieldsForSchema(
  schemaData: Uint8Array,
  schemaName: string,
): readonly McapNumericFieldDescriptor[] {
  try {
    const root = protobufFromBinaryDescriptor(schemaData);
    return walkProtobufNumericFields(root.lookupType(schemaName));
  } catch {
    // Unparseable descriptor — list the topic without fields rather
    // than failing the whole enumeration.
    return [];
  }
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
