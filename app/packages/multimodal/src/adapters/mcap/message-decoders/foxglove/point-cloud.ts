import type { DecodeContext, Decoder } from "../../../../decoders/index";
import type {
  DecodedAttributeValue,
  DecodedOutput,
  PointCloudField,
  PointCloudRenderPayload,
  PointCloudRenderScalarField,
  PointCloudScalarField,
} from "../../../../ir/index";
import { resourceHintsForArrayBufferViews } from "../../../../decoders/index";
import {
  isFinitePointCloudPosition,
  MAX_POINT_CLOUD_RENDER_POINTS,
  pointCloudRenderCapacity,
  sampledFiniteOrdinal,
  VISUALIZATION_KIND,
} from "../../../../ir/index";
import { rosDecodersForPayloads } from "../ros/factory";
import { decodeProtobufMessage } from "./protobuf/index";
import {
  decodePose,
  normalizedQuaternion,
  type ProtobufPose3D,
} from "./protobuf/geometry";
import {
  FOXGLOVE_POINT_CLOUD_CDR_PAYLOADS,
  FOXGLOVE_POINT_CLOUD_PAYLOAD,
} from "./payloads";
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

// Foxglove PointCloud numeric Field.type ids, kept in protobuf enum order.
const UINT8_FIELD_TYPE = 1;
const INT8_FIELD_TYPE = 2;
const UINT16_FIELD_TYPE = 3;
const INT16_FIELD_TYPE = 4;
const UINT32_FIELD_TYPE = 5;
const INT32_FIELD_TYPE = 6;
const FLOAT32_FIELD_TYPE = 7;
const FLOAT64_FIELD_TYPE = 8;

const UINT8_MAX_VALUE = 255;
const INT8_MAX_VALUE = 127;
const UINT16_MAX_VALUE = 65_535;
const INT16_MAX_VALUE = 32_767;
const UINT32_MAX_VALUE = 4_294_967_295;
const INT32_MAX_VALUE = 2_147_483_647;

const FLOAT32_BYTE_WIDTH = 4;

/**
 * Number of float components stored per decoded point position.
 */
export const POINT_COMPONENT_COUNT = 3;
const COLOR_COMPONENT_COUNT = 3;

const X_COMPONENT_INDEX = 0;
const Y_COMPONENT_INDEX = 1;
const Z_COMPONENT_INDEX = 2;

const CANONICAL_SCALAR_FIELDS = Object.freeze([
  "intensity",
  "reflectivity",
  "reflectance",
  "rcs",
] as const);
const CANONICAL_SCALAR_FIELD_NAMES: ReadonlySet<string> = new Set(
  CANONICAL_SCALAR_FIELDS,
);
// Every numeric channel that is neither a position component nor consumed
// by color extraction is a color-by-field candidate (ring, velocity, ...).
// Capped so exotic layouts cannot balloon worker→main transfer cost.
const MAX_SCALAR_FIELDS = 16;
const POSITION_FIELD_NAMES: ReadonlySet<string> = new Set(["x", "y", "z"]);

const RED_COLOR_CHANNEL_NAMES = Object.freeze(["r", "red"] as const);
const GREEN_COLOR_CHANNEL_NAMES = Object.freeze(["g", "green"] as const);
const BLUE_COLOR_CHANNEL_NAMES = Object.freeze(["b", "blue"] as const);
const PACKED_COLOR_FIELD_NAMES = Object.freeze(["color", "rgb", "rgba"]);
const COLOR_FIELD_NAMES: ReadonlySet<string> = new Set([
  ...RED_COLOR_CHANNEL_NAMES,
  ...GREEN_COLOR_CHANNEL_NAMES,
  ...BLUE_COLOR_CHANNEL_NAMES,
  ...PACKED_COLOR_FIELD_NAMES,
  "a",
  "alpha",
]);

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
      context,
    );
    return decodeFoxglovePointCloudRecord(message, context);
  },
};

/**
 * Decoders for Foxglove PointCloud messages carried over ROS 2 CDR.
 */
export const foxglovePointCloudCdrDecoders = rosDecodersForPayloads({
  id: "foxglove.point-cloud.cdr",
  map: decodeFoxglovePointCloudRecord,
  payloads: FOXGLOVE_POINT_CLOUD_CDR_PAYLOADS,
});

export function decodeFoxglovePointCloudRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const data = requiredBytes(message, "data");
  const pointStride = requiredNumber(message, "pointStride", "point_stride");
  const fields = packedFields(requiredArray(message, "fields"));
  const decodedPoints = extractPointCloudRenderData(data, pointStride, fields, {
    pose: decodePose(optionalRecord(message, "pose")),
  });
  // Per-message Foxglove frame_id carried by this point cloud payload. This
  // is separate from the MCAP channel frame_id metadata fallback.
  const frameId = optionalString(message, "frameId", "frame_id");
  const messageTimestamp = timestampNs(optionalRecord(message, "timestamp"));
  const pointCount = decodedPoints.renderPayload.sampledPointCount;
  const packedFieldMetadata = fields.map((field) => ({
    name: field.name,
    offset: field.offset,
    type: field.type,
  }));
  const attributes: Record<string, DecodedAttributeValue> = {
    fields: packedFieldMetadata,
    pointCount,
    pointStride,
    sourcePointCount: decodedPoints.sourcePointCount,
  };

  if (frameId) {
    attributes.frameId = frameId;
  }
  const renderPayload = decodedPoints.renderPayload;

  const transferableViews = [
    renderPayload.positions,
    renderPayload.colors,
    ...renderPayload.scalarFields.map((field) => field.values),
    renderPayload.sourceIndices,
  ].filter((view): view is Float32Array | Uint32Array => view !== undefined);

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(...transferableViews),
    timing: timingFromContext(context, messageTimestamp),
    visualization: {
      ...(frameId ? { coordinateFrameId: frameId } : {}),
      ...(decodedPoints.colors ? { colors: decodedPoints.colors } : {}),
      ...(decodedPoints.scalarFields.length
        ? { scalarFields: decodedPoints.scalarFields }
        : {}),
      fields: packedFieldMetadata,
      kind: VISUALIZATION_KIND.POINT_CLOUD,
      pointCount,
      positions: decodedPoints.positions,
      renderPayload,
    },
  };
}

/**
 * Normalized point cloud buffers shared by Foxglove and ROS decoders.
 */
export interface DecodedPointCloudData {
  readonly colors?: Float32Array;
  readonly positions: Float32Array;
  readonly scalarFields: readonly PointCloudScalarField[];
}

/**
 * Render-native packed point-cloud projection. Compatibility arrays are
 * sampled-prefix views over `renderPayload`; no full decoded XYZ/RGB/scalar
 * arrays are allocated.
 */
export interface DecodedPointCloudRenderData extends DecodedPointCloudData {
  readonly renderPayload: PointCloudRenderPayload;
  readonly sourcePointCount: number;
}

export interface PackedPointCloudProjectionOptions {
  /**
   * A numeric field whose zero value marks an invalid return. Callers must
   * provide this only after recognizing a sensor-specific packed layout.
   */
  readonly invalidZeroField?: PointCloudField;
  readonly pose?: ProtobufPose3D;
}

/**
 * Reads packed point records directly into the bounded renderer payload.
 *
 * The first pass computes validity and full-cloud statistics. The second pass
 * writes only selected records into capacity-sized GPU arrays. This keeps
 * source identity for picking while avoiding full-resolution intermediate
 * arrays and per-scalar extraction passes.
 */
