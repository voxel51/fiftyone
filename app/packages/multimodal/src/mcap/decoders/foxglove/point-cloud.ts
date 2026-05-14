import type {
  DecodedAttributeValue,
  Decoder,
  PointCloudField,
} from "../../../decoders";
import { VISUALIZATION_KIND } from "../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_POINT_CLOUD_PAYLOAD } from "./protobuf/payloads";
import {
  asRecord,
  optionalRecord,
  optionalString,
  requiredArray,
  requiredBytes,
  requiredNumber,
  requiredString,
} from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";

const FLOAT32_FIELD_TYPE = 7;

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
    const attributes: Record<string, DecodedAttributeValue> = {
      fields: packedFieldMetadata,
      pointCount,
      pointStride,
    };

    if (frameId) {
      attributes.frameId = frameId;
    }

    return {
      attributes,
      timing: timingFromContext(context, messageTimestamp),
      visualization: {
        fields: packedFieldMetadata,
        kind: VISUALIZATION_KIND.POINT_CLOUD,
        pointCount,
        positions,
      },
    };
  },
};

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

type PackedField = PointCloudField;

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
