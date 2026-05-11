import * as protobufjs from "protobufjs";
import * as descriptorModule from "protobufjs/ext/descriptor/index.js";
import { RENDER_ARCHETYPE } from "../../../archetypes";
import type {
  DecodedFieldValue,
  DecodedSourceTimestamps,
  DecodedTiming,
  Decoder,
  PayloadDescriptor,
} from "../../../decoders";

const FOXGLOVE_PROTOBUF_SCHEMA_ENCODING = "protobuf";
const FOXGLOVE_PROTOBUF_MESSAGE_ENCODING = "protobuf";
const FOXGLOVE_COMPRESSED_IMAGE_SCHEMA = "foxglove.CompressedImage";
const FOXGLOVE_POINT_CLOUD_SCHEMA = "foxglove.PointCloud";
const FLOAT32_FIELD_TYPE = 7;
const NANOSECONDS_PER_SECOND = 1000000000n;

const FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD: PayloadDescriptor = {
  encoding: FOXGLOVE_PROTOBUF_MESSAGE_ENCODING,
  schema: FOXGLOVE_COMPRESSED_IMAGE_SCHEMA,
  schemaEncoding: FOXGLOVE_PROTOBUF_SCHEMA_ENCODING,
};

const FOXGLOVE_POINT_CLOUD_PAYLOAD: PayloadDescriptor = {
  encoding: FOXGLOVE_PROTOBUF_MESSAGE_ENCODING,
  schema: FOXGLOVE_POINT_CLOUD_SCHEMA,
  schemaEncoding: FOXGLOVE_PROTOBUF_SCHEMA_ENCODING,
};

type MessageTypeLike = {
  decode(bytes: Uint8Array): unknown;
};

type ProtobufDescriptorModule = typeof descriptorModule;
type ProtobufJsModule = typeof protobufjs;
type RootWithDescriptor = typeof protobufjs.Root & {
  fromDescriptor(descriptor: protobufjs.Message): protobufjs.Root;
};

interface DecodeTimingContext {
  readonly sourceTimestamps?: DecodedSourceTimestamps;
  readonly timeRangeStartKey?: string;
  readonly timeRangeStartNs?: bigint;
}

const protobufRuntime = unwrapDefaultExport<ProtobufJsModule>(protobufjs);
const descriptorRuntime =
  unwrapDefaultExport<ProtobufDescriptorModule>(descriptorModule);
const FileDescriptorSet = descriptorRuntime.FileDescriptorSet;
const messageTypeCache = new WeakMap<
  Uint8Array,
  Map<string, MessageTypeLike>
>();

/**
 * Decoder for Foxglove compressed image protobuf messages.
 */
export const foxgloveCompressedImageDecoder: Decoder = {
  id: "foxglove.compressed-image",
  payload: FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD,
      context
    );
    const data = requiredBytes(message, "data");
    const format = optionalString(message, "format") ?? "unknown";
    const frameId = optionalString(message, "frameId", "frame_id");
    const messageTimestamp = timestampNs(optionalRecord(message, "timestamp"));
    const fields: Record<string, DecodedFieldValue> = {
      byteLength: data.byteLength,
      format,
    };
    const metadata: Record<string, DecodedFieldValue> = {
      byteLength: data.byteLength,
      format,
    };

    if (frameId) {
      fields.frameId = frameId;
      metadata.frameId = frameId;
    }

    return {
      fields,
      render: {
        data,
        kind: RENDER_ARCHETYPE.IMAGE_RAW,
        metadata,
      },
      timing: timingFromContext(context, messageTimestamp),
    };
  },
};

/**
 * Decoder for Foxglove point cloud protobuf messages.
 */