export function extractPointCloudRenderData(
  data: Uint8Array,
  pointStride: number,
  fields: readonly PointCloudField[],
  options: PackedPointCloudProjectionOptions = {},
): DecodedPointCloudRenderData {
  const layout = pointCloudLayout(pointStride, fields, options);
  const pointDataByteLength = alignedPointDataByteLength(data, pointStride);
  const sourcePointCount = Math.floor(pointDataByteLength / pointStride);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const transform = pointCloudTransform(options.pose);
  const scalarStats = layout.scalarFields.map((field) => ({
    field,
    finiteValueCount: 0,
    max: -Infinity,
    min: Infinity,
  }));
  let finitePointCount = 0;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  const position = { x: 0, y: 0, z: 0 };

  for (let pointIndex = 0; pointIndex < sourcePointCount; pointIndex++) {
    const baseOffset = pointIndex * pointStride;
    if (isInvalidPackedPoint(view, baseOffset, layout.invalidZeroField)) {
      continue;
    }
    readPackedPosition(view, baseOffset, layout, transform, position);
    const { x, y, z } = position;
    if (!isFinitePointCloudPosition(x, y, z)) {
      continue;
    }

    finitePointCount++;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    for (const stats of scalarStats) {
      const value = readNumericField(
        view,
        baseOffset + stats.field.offset,
        stats.field.type,
      );
      if (!Number.isFinite(value)) {
        continue;
      }
      stats.finiteValueCount++;
      stats.min = Math.min(stats.min, value);
      stats.max = Math.max(stats.max, value);
    }
  }

  const sampledPointCount = Math.min(
    finitePointCount,
    MAX_POINT_CLOUD_RENDER_POINTS,
  );
  const capacity = pointCloudRenderCapacity(sampledPointCount);
  const positions = new Float32Array(capacity * POINT_COMPONENT_COUNT);
  const colors = layout.color
    ? new Float32Array(capacity * COLOR_COMPONENT_COUNT)
    : undefined;
  const scalarFields: PointCloudRenderScalarField[] = scalarStats.map(
    ({ field, finiteValueCount, max, min }) => ({
      finiteValueCount,
      name: field.name,
      range: finiteValueCount > 0 ? { max, min } : null,
      values: new Float32Array(capacity),
    }),
  );
  const sourceIndices = new Uint32Array(capacity);

  let finiteOrdinal = 0;
  let sampleIndex = 0;
  let targetOrdinal = sampledFiniteOrdinal(
    sampleIndex,
    sampledPointCount,
    finitePointCount,
  );
  for (
    let pointIndex = 0;
    pointIndex < sourcePointCount && sampleIndex < sampledPointCount;
    pointIndex++
  ) {
    const baseOffset = pointIndex * pointStride;
    if (isInvalidPackedPoint(view, baseOffset, layout.invalidZeroField)) {
      continue;
    }
    readPackedPosition(view, baseOffset, layout, transform, position);
    if (!isFinitePointCloudPosition(position.x, position.y, position.z)) {
      continue;
    }

    if (finiteOrdinal === targetOrdinal) {
      const positionOffset = sampleIndex * POINT_COMPONENT_COUNT;
      positions[positionOffset] = position.x;
      positions[positionOffset + 1] = position.y;
      positions[positionOffset + 2] = position.z;
      if (colors && layout.color) {
        writePackedColor(
          data,
          view,
          baseOffset,
          colors,
          positionOffset,
          layout.color,
        );
      }
      for (
        let fieldIndex = 0;
        fieldIndex < layout.scalarFields.length;
        fieldIndex++
      ) {
        const field = layout.scalarFields[fieldIndex];
        scalarFields[fieldIndex].values[sampleIndex] = readNumericField(
          view,
          baseOffset + field.offset,
          field.type,
        );
      }
      sourceIndices[sampleIndex] = pointIndex;
      sampleIndex++;
      targetOrdinal = sampledFiniteOrdinal(
        sampleIndex,
        sampledPointCount,
        finitePointCount,
      );
    }
    finiteOrdinal++;
  }

  const renderPayload: PointCloudRenderPayload = {
    bounds:
      finitePointCount > 0
        ? { max: [maxX, maxY, maxZ], min: [minX, minY, minZ] }
        : null,
    capacity,
    ...(colors ? { colors } : {}),
    finitePointCount,
    heightRange: finitePointCount > 0 ? { max: maxZ, min: minZ } : null,
    positions,
    sampledPointCount,
    scalarFields,
    sourceIndices,
    sourcePointCount,
  };
  const sampledComponentCount = sampledPointCount * POINT_COMPONENT_COUNT;
  const compatibilityScalarFields = scalarFields.map(({ name, values }) => ({
    name,
    values: values.subarray(0, sampledPointCount),
  }));

  return {
    ...(colors ? { colors: colors.subarray(0, sampledComponentCount) } : {}),
    positions: positions.subarray(0, sampledComponentCount),
    renderPayload,
    scalarFields: compatibilityScalarFields,
    sourcePointCount,
  };
}

