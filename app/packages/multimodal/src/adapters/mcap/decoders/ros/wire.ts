import { parse as parseRosMessageDefinition } from "@foxglove/rosmsg";
import { parseRos2idl } from "@foxglove/ros2idl-parser";
import { MessageReader as Ros1MessageReader } from "@foxglove/rosmsg-serialization";
import { MessageReader as Ros2MessageReader } from "@foxglove/rosmsg2-serialization";
import type { McapTypes } from "@mcap/core";
import type { PayloadDescriptor } from "../../../../decoders";

const TEXT_DECODER = new TextDecoder();

type McapChannel = McapTypes.TypedMcapRecords["Channel"];
type McapSchema = McapTypes.TypedMcapRecords["Schema"];
type RosSchemaLike = Pick<McapSchema, "data" | "encoding" | "name">;

/**
 * Parsed ROS message definition returned by the ROS schema parsers.
 */
export type RosMessageDefinition = ReturnType<
  typeof parseRosMessageDefinition
>[number];

interface McapRosSchemaReader {
  readonly schemasById: ReadonlyMap<number, McapSchema>;
}

/**
 * ROS message encodings currently decoded from MCAP channels.
 */
export type RosMessageEncoding = "ros1" | "cdr";

/**
 * ROS schema encodings currently parsed from MCAP schemas.
 */
export type RosSchemaEncoding = "ros1msg" | "ros2msg" | "ros2idl";

interface ParsedRosChannelSchema {
  readonly definitions: readonly RosMessageDefinition[];
  readonly messageEncoding: RosMessageEncoding;
  readonly reader: {
    readMessage<T = unknown>(buffer: ArrayBufferView): T;
  };
  readonly schemaEncoding: RosSchemaEncoding;
}

const parsedSchemaCache = new Map<string, ParsedRosChannelSchema | null>();

/**
 * Returns a generic ROS record decoder for one MCAP channel. Schema parse
 * failures degrade to null so callers can surface unsupported/decode-error
 * metadata without poisoning playback.
 */
export function rosRecordDecoderForChannel(
  reader: McapRosSchemaReader,
  channel: Pick<McapChannel, "messageEncoding" | "schemaId">,
): ((bytes: Uint8Array) => Record<string, unknown>) | null {
  const parsed = parsedRosSchemaForChannel(reader, channel);
  if (!parsed) {
    return null;
  }

  return (bytes) => asRecord(parsed.reader.readMessage(bytes));
}

/**
 * Returns a generic ROS record decoder for one exact payload descriptor and
 * schema byte blob. This is the registry-decoder counterpart to
 * `rosRecordDecoderForChannel`; both share the same parse cache and reader
 * construction path.
 */
export function rosRecordDecoderForPayload(
  payload: PayloadDescriptor,
  schemaData: Uint8Array | undefined,
): ((bytes: Uint8Array) => Record<string, unknown>) | null {
  if (!schemaData || schemaData.byteLength === 0 || !payload.schema) {
    return null;
  }

  const parsed = parsedRosSchema(payload.encoding, {
    data: schemaData,
    encoding: payload.schemaEncoding ?? "",
    name: payload.schema,
  });
  if (!parsed) {
    return null;
  }

  return (bytes) => asRecord(parsed.reader.readMessage(bytes));
}

/**
 * Returns parsed ROS message definitions for one MCAP channel, when its
 * channel/schema encoding pair is supported by the ROS decoder bridge.
 */
export function rosMessageDefinitionsForChannel(
  reader: McapRosSchemaReader,
  channel: Pick<McapChannel, "messageEncoding" | "schemaId">,
): readonly RosMessageDefinition[] | null {
  return parsedRosSchemaForChannel(reader, channel)?.definitions ?? null;
}

/**
 * Returns whether an MCAP message encoding is a supported ROS encoding.
 */
export function isRosMessageEncoding(
  encoding: string,
): encoding is RosMessageEncoding {
  return encoding === "ros1" || encoding === "cdr";
}

/**
 * Selects the top-level message definition from a parsed ROS schema bundle.
 */
export function rootRosMessageDefinition(
  definitions: readonly RosMessageDefinition[],
): RosMessageDefinition | undefined {
  return (
    definitions.find(
      (definition) =>
        !definition.definitions.every((field) => field.isConstant),
    ) ?? definitions[0]
  );
}

function parsedRosSchemaForChannel(
  reader: McapRosSchemaReader,
  channel: Pick<McapChannel, "messageEncoding" | "schemaId">,
): ParsedRosChannelSchema | null {
  const schema = reader.schemasById.get(channel.schemaId);
  if (!schema || schema.data.byteLength === 0) {
    return null;
  }

  return parsedRosSchema(channel.messageEncoding, schema);
}

function parsedRosSchema(
  messageEncoding: string,
  schema: RosSchemaLike,
): ParsedRosChannelSchema | null {
  const match = rosEncodingMatch(messageEncoding, schema.encoding);
  if (!match) {
    return null;
  }

  const cacheKey = rosSchemaCacheKey(messageEncoding, schema);
  if (parsedSchemaCache.has(cacheKey)) {
    return parsedSchemaCache.get(cacheKey) ?? null;
  }

  let parsed: ParsedRosChannelSchema | null = null;
  try {
    const definitions = parseRosSchema(schema, match.schemaEncoding);
    const reader =
      match.messageEncoding === "ros1"
        ? new Ros1MessageReader(definitions)
        : new Ros2MessageReader(definitions);
    parsed = { ...match, definitions, reader };
  } catch {
    parsed = null;
  }

  parsedSchemaCache.set(cacheKey, parsed);
  return parsed;
}

function rosEncodingMatch(
  messageEncoding: string,
  schemaEncoding: string,
): {
  readonly messageEncoding: RosMessageEncoding;
  readonly schemaEncoding: RosSchemaEncoding;
} | null {
  if (messageEncoding === "ros1" && schemaEncoding === "ros1msg") {
    return { messageEncoding, schemaEncoding };
  }
  if (
    messageEncoding === "cdr" &&
    (schemaEncoding === "ros2msg" || schemaEncoding === "ros2idl")
  ) {
    return { messageEncoding, schemaEncoding };
  }
  return null;
}

function parseRosSchema(
  schema: RosSchemaLike,
  schemaEncoding: RosSchemaEncoding,
): RosMessageDefinition[] {
  const schemaText = TEXT_DECODER.decode(schema.data);
  if (schemaEncoding === "ros1msg") {
    return parseRosMessageDefinition(schemaText);
  }
  if (schemaEncoding === "ros2msg") {
    return parseRosMessageDefinition(schemaText, { ros2: true });
  }
  return parseRos2idl(schemaText);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Decoded ROS message is not an object");
  }
  return value as Record<string, unknown>;
}

function rosSchemaCacheKey(
  messageEncoding: string,
  schema: RosSchemaLike,
): string {
  return [
    messageEncoding,
    schema.encoding,
    schema.name,
    schema.data.byteLength.toString(),
    hashSchemaData(schema.data),
  ].join("\0");
}

function hashSchemaData(data: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of data) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