export const foxglovePointCloudDecoder: Decoder = {
  id: "foxglove.point-cloud",
  payload: FOXGLOVE_POINT_CLOUD_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_POINT_CLOUD_PAYLOAD,
      context
    );
    const data = requiredBytes(message, "data");
    const pointStride = requiredNumber(message, "pointStride", "point_stride");
    const fields = packedFields(requiredArray(message, "fields"));
    const positions = extractPositions(data, pointStride, fields);
    const frameId = optionalString(message, "frameId", "frame_id");
    const messageTimestamp = timestampNs(optionalRecord(message, "timestamp"));
    const pointCount = positions.length / 3;
    const packedFieldMetadata = fields.map((field) => ({
      name: field.name,
      offset: field.offset,
      type: field.type,
    }));
    const outputFields: Record<string, DecodedFieldValue> = {
      fields: packedFieldMetadata,
      pointCount,
      pointStride,
    };
    const metadata: Record<string, DecodedFieldValue> = {
      fields: packedFieldMetadata,
      pointCount,
      pointStride,
    };

    if (frameId) {
      outputFields.frameId = frameId;
      metadata.frameId = frameId;
    }

    return {
      fields: outputFields,
      render: {
        data: positions,
        kind: RENDER_ARCHETYPE.POINTS_3D,
        metadata,
      },
      timing: timingFromContext(context, messageTimestamp),
    };
  },
};

/**
 * Built-in Foxglove decoders for the MCAP adapter.
 */
export const foxgloveDecoders: readonly Decoder[] = [
  foxgloveCompressedImageDecoder,
  foxglovePointCloudDecoder,
];

function decodeProtobufMessage(
  bytes: Uint8Array,
  payload: PayloadDescriptor,
  context: unknown
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

function getMessageType(
  schemaData: Uint8Array,
  schemaName: string
): MessageTypeLike {
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
  const messageType = root.lookupType(schemaName) as MessageTypeLike;
  typesBySchema.set(schemaName, messageType);

  return messageType;
}

function protobufFromBinaryDescriptor(schemaData: Uint8Array): protobufjs.Root {
  const root = protobufRuntime.Root as RootWithDescriptor;

  return root.fromDescriptor(FileDescriptorSet.decode(schemaData));
}

function unwrapDefaultExport<T>(module: T | { default: T }): T {
  if (module && typeof module === "object" && "default" in module) {
    return (module as { default: T }).default;
  }

  return module as T;
}

function extractPositions(
  data: Uint8Array,
  pointStride: number,
  fields: readonly PackedField[]
): Float32Array {
  if (pointStride <= 0) {
    throw new Error(`Invalid point stride ${pointStride}`);
  }

  const x = requiredFloat32Field(fields, "x");
  const y = requiredFloat32Field(fields, "y");
  const z = requiredFloat32Field(fields, "z");

  for (const field of [x, y, z]) {
    if (field.offset < 0 || field.offset + 4 > pointStride) {
      throw new Error(`Point cloud '${field.name}' field exceeds point stride`);
    }
  }

  if (data.byteLength % pointStride !== 0) {
    throw new Error("Point cloud data length is not aligned to point stride");
  }

  const pointCount = Math.floor(data.byteLength / pointStride);
  const positions = new Float32Array(pointCount * 3);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let index = 0; index < pointCount; index++) {
    const baseOffset = index * pointStride;
    positions[index * 3] = view.getFloat32(baseOffset + x.offset, true);
    positions[index * 3 + 1] = view.getFloat32(baseOffset + y.offset, true);
    positions[index * 3 + 2] = view.getFloat32(baseOffset + z.offset, true);
  }

  return positions;
}

interface PackedField {
  readonly name: string;
  readonly offset: number;
  readonly type: number;
}

function packedFields(values: readonly unknown[]): readonly PackedField[] {
  return values.map((value) => {
    const record = asRecord(value);

    return {
      name: requiredString(record, "name"),
      offset: requiredNumber(record, "offset"),
      type: requiredNumber(record, "type"),
    };
  });
}

function requiredFloat32Field(
  fields: readonly PackedField[],
  name: string
): PackedField {
  const field = fields.find((candidate) => candidate.name === name);

  if (!field) {
    throw new Error(`Point cloud is missing '${name}' field`);
  }

  if (field.type !== FLOAT32_FIELD_TYPE) {
    throw new Error(`Point cloud '${name}' field must be FLOAT32`);
  }

  return field;
}