interface MutablePackedPointPosition {
  x: number;
  y: number;
  z: number;
}

type PackedPointColorLayout =
  | {
      readonly blue: PointCloudField;
      readonly green: PointCloudField;
      readonly kind: "separate";
      readonly red: PointCloudField;
    }
  | {
      readonly field: PointCloudField;
      readonly kind: "packed";
    };

interface PackedPointCloudLayout {
  readonly color: PackedPointColorLayout | null;
  readonly invalidZeroField?: PointCloudField;
  readonly scalarFields: readonly PointCloudField[];
  readonly x: PointCloudField;
  readonly y: PointCloudField;
  readonly z: PointCloudField;
}

interface PackedPointCloudTransform {
  readonly enabled: boolean;
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  readonly qw: number;
  readonly qx: number;
  readonly qy: number;
  readonly qz: number;
}

function pointCloudLayout(
  pointStride: number,
  fields: readonly PointCloudField[],
  options: PackedPointCloudProjectionOptions,
): PackedPointCloudLayout {
  if (pointStride <= 0) {
    throw new Error(`Invalid point stride ${pointStride}`);
  }

  const x = requiredFloat32Field(fields, "x");
  const y = requiredFloat32Field(fields, "y");
  const z = requiredFloat32Field(fields, "z");
  for (const field of [x, y, z]) {
    if (field.offset < 0 || field.offset + FLOAT32_BYTE_WIDTH > pointStride) {
      throw new Error(`Point cloud '${field.name}' field exceeds point stride`);
    }
  }
  if (
    options.invalidZeroField &&
    !canReadNumericField(options.invalidZeroField, pointStride)
  ) {
    throw new Error("Point cloud invalid-return field exceeds point stride");
  }

  return {
    color: packedPointColorLayout(fields, pointStride),
    ...(options.invalidZeroField
      ? { invalidZeroField: options.invalidZeroField }
      : {}),
    scalarFields: scalarFieldsForLayout(fields, pointStride),
    x,
    y,
    z,
  };
}

function packedPointColorLayout(
  fields: readonly PointCloudField[],
  pointStride: number,
): PackedPointColorLayout | null {
  const red = findColorChannel(fields, pointStride, RED_COLOR_CHANNEL_NAMES);
  const green = findColorChannel(
    fields,
    pointStride,
    GREEN_COLOR_CHANNEL_NAMES,
  );
  const blue = findColorChannel(fields, pointStride, BLUE_COLOR_CHANNEL_NAMES);
  if (red && green && blue) {
    return { blue, green, kind: "separate", red };
  }

  const field = fields.find(
    (candidate) =>
      PACKED_COLOR_FIELD_NAMES.includes(normalizedFieldName(candidate.name)) &&
      canReadNumericField(candidate, pointStride) &&
      numericFieldByteWidth(candidate.type) === 4,
  );
  return field ? { field, kind: "packed" } : null;
}

function pointCloudTransform(
  pose: ProtobufPose3D | undefined,
): PackedPointCloudTransform {
  const [px, py, pz] = pose?.position ?? [0, 0, 0];
  const normalized = pose ? normalizedQuaternion(pose.quaternion) : null;
  const [qx, qy, qz, qw] = normalized ?? [0, 0, 0, 1];
  return {
    enabled:
      px !== 0 ||
      py !== 0 ||
      pz !== 0 ||
      qx !== 0 ||
      qy !== 0 ||
      qz !== 0 ||
      qw !== 1,
    px,
    py,
    pz,
    qw,
    qx,
    qy,
    qz,
  };
}

function readPackedPosition(
  view: DataView,
  baseOffset: number,
  layout: PackedPointCloudLayout,
  transform: PackedPointCloudTransform,
  target: MutablePackedPointPosition,
): void {
  const x = view.getFloat32(baseOffset + layout.x.offset, true);
  const y = view.getFloat32(baseOffset + layout.y.offset, true);
  const z = view.getFloat32(baseOffset + layout.z.offset, true);
  if (!transform.enabled) {
    target.x = x;
    target.y = y;
    target.z = z;
    return;
  }

  const { px, py, pz, qw, qx, qy, qz } = transform;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  target.x = px + x + qw * tx + qy * tz - qz * ty;
  target.y = py + y + qw * ty + qz * tx - qx * tz;
  target.z = pz + z + qw * tz + qx * ty - qy * tx;
}

