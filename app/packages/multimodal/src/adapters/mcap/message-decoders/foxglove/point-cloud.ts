import type {
  DecodeContext,
  Decoder,
  PointCloudChannelProjectionRequest,
} from "../../../../decoders/index";
import type {
  DecodedAttributeValue,
  DecodedOutput,
  PointCloudChannelEncoding,
  PointCloudField,
  PointCloudRenderPayload,
  PointCloudRenderChannelPayload,
  PointCloudRenderRgbChannel,
  PointCloudRenderScalarField,
} from "../../../../ir/index";
import { resourceHintsForArrayBufferViews } from "../../../../decoders/index";
import {
  createPointCloudChannelArray,
  isFinitePointCloudPosition,
  MAX_POINT_CLOUD_RENDER_POINTS,
  POINT_CLOUD_FLOAT32_SCALAR_ENCODING,
  POINT_CLOUD_RGB_ENCODING,
  pointCloudNativeIntegerScalarEncoding,
  pointCloudSampleDomainSize,
  pointCloudSamplePlanKey,
  pointCloudRenderCapacity,
  progressivePointCloudSourceIndex,
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

  projectPointCloudChannel(bytes, context, request) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_POINT_CLOUD_PAYLOAD,
      context,
    );
    return projectFoxglovePointCloudChannelRecord(message, context, request);
  },
};

/**
 * Decoders for Foxglove PointCloud messages carried over ROS 2 CDR.
 */
export const foxglovePointCloudCdrDecoders = rosDecodersForPayloads({
  id: "foxglove.point-cloud.cdr",
  map: decodeFoxglovePointCloudRecord,
  payloads: FOXGLOVE_POINT_CLOUD_CDR_PAYLOADS,
  projectPointCloudChannel: projectFoxglovePointCloudChannelRecord,
});

export function decodeFoxglovePointCloudRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const data = requiredBytes(message, "data");
  const pointStride = requiredNumber(message, "pointStride", "point_stride");
  const fields = packedFields(requiredArray(message, "fields"));
  const decodedPoints = extractPointCloudRenderData(data, pointStride, fields, {
    activeColorBy: context.pointCloudColorBy,
    pose: decodePose(optionalRecord(message, "pose")),
    signal: context.signal,
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

  const transferableViews: ArrayBufferView[] = [
    renderPayload.positions,
    ...renderPayload.scalarFields.map((field) => field.values),
    renderPayload.sourceIndices,
  ];
  if (renderPayload.rgb) {
    transferableViews.push(renderPayload.rgb.values);
  }

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(...transferableViews),
    timing: timingFromContext(context, messageTimestamp),
    visualization: {
      ...(frameId ? { coordinateFrameId: frameId } : {}),
      fields: packedFieldMetadata,
      kind: VISUALIZATION_KIND.POINT_CLOUD,
      pointCount,
      positions: decodedPoints.positions,
      renderPayload,
    },
  };
}

function projectFoxglovePointCloudChannelRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
  request: PointCloudChannelProjectionRequest,
): PointCloudRenderChannelPayload {
  return extractPointCloudRenderChannel(
    requiredBytes(message, "data"),
    requiredNumber(message, "pointStride", "point_stride"),
    packedFields(requiredArray(message, "fields")),
    request,
    {
      pose: decodePose(optionalRecord(message, "pose")),
      signal: context.signal,
    },
  );
}

/**
 * Render-native packed point-cloud projection. Positions expose a sampled
 * compatibility view; encoded RGB/scalars remain solely in `renderPayload`
 * so no widened duplicate channel arrays are allocated.
 */
export interface DecodedPointCloudRenderData {
  readonly positions: Float32Array;
  readonly renderPayload: PointCloudRenderPayload;
  readonly sourcePointCount: number;
}

export interface PackedPointCloudProjectionOptions {
  /** Only this color source is expanded into the render payload. */
  readonly activeColorBy?: string;
  /**
   * A numeric field whose zero value marks an invalid return. Callers must
   * provide this only after recognizing a sensor-specific packed layout.
   */
  readonly invalidZeroField?: PointCloudField;
  /**
   * Row-major sensor shape. When it matches the packed record count, samples
   * follow a nested 2D lattice that spreads prefixes across both axes.
   */
  readonly organizedShape?: {
    readonly height: number;
    readonly width: number;
  };
  readonly pose?: ProtobufPose3D;
  readonly signal?: AbortSignal;
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
  const activeChannel = activePackedPointCloudChannel(
    layout,
    options.activeColorBy,
  );
  const scalarStats =
    activeChannel?.kind === "scalar"
      ? [
          {
            field: activeChannel.field,
            finiteValueCount: 0,
            max: -Infinity,
            min: Infinity,
          },
        ]
      : [];
  let finitePointCount = 0;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  const position = { x: 0, y: 0, z: 0 };

