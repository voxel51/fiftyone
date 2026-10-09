import type { McapTypes } from "@mcap/core";
import { Enum, MapField, Type } from "protobufjs";
import type { RawRecordSchema } from "../../../ir";
import { getProtobufMessageType } from "../message-decoders/foxglove/protobuf";

const MAX_SCHEMA_TEXT = 64 * 1024;
const MAX_SCHEMA_TYPES = 64;
const MAX_SCHEMA_FIELDS = 2_000;
const schemaCache = new WeakMap<
  Uint8Array,
  Map<string, RawRecordSchema | undefined>
>();

/** Read a declared schema once; schema failures must not hide a usable example. */
export function rawMessageSchema(
  schema: McapTypes.TypedMcapRecords["Schema"] | undefined,
): RawRecordSchema | undefined {
  if (!schema?.data.byteLength) return undefined;
  let cached = schemaCache.get(schema.data);
  const key = `${schema.encoding}:${schema.name}`;
  if (cached?.has(key)) return cached.get(key);
  if (!cached) {
    cached = new Map();
    schemaCache.set(schema.data, cached);
  }
  let result: RawRecordSchema | undefined;
  try {
    let text: string;
    let truncated = false;
    if (schema.encoding === "protobuf") {
      const root = getProtobufMessageType(schema.data, schema.name);
      const types: Record<string, unknown> = Object.create(null);
      const queue: (Type | Enum)[] = [root];
      let fieldsLeft = MAX_SCHEMA_FIELDS;
      const seen = new Set<string>();
      while (queue.length) {
        const type = queue.shift();
        if (!type || seen.has(type.fullName)) continue;
        if (seen.size >= MAX_SCHEMA_TYPES || fieldsLeft <= 0) {
          truncated = true;
          break;
        }
        seen.add(type.fullName);
        const name = type.fullName.replace(/^\./, "");
        if (type instanceof Enum) {
          const values = Object.entries(type.values).slice(0, fieldsLeft);
          types[name] = { enum: Object.fromEntries(values) };
          truncated ||= values.length < Object.keys(type.values).length;
          fieldsLeft -= values.length;
          continue;
        }
        const fields: Record<string, unknown> = Object.create(null);
        for (const field of type.fieldsArray) {
          if (fieldsLeft-- <= 0) {
            truncated = true;
            break;
          }
          field.resolve();
          const resolved = field.resolvedType;
          if (resolved instanceof Type || resolved instanceof Enum)
            queue.push(resolved);
          fields[field.name] = {
            type: (resolved?.fullName ?? field.type).replace(/^\./, ""),
            id: field.id,
            ...(field.repeated ? { repeated: true } : {}),
            ...(field instanceof MapField ? { mapKey: field.keyType } : {}),
            ...(field.partOf ? { oneof: field.partOf.name } : {}),
          };
        }
        types[name] = { fields };
      }
      text = JSON.stringify(
        { root: schema.name, types, ...(truncated ? { truncated: true } : {}) },
        null,
        2,
      );
    } else if (
      ["jsonschema", "ros1msg", "ros2msg", "ros2idl"].includes(schema.encoding)
    ) {
      // Decode only a bounded prefix; don't copy a multi-megabyte schema into UI state.
      truncated = schema.data.byteLength > MAX_SCHEMA_TEXT;
      text = new TextDecoder().decode(schema.data.subarray(0, MAX_SCHEMA_TEXT));
      if (schema.encoding === "jsonschema" && !truncated)
        text = JSON.stringify(JSON.parse(text), null, 2);
    } else {
      cached.set(key, undefined);
      return undefined;
    }
    if (text.length > MAX_SCHEMA_TEXT) {
      text = text.slice(0, MAX_SCHEMA_TEXT);
      truncated = true;
    }
    result = {
      name: schema.name,
      encoding: schema.encoding,
      text,
      ...(truncated ? { truncated: true } : {}),
    };
  } catch {
    // Unreadable declarations are distinct from the observed message body.
    result = undefined;
  }
  cached.set(key, result);
  return result;
}
