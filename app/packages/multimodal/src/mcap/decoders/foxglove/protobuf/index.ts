/**
 * Protobuf descriptor lookup and decode helpers for Foxglove MCAP payloads.
 *
 * MCAP schemas provide binary FileDescriptorSet data per channel. This module
 * turns that schema data into cached protobufjs message types and decodes
 * message bytes into plain records for the concrete Foxglove decoders.
 */
import type { Type } from "protobufjs";
import type { DecodeContext, PayloadDescriptor } from "../../../../decoders";
import { protobufFromBinaryDescriptor } from "../../../mcap-support";
import { asRecord } from "./records";

const messageTypeCache = new WeakMap<Uint8Array, Map<string, Type>>();

/**
 * Decode protobuf payload bytes using schema data and schema name from the
 * decoder context/payload descriptor.
 */
export function decodeProtobufMessage(
  bytes: Uint8Array,
  payload: PayloadDescriptor,
  context: DecodeContext
): Record<string, unknown> {
  const schemaData = schemaDataFromContext(context);
  if (!schemaData) {
    throw new Error(
      `Schema data is required to decode ${payload.schema ?? "payload"}`
    );
  }

  if (!payload.schema) {
    throw new Error("Payload schema is required for protobuf decode");
  }

  const messageType = getMessageType(schemaData, payload.schema);

  return asRecord(messageType.decode(bytes));
}

function getMessageType(schemaData: Uint8Array, schemaName: string): Type {
  let typesBySchema = messageTypeCache.get(schemaData);
  if (!typesBySchema) {
    typesBySchema = new Map();
    messageTypeCache.set(schemaData, typesBySchema);
  }

  const cachedType = typesBySchema.get(schemaName);
  if (cachedType) {
    return cachedType;
  }

  const root = protobufFromBinaryDescriptor(schemaData);
  const messageType = root.lookupType(schemaName);
  typesBySchema.set(schemaName, messageType);

  return messageType;
}

function schemaDataFromContext(context: DecodeContext): Uint8Array | undefined {
  const schemaData = context.schemaData;

  if (schemaData === undefined || schemaData === null) {
    return undefined;
  }

  if (!(schemaData instanceof Uint8Array)) {
    throw new Error("Decoder context schemaData is not bytes");
  }

  return schemaData;
}
