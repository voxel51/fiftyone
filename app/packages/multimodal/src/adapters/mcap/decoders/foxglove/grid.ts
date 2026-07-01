import type {
  DecodedAttributeValue,
  Decoder,
  GridField,
  GridVisualization,
  ScenePose3D,
} from "../../../../decoders";
import { resourceHintsForArrayBufferViews } from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_GRID_PAYLOAD } from "./protobuf/payloads";
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

// Foxglove PackedElementField numeric type id for UINT8.
const UINT8_FIELD_TYPE = 1;
const UINT8_MAX_VALUE = 255;
const RGBA_COMPONENT_COUNT = 4;
const RED_CHANNEL_NAMES = Object.freeze(["r", "red"] as const);
const GREEN_CHANNEL_NAMES = Object.freeze(["g", "green"] as const);
const BLUE_CHANNEL_NAMES = Object.freeze(["b", "blue"] as const);
const ALPHA_CHANNEL_NAMES = Object.freeze(["a", "alpha"] as const);
// Scalar grids (occupancy masks, drivable areas) render as a translucent
// white mask so map layers underneath stay visible: per-cell alpha scales
// with the value normalized against the message's max, capped at ~60%.
// Normalizing per message keeps binary {0,1} masks visible without a
// per-topic value-range configuration.
const SCALAR_FIELD_MAX_ALPHA = 153;

type GridColorMode = "color" | "scalar";

/**
 * Decoder for Foxglove Grid protobuf messages. Emits a normalized RGBA
 * texture: color grids (UINT8 red/green/blue and optional alpha fields in
 * any packed order) are swizzled into RGBA; single-field UINT8 scalar
 * grids are mapped to a translucent white mask. Other field layouts are
 * unsupported.
 */
export const foxgloveGridDecoder: Decoder = {
  id: "foxglove.grid",
  payload: FOXGLOVE_GRID_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_GRID_PAYLOAD,
      context,
    );
    const data = requiredBytes(message, "data");
    const cellSize = decodeCellSize(
      optionalRecord(message, "cellSize", "cell_size"),
    );
    const cellStride = requiredNumber(message, "cellStride", "cell_stride");
    const columnCount = requiredNumber(message, "columnCount", "column_count");
    const rowStride = requiredNumber(message, "rowStride", "row_stride");
    const fields = gridFields(requiredArray(message, "fields"));
    const frameId = optionalString(message, "frameId", "frame_id");
    const messageTimestamp = timestampNs(optionalRecord(message, "timestamp"));
    const pose = decodePose(optionalRecord(message, "pose"));

    validateGridLayout({ cellStride, columnCount, rowStride });
    const rowCount = deriveRowCount(data, rowStride);
    const { colorMode, rgba } = extractGridRgba({
      cellStride,
      columnCount,
      data,
      fields,
      rowCount,
      rowStride,
    });

    const fieldMetadata = fields.map((field) => ({
      name: field.name,
      offset: field.offset,
      type: field.type,
    }));
    const attributes: Record<string, DecodedAttributeValue> = {
      cellSize: [cellSize[0], cellSize[1]],
      cellStride,
      colorMode,
      columnCount,
      fields: fieldMetadata,
      rowCount,
      rowStride,
    };
    if (frameId) {
      attributes.frameId = frameId;
    }

    const visualization: GridVisualization = {
      ...(frameId ? { coordinateFrameId: frameId } : {}),
      cellSize,
      columnCount,
      kind: VISUALIZATION_KIND.GRID,
      pose,
      rgba,
      rowCount,
      ...(messageTimestamp !== undefined
        ? { timestampNs: messageTimestamp }
        : {}),
    };

    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(rgba),
      timing: timingFromContext(context, messageTimestamp),
      visualization,
    };
  },
};