  for (let pointIndex = 0; pointIndex < sourcePointCount; pointIndex++) {
    throwIfPointCloudProjectionCancelled(options.signal, pointIndex);
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
  const rgb: PointCloudRenderRgbChannel | undefined =
    activeChannel?.kind === "rgb"
      ? {
          encoding: POINT_CLOUD_RGB_ENCODING,
          values: new Uint8Array(capacity * COLOR_COMPONENT_COUNT),
        }
      : undefined;
  const scalarFields: PointCloudRenderScalarField[] = scalarStats.map(
    ({ field, finiteValueCount, max, min }) => {
      const encoding = scalarEncodingForField(field);
      return {
        encoding,
        finiteValueCount,
        name: field.name,
        range: finiteValueCount > 0 ? { max, min } : null,
        values: createPointCloudChannelArray(encoding, capacity),
      };
    },
  );
  const sourceIndices = new Uint32Array(capacity);

  let sampleIndex = 0;
  const organizedSampleOrder = createOrganizedPointCloudSampleOrder(
    sourcePointCount,
    options.organizedShape,
  );
  const sampleDomainSize =
    organizedSampleOrder?.pointCount ??
    pointCloudSampleDomainSize(sourcePointCount);
  for (
    let sequenceIndex = 0;
    sequenceIndex < sampleDomainSize && sampleIndex < sampledPointCount;
    sequenceIndex++
  ) {
    throwIfPointCloudProjectionCancelled(options.signal, sequenceIndex);
    const pointIndex = organizedSampleOrder
      ? organizedPointCloudSourceIndex(sequenceIndex, organizedSampleOrder)
      : progressivePointCloudSourceIndex(sequenceIndex, sampleDomainSize);
    if (pointIndex >= sourcePointCount) {
      continue;
    }
    const baseOffset = pointIndex * pointStride;
    if (isInvalidPackedPoint(view, baseOffset, layout.invalidZeroField)) {
      continue;
    }
    readPackedPosition(view, baseOffset, layout, transform, position);
    if (!isFinitePointCloudPosition(position.x, position.y, position.z)) {
      continue;
    }

    const positionOffset = sampleIndex * POINT_COMPONENT_COUNT;
    positions[positionOffset] = position.x;
    positions[positionOffset + 1] = position.y;
    positions[positionOffset + 2] = position.z;
    if (rgb && activeChannel?.kind === "rgb") {
      writePackedColor(
        data,
        view,
        baseOffset,
        rgb.values,
        positionOffset,
        activeChannel.color,
      );
    }
    for (let fieldIndex = 0; fieldIndex < scalarStats.length; fieldIndex++) {
      const field = scalarStats[fieldIndex].field;
      scalarFields[fieldIndex].values[sampleIndex] = readNumericField(
        view,
        baseOffset + field.offset,
        field.type,
      );
    }
    sourceIndices[sampleIndex] = pointIndex;
    sampleIndex++;
  }

  const renderPayload: PointCloudRenderPayload = {
    availableScalarFields: layout.scalarFields.map((field) => field.name),
    bounds:
      finitePointCount > 0
        ? { max: [maxX, maxY, maxZ], min: [minX, minY, minZ] }
        : null,
    capacity,
    finitePointCount,
    hasRgb: layout.color !== null,
    heightRange: finitePointCount > 0 ? { max: maxZ, min: minZ } : null,
    positions,
    ...(rgb ? { rgb } : {}),
    sampledPointCount,
    samplePlanKey: pointCloudSamplePlanKey(sourcePointCount, sampledPointCount),
    scalarFields,
    sourceIndices,
    sourcePointCount,
  };
  const sampledComponentCount = sampledPointCount * POINT_COMPONENT_COUNT;

  return {
    positions: positions.subarray(0, sampledComponentCount),
    renderPayload,
    sourcePointCount,
  };
}

/**
 * Projects only one requested color source at an existing geometry plan's
 * source indices. XYZ and bounds are neither read nor rebuilt.
 */
export function extractPointCloudRenderChannel(
  data: Uint8Array,
  pointStride: number,
  fields: readonly PointCloudField[],
  request: PointCloudChannelProjectionRequest,
  options: Pick<PackedPointCloudProjectionOptions, "pose" | "signal"> = {},
): PointCloudRenderChannelPayload {
  const layout = pointCloudLayout(pointStride, fields, options);
  const channel = activePackedPointCloudChannel(layout, request.activeColorBy);
  if (!channel) {
    return { kind: "none", samplePlanKey: request.samplePlanKey };
  }

  const pointDataByteLength = alignedPointDataByteLength(data, pointStride);
  const sourcePointCount = Math.floor(pointDataByteLength / pointStride);
  const sampledPointCount = Math.min(
    Math.max(0, Math.floor(request.sampledPointCount)),
    request.sourceIndices.length,
  );
  const capacity = Math.max(
    sampledPointCount,
    Math.max(0, Math.floor(request.capacity)),
  );
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (channel.kind === "rgb") {
    const rgb: PointCloudRenderRgbChannel = {
      encoding: POINT_CLOUD_RGB_ENCODING,
      values: new Uint8Array(capacity * COLOR_COMPONENT_COUNT),
    };
    for (let sampleIndex = 0; sampleIndex < sampledPointCount; sampleIndex++) {
      throwIfPointCloudProjectionCancelled(options.signal, sampleIndex);
      const pointIndex = request.sourceIndices[sampleIndex];
      if (pointIndex >= sourcePointCount) continue;
      const baseOffset = pointIndex * pointStride;
      writePackedColor(
        data,
        view,
        baseOffset,
        rgb.values,
        sampleIndex * COLOR_COMPONENT_COUNT,
        channel.color,
      );
    }
    return { kind: "rgb", rgb, samplePlanKey: request.samplePlanKey };
  }

  const preservesNativeIntegers = pointCloudSampleIndicesAreAddressable(
    request.sourceIndices,
    sampledPointCount,
    sourcePointCount,
  );
  const encoding = preservesNativeIntegers
    ? scalarEncodingForField(channel.field)
    : POINT_CLOUD_FLOAT32_SCALAR_ENCODING;
  const values = createPointCloudChannelArray(encoding, capacity);
  let finiteValueCount = 0;
  let max = -Infinity;
  let min = Infinity;
  for (let sampleIndex = 0; sampleIndex < sampledPointCount; sampleIndex++) {
    throwIfPointCloudProjectionCancelled(options.signal, sampleIndex);
    const pointIndex = request.sourceIndices[sampleIndex];
    const value =
      pointIndex < sourcePointCount
        ? readNumericField(
            view,
            pointIndex * pointStride + channel.field.offset,
            channel.field.type,
          )
        : Number.NaN;
    values[sampleIndex] = value;
    if (!Number.isFinite(value)) continue;
    finiteValueCount++;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return {
    kind: "scalar",
    samplePlanKey: request.samplePlanKey,
    scalarField: {
      encoding,
      finiteValueCount,
      name: channel.field.name,
      range: finiteValueCount > 0 ? { max, min } : null,
      values,
    },
  };
}

interface MutablePackedPointPosition {
  x: number;
  y: number;
  z: number;
}

interface OrganizedPointCloudSampleOrder {
  readonly columnStride: number;
  readonly height: number;
  readonly pointCount: number;
  readonly rowStride: number;
  readonly width: number;
}

function createOrganizedPointCloudSampleOrder(
  pointCount: number,
  shape: PackedPointCloudProjectionOptions["organizedShape"],
): OrganizedPointCloudSampleOrder | null {
  if (
    !shape ||
    !Number.isInteger(shape.height) ||
    !Number.isInteger(shape.width) ||
    shape.height <= 1 ||
    shape.width <= 0 ||
    shape.height * shape.width !== pointCount
  ) {
    return null;
  }
  return {
    columnStride: goldenCoprimeStride(shape.width),
    height: shape.height,
    pointCount,
    rowStride: goldenCoprimeStride(shape.height),
    width: shape.width,
  };
}

/**
 * Enumerates every cell once. Within each row phase, coprime strides move
 * early samples across scan rows and columns instead of tracing a stripe.
 */
function organizedPointCloudSourceIndex(
  sequenceIndex: number,
  order: OrganizedPointCloudSampleOrder,
): number {
  const rowPhase = sequenceIndex % order.height;
  const columnPhase = Math.floor(sequenceIndex / order.height);
  const row = (rowPhase * order.rowStride) % order.height;
  const column = (columnPhase + rowPhase * order.columnStride) % order.width;
  return row * order.width + column;
}

function goldenCoprimeStride(size: number): number {
  let stride = Math.max(1, Math.floor(size * 0.6180339887498949));
  while (greatestCommonDivisor(stride, size) !== 1) {
    stride++;
  }
  return stride;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
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

type ActivePackedPointCloudChannel =
  | {
      readonly color: PackedPointColorLayout;
      readonly kind: "rgb";
    }
  | {
      readonly field: PointCloudField;
      readonly kind: "scalar";
    };

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

function activePackedPointCloudChannel(
  layout: PackedPointCloudLayout,
  requestedColorBy = "auto",
): ActivePackedPointCloudChannel | null {
  const colorBy = normalizedFieldName(requestedColorBy);
  if (colorBy === "height" || colorBy === "uniform") return null;
  if (colorBy === "rgb") {
    return layout.color ? { color: layout.color, kind: "rgb" } : null;
  }
  if (colorBy === "auto") {
    if (layout.color) return { color: layout.color, kind: "rgb" };
    const canonical = layout.scalarFields.find((field) =>
      CANONICAL_SCALAR_FIELD_NAMES.has(normalizedFieldName(field.name)),
    );
    return canonical ? { field: canonical, kind: "scalar" } : null;
  }

  const field = layout.scalarFields.find(
    (candidate) => normalizedFieldName(candidate.name) === colorBy,
  );
  return field ? { field, kind: "scalar" } : null;
}

const POINT_CLOUD_CANCEL_CHECK_INTERVAL = 4_096;

function throwIfPointCloudProjectionCancelled(
  signal: AbortSignal | undefined,
  iteration: number,
): void {
  if (iteration % POINT_CLOUD_CANCEL_CHECK_INTERVAL === 0 && signal?.aborted) {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  }
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
  colors: Uint8Array,
  colorOffset: number,
  layout: PackedPointColorLayout,
): void {
  if (layout.kind === "separate") {
    colors[colorOffset] = colorChannelByte(
      readNumericField(view, baseOffset + layout.red.offset, layout.red.type),
      layout.red.type,
    );
    colors[colorOffset + 1] = colorChannelByte(
      readNumericField(
        view,
        baseOffset + layout.green.offset,
        layout.green.type,
      ),
      layout.green.type,
    );
    colors[colorOffset + 2] = colorChannelByte(
      readNumericField(view, baseOffset + layout.blue.offset, layout.blue.type),
      layout.blue.type,
    );
    return;
  }

  const byteOffset = baseOffset + layout.field.offset;
  colors[colorOffset] = data[byteOffset + 2];
  colors[colorOffset + 1] = data[byteOffset + 1];
  colors[colorOffset + 2] = data[byteOffset];
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

function scalarEncodingForField(
  field: PointCloudField,
): PointCloudChannelEncoding & { readonly componentCount: 1 } {
  switch (field.type) {
    case INT8_FIELD_TYPE:
      return pointCloudNativeIntegerScalarEncoding("int8");
    case UINT8_FIELD_TYPE:
      return pointCloudNativeIntegerScalarEncoding("uint8");
    case INT16_FIELD_TYPE:
      return pointCloudNativeIntegerScalarEncoding("int16");
    case UINT16_FIELD_TYPE:
      return pointCloudNativeIntegerScalarEncoding("uint16");
    case INT32_FIELD_TYPE:
      return pointCloudNativeIntegerScalarEncoding("int32");
    case UINT32_FIELD_TYPE:
      return pointCloudNativeIntegerScalarEncoding("uint32");
    default:
      return POINT_CLOUD_FLOAT32_SCALAR_ENCODING;
  }
}

function pointCloudSampleIndicesAreAddressable(
  sourceIndices: Uint32Array,
  sampledPointCount: number,
  sourcePointCount: number,
): boolean {
  for (let sampleIndex = 0; sampleIndex < sampledPointCount; sampleIndex++) {
    if (sourceIndices[sampleIndex] >= sourcePointCount) {
      return false;
    }
  }
  return true;
}

function colorChannelByte(value: number, fieldType: number): number {
  return Math.round(normalizeColorChannel(value, fieldType) * UINT8_MAX_VALUE);
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