function isInvalidPackedPoint(
  view: DataView,
  baseOffset: number,
  invalidZeroField: PointCloudField | undefined,
): boolean {
  return (
    invalidZeroField !== undefined &&
    readNumericField(
      view,
      baseOffset + invalidZeroField.offset,
      invalidZeroField.type,
    ) === 0
  );
}

function writePackedColor(
  data: Uint8Array,
  view: DataView,
  baseOffset: number,
  colors: Float32Array,
  colorOffset: number,
  layout: PackedPointColorLayout,
): void {
  if (layout.kind === "separate") {
    colors[colorOffset] = normalizeColorChannel(
      readNumericField(view, baseOffset + layout.red.offset, layout.red.type),
      layout.red.type,
    );
    colors[colorOffset + 1] = normalizeColorChannel(
      readNumericField(
        view,
        baseOffset + layout.green.offset,
        layout.green.type,
      ),
      layout.green.type,
    );
    colors[colorOffset + 2] = normalizeColorChannel(
      readNumericField(view, baseOffset + layout.blue.offset, layout.blue.type),
      layout.blue.type,
    );
    return;
  }

  const byteOffset = baseOffset + layout.field.offset;
  colors[colorOffset] = data[byteOffset + 2] / UINT8_MAX_VALUE;
  colors[colorOffset + 1] = data[byteOffset + 1] / UINT8_MAX_VALUE;
  colors[colorOffset + 2] = data[byteOffset] / UINT8_MAX_VALUE;
}

/**
 * Extracts positions, optional RGB colors, and scalar channels from packed
 * point data using the supplied field layout.
 */
export function extractPointCloudData(
  data: Uint8Array,
  pointStride: number,
  fields: readonly PointCloudField[],
): DecodedPointCloudData {
  if (pointStride <= 0) {
    throw new Error(`Invalid point stride ${pointStride}`);
  }

  const x = requiredFloat32Field(fields, "x");
  const y = requiredFloat32Field(fields, "y");
  const z = requiredFloat32Field(fields, "z");

  for (const field of [x, y, z]) {
    if (field.offset < 0 || field.offset + FLOAT32_BYTE_WIDTH > pointStride) {
      throw new Error(`Point cloud '${field.name}' field exceeds point stride`);
    }
  }

  const pointDataByteLength = alignedPointDataByteLength(data, pointStride);
  const pointCount = Math.floor(pointDataByteLength / pointStride);
  const positions = new Float32Array(pointCount * POINT_COMPONENT_COUNT);
  const colors = extractColorField(data, pointStride, pointCount, fields);
  const scalarFields = extractScalarFields(
    data,
    pointStride,
    pointCount,
    fields,
  );
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let index = 0; index < pointCount; index++) {
    const baseOffset = index * pointStride;
    const positionOffset = index * POINT_COMPONENT_COUNT;
    positions[positionOffset + X_COMPONENT_INDEX] = view.getFloat32(
      baseOffset + x.offset,
      true,
    );
    positions[positionOffset + Y_COMPONENT_INDEX] = view.getFloat32(
      baseOffset + y.offset,
      true,
    );
    positions[positionOffset + Z_COMPONENT_INDEX] = view.getFloat32(
      baseOffset + z.offset,
      true,
    );
  }

  return { colors, positions, scalarFields };
}

function alignedPointDataByteLength(
  data: Uint8Array,
  pointStride: number,
): number {
  const alignedByteLength =
    Math.floor(data.byteLength / pointStride) * pointStride;

  if (alignedByteLength === data.byteLength) {
    return data.byteLength;
  }

  if (!isZeroRange(data, alignedByteLength, data.byteLength)) {
    throw new Error("Point cloud data length is not aligned to point stride");
  }

  // Some exports pad fixed-size radar buffers with trailing zero bytes. Treat
  // only the unaligned tail as padding so valid zero-valued points survive.
  return alignedByteLength;
}

function isZeroRange(
  data: Uint8Array,
  startOffset: number,
  endOffset: number,
): boolean {
  for (let offset = startOffset; offset < endOffset; offset++) {
    if (data[offset] !== 0) {
      return false;
    }
  }

  return true;
}