function validateGridLayout({
  cellStride,
  columnCount,
  rowStride,
}: {
  readonly cellStride: number;
  readonly columnCount: number;
  readonly rowStride: number;
}): void {
  if (!Number.isInteger(columnCount) || columnCount <= 0) {
    throw new Error(`Invalid grid column count ${columnCount}`);
  }
  if (!Number.isInteger(cellStride) || cellStride <= 0) {
    throw new Error(`Invalid grid cell stride ${cellStride}`);
  }
  if (!Number.isInteger(rowStride) || rowStride < columnCount * cellStride) {
    throw new Error(
      `Grid row stride ${rowStride} cannot hold ${columnCount} cells of stride ${cellStride}`,
    );
  }
}

function deriveRowCount(data: Uint8Array, rowStride: number): number {
  const rowCount = Math.floor(data.byteLength / rowStride);
  if (rowCount <= 0) {
    throw new Error("Grid data holds no complete rows");
  }

  const alignedByteLength = rowCount * rowStride;
  if (alignedByteLength !== data.byteLength) {
    // Tolerate zero-padded tails (fixed-size export buffers) but reject
    // trailing partial rows that carry data.
    if (!isZeroRange(data, alignedByteLength, data.byteLength)) {
      throw new Error("Grid data length is not aligned to row stride");
    }
  }

  return rowCount;
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

function extractGridRgba({
  cellStride,
  columnCount,
  data,
  fields,
  rowCount,
  rowStride,
}: {
  readonly cellStride: number;
  readonly columnCount: number;
  readonly data: Uint8Array;
  readonly fields: readonly GridField[];
  readonly rowCount: number;
  readonly rowStride: number;
}): { readonly colorMode: GridColorMode; readonly rgba: Uint8Array } {
  const red = findChannel(fields, cellStride, RED_CHANNEL_NAMES);
  const green = findChannel(fields, cellStride, GREEN_CHANNEL_NAMES);
  const blue = findChannel(fields, cellStride, BLUE_CHANNEL_NAMES);

  if (red && green && blue) {
    const alpha = findChannel(fields, cellStride, ALPHA_CHANNEL_NAMES);
    return {
      colorMode: "color",
      rgba: extractColorRgba({
        alpha,
        blue,
        cellStride,
        columnCount,
        data,
        green,
        red,
        rowCount,
        rowStride,
      }),
    };
  }

  const scalar = singleScalarChannel(fields, cellStride);
  if (scalar) {
    return {
      colorMode: "scalar",
      rgba: extractScalarRgba({
        cellStride,
        columnCount,
        data,
        rowCount,
        rowStride,
        scalar,
      }),
    };
  }

  throw new Error(
    `Grid has unsupported fields [${fields
      .map((field) => field.name)
      .join(
        ", ",
      )}]: expected UINT8 red/green/blue channels or one UINT8 scalar field`,
  );
}

function extractColorRgba({
  alpha,
  blue,
  cellStride,
  columnCount,
  data,
  green,
  red,
  rowCount,
  rowStride,
}: {
  readonly alpha: GridField | undefined;
  readonly blue: GridField;
  readonly cellStride: number;
  readonly columnCount: number;
  readonly data: Uint8Array;
  readonly green: GridField;
  readonly red: GridField;
  readonly rowCount: number;
  readonly rowStride: number;
}): Uint8Array {
  const rgba = new Uint8Array(rowCount * columnCount * RGBA_COMPONENT_COUNT);

  let writeOffset = 0;
  for (let row = 0; row < rowCount; row++) {
    const rowOffset = row * rowStride;
    for (let column = 0; column < columnCount; column++) {
      const cellOffset = rowOffset + column * cellStride;
      rgba[writeOffset] = data[cellOffset + red.offset];
      rgba[writeOffset + 1] = data[cellOffset + green.offset];
      rgba[writeOffset + 2] = data[cellOffset + blue.offset];
      rgba[writeOffset + 3] = alpha
        ? data[cellOffset + alpha.offset]
        : UINT8_MAX_VALUE;
      writeOffset += RGBA_COMPONENT_COUNT;
    }
  }

  return rgba;
}

function extractScalarRgba({
  cellStride,
  columnCount,
  data,
  rowCount,
  rowStride,
  scalar,
}: {
  readonly cellStride: number;
  readonly columnCount: number;
  readonly data: Uint8Array;
  readonly rowCount: number;
  readonly rowStride: number;
  readonly scalar: GridField;
}): Uint8Array {
  let maxValue = 0;
  for (let row = 0; row < rowCount; row++) {
    const rowOffset = row * rowStride;
    for (let column = 0; column < columnCount; column++) {
      const value = data[rowOffset + column * cellStride + scalar.offset];
      if (value > maxValue) {
        maxValue = value;
      }
    }
  }

  const rgba = new Uint8Array(rowCount * columnCount * RGBA_COMPONENT_COUNT);
  if (maxValue === 0) {
    return rgba;
  }

  const alphaScale = SCALAR_FIELD_MAX_ALPHA / maxValue;
  let writeOffset = 0;
  for (let row = 0; row < rowCount; row++) {
    const rowOffset = row * rowStride;
    for (let column = 0; column < columnCount; column++) {
      const value = data[rowOffset + column * cellStride + scalar.offset];
      rgba[writeOffset] = UINT8_MAX_VALUE;
      rgba[writeOffset + 1] = UINT8_MAX_VALUE;
      rgba[writeOffset + 2] = UINT8_MAX_VALUE;
      rgba[writeOffset + 3] = Math.round(value * alphaScale);
      writeOffset += RGBA_COMPONENT_COUNT;
    }
  }

  return rgba;
}

function findChannel(
  fields: readonly GridField[],
  cellStride: number,
  names: readonly string[],
): GridField | undefined {
  return fields.find(
    (field) =>
      names.includes(normalizedFieldName(field.name)) &&
      canReadUint8Field(field, cellStride),
  );
}

function singleScalarChannel(
  fields: readonly GridField[],
  cellStride: number,
): GridField | undefined {
  if (fields.length !== 1) {
    return undefined;
  }

  const field = fields[0];
  return field && canReadUint8Field(field, cellStride) ? field : undefined;
}

function canReadUint8Field(field: GridField, cellStride: number): boolean {
  return (
    field.type === UINT8_FIELD_TYPE &&
    Number.isInteger(field.offset) &&
    field.offset >= 0 &&
    field.offset < cellStride
  );
}

function normalizedFieldName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function gridFields(values: readonly unknown[]): readonly GridField[] {
  return values.map((value) => {
    const record = asRecord(value);

    return {
      name: requiredString(record, "name"),
      offset: requiredNumber(record, "offset"),
      type: requiredNumber(record, "type"),
    };
  });
}

function decodeCellSize(
  record: Record<string, unknown> | undefined,
): readonly [number, number] {
  const x = record ? numberField(record, "x") : 0;
  const y = record ? numberField(record, "y") : 0;
  if (!(x > 0) || !(y > 0) || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Invalid grid cell size ${x}x${y}`);
  }

  return [x, y];
}

function decodePose(record: Record<string, unknown> | undefined): ScenePose3D {
  if (!record) {
    return {
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
    };
  }

  const position = optionalRecord(record, "position");
  const orientation = optionalRecord(record, "orientation");

  return {
    position: [
      position ? numberField(position, "x") : 0,
      position ? numberField(position, "y") : 0,
      position ? numberField(position, "z") : 0,
    ],
    quaternion: [
      orientation ? numberField(orientation, "x") : 0,
      orientation ? numberField(orientation, "y") : 0,
      orientation ? numberField(orientation, "z") : 0,
      orientation ? numberField(orientation, "w", 1) : 1,
    ],
  };
}

function numberField(
  record: Record<string, unknown>,
  field: string,
  defaultValue = 0,
): number {
  const value = record[field];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return defaultValue;
}