function timingFromContext(
  context: unknown,
  messageTimestampNs: bigint | undefined
): DecodedTiming {
  const timingContext = timingContextFromContext(context);
  const sourceTimestamps: Record<string, bigint> = {
    ...(timingContext?.sourceTimestamps ?? {}),
  };
  if (messageTimestampNs !== undefined) {
    sourceTimestamps.messageTime = messageTimestampNs;
  }
  const startNs =
    timingContext?.timeRangeStartNs ??
    (timingContext?.timeRangeStartKey
      ? sourceTimestamps[timingContext.timeRangeStartKey]
      : undefined) ??
    messageTimestampNs;

  return {
    sourceTimestamps: sourceTimestamps as DecodedSourceTimestamps,
    timeRange: startNs !== undefined ? { startNs } : undefined,
  };
}

function schemaDataFromContext(context: unknown): Uint8Array | undefined {
  const record = optionalContextRecord(context);
  const schemaData = record?.schemaData;

  if (schemaData === undefined || schemaData === null) {
    return undefined;
  }

  if (!(schemaData instanceof Uint8Array)) {
    throw new Error("Decoder context schemaData is not bytes");
  }

  return schemaData;
}

function timingContextFromContext(
  context: unknown
): DecodeTimingContext | undefined {
  const record = optionalContextRecord(context);
  if (!record) {
    return undefined;
  }

  const sourceTimestamps = sourceTimestampsFromValue(record.sourceTimestamps);
  const timeRangeStartKey =
    typeof record.timeRangeStartKey === "string"
      ? record.timeRangeStartKey
      : undefined;
  const timeRangeStartNs =
    typeof record.timeRangeStartNs === "bigint"
      ? record.timeRangeStartNs
      : undefined;

  return {
    sourceTimestamps,
    timeRangeStartKey,
    timeRangeStartNs,
  };
}

function sourceTimestampsFromValue(
  value: unknown
): DecodedSourceTimestamps | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const record = asRecord(value);
  const sourceTimestamps: Record<string, bigint> = {};
  for (const [key, timestamp] of Object.entries(record)) {
    if (typeof timestamp !== "bigint") {
      throw new Error(`Source timestamp '${key}' is not a bigint`);
    }
    sourceTimestamps[key] = timestamp;
  }

  return sourceTimestamps;
}

function timestampNs(timestamp: Record<string, unknown> | undefined) {
  if (!timestamp) {
    return undefined;
  }

  const seconds = optionalBigInt(timestamp, "seconds") ?? 0n;
  const nanos = optionalBigInt(timestamp, "nanos") ?? 0n;

  return seconds * NANOSECONDS_PER_SECOND + nanos;
}

function optionalBigInt(
  record: Record<string, unknown>,
  field: string
): bigint | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  if (typeof value === "string") {
    return BigInt(value);
  }
  if (typeof value === "object" && "toString" in value) {
    return BigInt(value.toString());
  }

  throw new Error(`Field '${field}' is not a bigint-compatible value`);
}

function optionalRecord(
  record: Record<string, unknown>,
  field: string
): Record<string, unknown> | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }

  return asRecord(value);
}

function requiredArray(
  record: Record<string, unknown>,
  field: string
): readonly unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`Field '${field}' is not an array`);
  }

  return value;
}

function requiredBytes(record: Record<string, unknown>, field: string) {
  const value = record[field];
  if (!(value instanceof Uint8Array)) {
    throw new Error(`Field '${field}' is not bytes`);
  }

  return value;
}

function requiredNumber(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string
) {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (typeof value !== "number") {
    throw new Error(`Field '${field}' is not a number`);
  }

  return value;
}

function requiredString(record: Record<string, unknown>, field: string) {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`Field '${field}' is not a string`);
  }

  return value;
}

function optionalString(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string
) {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (typeof value === "string" && value) {
    return value;
  }

  return undefined;
}

function optionalContextRecord(
  value: unknown
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error("Decoded protobuf message is not an object");
  }

  return value as Record<string, unknown>;
}