function extractScalarFields(
  data: Uint8Array,
  pointStride: number,
  pointCount: number,
  fields: readonly PointCloudField[],
): readonly PointCloudScalarField[] {
  return scalarFieldsForLayout(fields, pointStride).map((field) => ({
    name: field.name,
    values: extractNumericValues(data, pointStride, pointCount, field),
  }));
}

function scalarFieldsForLayout(
  fields: readonly PointCloudField[],
  pointStride: number,
): readonly PointCloudField[] {
  const canonicalFieldByName = new Map<string, PointCloudField>();
  const additionalFields: PointCloudField[] = [];
  const seenNames = new Set<string>();

  for (const field of fields) {
    const scalarName = normalizedFieldName(field.name);
    if (
      POSITION_FIELD_NAMES.has(scalarName) ||
      COLOR_FIELD_NAMES.has(scalarName) ||
      seenNames.has(scalarName) ||
      !canReadNumericField(field, pointStride)
    ) {
      continue;
    }

    seenNames.add(scalarName);
    if (CANONICAL_SCALAR_FIELD_NAMES.has(scalarName)) {
      canonicalFieldByName.set(scalarName, field);
    } else {
      additionalFields.push(field);
    }
  }

  // Canonical sensor-return channels first (in preference order, so the
  // renderer's auto-color pick stays deterministic), then everything else
  // in declaration order up to the extraction cap.
  const orderedFields: PointCloudField[] = [];
  for (const scalarName of CANONICAL_SCALAR_FIELDS) {
    const field = canonicalFieldByName.get(scalarName);
    if (field) {
      orderedFields.push(field);
    }
  }
  orderedFields.push(...additionalFields);

  return orderedFields.slice(0, MAX_SCALAR_FIELDS);
}

function extractColorField(
  data: Uint8Array,
  pointStride: number,
  pointCount: number,
  fields: readonly PointCloudField[],
): Float32Array | undefined {
  return (
    extractSeparateColorChannels(data, pointStride, pointCount, fields) ??
    extractPackedColorField(data, pointStride, pointCount, fields)
  );
}

function extractSeparateColorChannels(
  data: Uint8Array,
  pointStride: number,
  pointCount: number,
  fields: readonly PointCloudField[],
): Float32Array | undefined {
  const red = findColorChannel(fields, pointStride, RED_COLOR_CHANNEL_NAMES);
  const green = findColorChannel(
    fields,
    pointStride,
    GREEN_COLOR_CHANNEL_NAMES,
  );
  const blue = findColorChannel(fields, pointStride, BLUE_COLOR_CHANNEL_NAMES);
  if (!red || !green || !blue) {
    return undefined;
  }

  const colors = new Float32Array(pointCount * COLOR_COMPONENT_COUNT);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let index = 0; index < pointCount; index++) {
    const baseOffset = index * pointStride;
    const colorOffset = index * COLOR_COMPONENT_COUNT;
    colors[colorOffset] = normalizeColorChannel(
      readNumericField(view, baseOffset + red.offset, red.type),
      red.type,
    );
    colors[colorOffset + 1] = normalizeColorChannel(
      readNumericField(view, baseOffset + green.offset, green.type),
      green.type,
    );
    colors[colorOffset + 2] = normalizeColorChannel(
      readNumericField(view, baseOffset + blue.offset, blue.type),
      blue.type,
    );
  }

  return colors;
}

function extractPackedColorField(
  data: Uint8Array,
  pointStride: number,
  pointCount: number,
  fields: readonly PointCloudField[],
): Float32Array | undefined {
  const field = fields.find(
    (candidate) =>
      PACKED_COLOR_FIELD_NAMES.includes(normalizedFieldName(candidate.name)) &&
      canReadNumericField(candidate, pointStride) &&
      numericFieldByteWidth(candidate.type) === 4,
  );
  if (!field) {
    return undefined;
  }

  const colors = new Float32Array(pointCount * COLOR_COMPONENT_COUNT);

  for (let index = 0; index < pointCount; index++) {
    const byteOffset = index * pointStride + field.offset;
    const colorOffset = index * COLOR_COMPONENT_COUNT;
    // Packed PCL-style rgb/rgba values are commonly stored as little-endian
    // 0xAARRGGBB bytes, even when the field type is FLOAT32.
    colors[colorOffset] = data[byteOffset + 2] / UINT8_MAX_VALUE;
    colors[colorOffset + 1] = data[byteOffset + 1] / UINT8_MAX_VALUE;
    colors[colorOffset + 2] = data[byteOffset] / UINT8_MAX_VALUE;
  }

  return colors;
}

function findColorChannel(
  fields: readonly PointCloudField[],
  pointStride: number,
  names: readonly string[],
): PointCloudField | undefined {
  return fields.find(
    (field) =>
      names.includes(normalizedFieldName(field.name)) &&
      canReadNumericField(field, pointStride),
  );
}

function extractNumericValues(
  data: Uint8Array,
  pointStride: number,
  pointCount: number,
  field: PointCloudField,
): Float32Array {
  const values = new Float32Array(pointCount);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let index = 0; index < pointCount; index++) {
    values[index] = readNumericField(
      view,
      index * pointStride + field.offset,
      field.type,
    );
  }

  return values;
}

function canReadNumericField(
  field: PointCloudField,
  pointStride: number,
): boolean {
  const byteWidth = numericFieldByteWidth(field.type);

  return (
    byteWidth > 0 &&
    field.offset >= 0 &&
    field.offset + byteWidth <= pointStride
  );
}

function readNumericField(
  view: DataView,
  offset: number,
  fieldType: number,
): number {
  switch (fieldType) {
    case UINT8_FIELD_TYPE:
      return view.getUint8(offset);
    case INT8_FIELD_TYPE:
      return view.getInt8(offset);
    case UINT16_FIELD_TYPE:
      return view.getUint16(offset, true);
    case INT16_FIELD_TYPE:
      return view.getInt16(offset, true);
    case UINT32_FIELD_TYPE:
      return view.getUint32(offset, true);
    case INT32_FIELD_TYPE:
      return view.getInt32(offset, true);
    case FLOAT32_FIELD_TYPE:
      return view.getFloat32(offset, true);
    case FLOAT64_FIELD_TYPE:
      return view.getFloat64(offset, true);
    default:
      return Number.NaN;
  }
}

function numericFieldByteWidth(fieldType: number): number {
  switch (fieldType) {
    case UINT8_FIELD_TYPE:
    case INT8_FIELD_TYPE:
      return 1;
    case UINT16_FIELD_TYPE:
    case INT16_FIELD_TYPE:
      return 2;
    case UINT32_FIELD_TYPE:
    case INT32_FIELD_TYPE:
    case FLOAT32_FIELD_TYPE:
      return 4;
    case FLOAT64_FIELD_TYPE:
      return 8;
    default:
      return 0;
  }
}

function normalizeColorChannel(value: number, fieldType: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (fieldType === FLOAT32_FIELD_TYPE || fieldType === FLOAT64_FIELD_TYPE) {
    return clamp01(value > 2 ? value / 255 : value);
  }

  return clamp01(value / integerFieldMaxValue(fieldType));
}

function integerFieldMaxValue(fieldType: number): number {
  switch (fieldType) {
    case UINT16_FIELD_TYPE:
      return UINT16_MAX_VALUE;
    case INT16_FIELD_TYPE:
      return INT16_MAX_VALUE;
    case UINT32_FIELD_TYPE:
      return UINT32_MAX_VALUE;
    case INT32_FIELD_TYPE:
      return INT32_MAX_VALUE;
    case INT8_FIELD_TYPE:
      return INT8_MAX_VALUE;
    default:
      return UINT8_MAX_VALUE;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizedFieldName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function packedFields(values: readonly unknown[]): readonly PointCloudField[] {
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
  fields: readonly PointCloudField[],
  name: string,
): PointCloudField {
  const field = fields.find((candidate) => candidate.name === name);

  if (!field) {
    throw new Error(`Point cloud is missing '${name}' field`);
  }

  if (field.type !== FLOAT32_FIELD_TYPE) {
    throw new Error(`Point cloud '${name}' field must be FLOAT32`);
  }

  return field;
}
