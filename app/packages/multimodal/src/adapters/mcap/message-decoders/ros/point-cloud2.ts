import type {
  DecodeContext,
  PointCloudChannelProjectionRequest,
} from "../../../../decoders/index";
import type {
  DecodedAttributeValue,
  DecodedOutput,
  PointCloudField,
  PointCloudRenderChannelPayload,
} from "../../../../ir/index";
import { resourceHintsForArrayBufferViews } from "../../../../decoders/index";
import { VISUALIZATION_KIND } from "../../../../ir/index";
import {
  extractPointCloudRenderChannel,
  extractPointCloudRenderData,
} from "../foxglove/point-cloud";
import {
  arrayField,
  bytesField,
  integerField,
  numberField,
  optionalBoolean,
  recordField,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  stringField,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_POINT_CLOUD2_PAYLOADS } from "./payloads";

// ROS sensor_msgs/PointField enum values.
const ROS_INT8_FIELD_TYPE = 1;
const ROS_UINT8_FIELD_TYPE = 2;
const ROS_INT16_FIELD_TYPE = 3;
const ROS_UINT16_FIELD_TYPE = 4;
const ROS_INT32_FIELD_TYPE = 5;
const ROS_UINT32_FIELD_TYPE = 6;
const ROS_FLOAT32_FIELD_TYPE = 7;
const ROS_FLOAT64_FIELD_TYPE = 8;

// Foxglove PackedElementField enum values consumed by the shared extractor.
const FOXGLOVE_UINT8_FIELD_TYPE = 1;
const FOXGLOVE_INT8_FIELD_TYPE = 2;
const FOXGLOVE_UINT16_FIELD_TYPE = 3;
const FOXGLOVE_INT16_FIELD_TYPE = 4;
const FOXGLOVE_UINT32_FIELD_TYPE = 5;
const FOXGLOVE_INT32_FIELD_TYPE = 6;
const FOXGLOVE_FLOAT32_FIELD_TYPE = 7;
const FOXGLOVE_FLOAT64_FIELD_TYPE = 8;

const ROS_TO_FOXGLOVE_FIELD_TYPE = new Map<number, number>([
  [ROS_INT8_FIELD_TYPE, FOXGLOVE_INT8_FIELD_TYPE],
  [ROS_UINT8_FIELD_TYPE, FOXGLOVE_UINT8_FIELD_TYPE],
  [ROS_INT16_FIELD_TYPE, FOXGLOVE_INT16_FIELD_TYPE],
  [ROS_UINT16_FIELD_TYPE, FOXGLOVE_UINT16_FIELD_TYPE],
  [ROS_INT32_FIELD_TYPE, FOXGLOVE_INT32_FIELD_TYPE],
  [ROS_UINT32_FIELD_TYPE, FOXGLOVE_UINT32_FIELD_TYPE],
  [ROS_FLOAT32_FIELD_TYPE, FOXGLOVE_FLOAT32_FIELD_TYPE],
  [ROS_FLOAT64_FIELD_TYPE, FOXGLOVE_FLOAT64_FIELD_TYPE],
]);

/**
 * Decoders for ROS PointCloud2 messages.
 */
export const rosPointCloud2Decoders = rosDecodersForPayloads({
  id: "ros.point-cloud2",
  map: decodeRosPointCloud2Record,
  payloads: ROS_POINT_CLOUD2_PAYLOADS,
  projectPointCloudChannel: projectRosPointCloud2Channel,
});

/**
 * Normalizes a decoded ROS PointCloud2 record into point-cloud output.
 */
export function decodeRosPointCloud2Record(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const frameId = rosHeaderFrameId(header);
  const height = integerField(message, "height");
  const width = integerField(message, "width");
  const pointStep = integerField(message, "point_step");
  const rowStep = integerField(message, "row_step");
  validateLayout({ height, pointStep, rowStep, width });
  const originalFields = pointFields(arrayField(message, "fields"));
  const originalFieldMetadata = originalFields.map(
    (field): Record<string, DecodedAttributeValue> => ({
      count: field.count,
      datatype: field.datatype,
      name: field.name,
      offset: field.offset,
    }),
  );
  const attributes: Record<string, DecodedAttributeValue> = {
    ...rosHeaderAttributes(header),
    fields: originalFieldMetadata,
    height,
    pointStep,
    rowStep,
    width,
  };
  const isDense = optionalBoolean(message, "is_dense");
  if (isDense !== undefined) {
    attributes.isDense = isDense;
  }

  if (optionalBoolean(message, "is_bigendian") === true) {
    return {
      attributes: {
        ...attributes,
        bigEndian: true,
        declaredPointCount: height * width,
        unsupportedReason: "ROS PointCloud2 big-endian data is unsupported",
      },
      timing: timingFromRosHeader(context, header),
    };
  }

  const data = flattenPointCloudRows({
    data: bytesField(message, "data"),
    height,
    pointStep,
    rowStep,
    width,
  });
  const fields = originalFields
    .map(mapRosPointField)
    .filter((field): field is PointCloudField => field !== undefined);
  const invalidZeroField = recognizedOusterRangeField({
    fields,
    height,
    originalFields,
    width,
  });
  const decodedPoints = extractPointCloudRenderData(data, pointStep, fields, {
    activeColorBy: context.pointCloudColorBy,
    ...(invalidZeroField ? { invalidZeroField } : {}),
    ...(height > 1 ? { organizedShape: { height, width } } : {}),
    signal: context.signal,
  });
  const pointCount = decodedPoints.renderPayload.sampledPointCount;
  attributes.pointCount = pointCount;
  attributes.sourcePointCount = decodedPoints.sourcePointCount;
  const packedFieldMetadata = fields.map((field) => ({
    name: field.name,
    offset: field.offset,
    type: field.type,
  }));
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
    timing: timingFromRosHeader(context, header),
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

function projectRosPointCloud2Channel(
  message: Record<string, unknown>,
  context: DecodeContext,
  request: PointCloudChannelProjectionRequest,
): PointCloudRenderChannelPayload {
  const height = integerField(message, "height");
  const width = integerField(message, "width");
  const pointStep = integerField(message, "point_step");
  const rowStep = integerField(message, "row_step");
  validateLayout({ height, pointStep, rowStep, width });
  const fields = pointFields(arrayField(message, "fields"))
    .map(mapRosPointField)
    .filter((field): field is PointCloudField => field !== undefined);
  const data = flattenPointCloudRows({
    data: bytesField(message, "data"),
    height,
    pointStep,
    rowStep,
    width,
  });
  return extractPointCloudRenderChannel(data, pointStep, fields, request, {
    signal: context.signal,
  });
}

interface RosPointField {
  readonly count: number;
  readonly datatype: number;
  readonly name: string;
  readonly offset: number;
}

function validateLayout({
  height,
  pointStep,
  rowStep,
  width,
}: {
  readonly height: number;
  readonly pointStep: number;
  readonly rowStep: number;
  readonly width: number;
}): void {
  if (height < 0 || width < 0) {
    throw new Error(`Invalid PointCloud2 dimensions ${width}x${height}`);
  }
  if (pointStep <= 0) {
    throw new Error(`Invalid PointCloud2 point_step ${pointStep}`);
  }
  if (rowStep < width * pointStep) {
    throw new Error(
      `PointCloud2 row_step ${rowStep} cannot hold ${width} points of stride ${pointStep}`,
    );
  }
}

function pointFields(values: readonly unknown[]): readonly RosPointField[] {
  return values.map((value) => {
    const record = recordField({ value }, "value");
    if (!record) {
      throw new Error("PointCloud2 field is not an object");
    }

    const name = stringField(record, "name");
    if (!name) {
      throw new Error("PointCloud2 field is missing a name");
    }

    return {
      count: integerFieldWithDefault(record, "count", 1),
      datatype: integerField(record, "datatype"),
      name,
      offset: integerField(record, "offset"),
    };
  });
}

function integerFieldWithDefault(
  record: Record<string, unknown>,
  field: string,
  defaultValue: number,
): number {
  const value = numberField(record, field, undefined, defaultValue);
  if (!Number.isInteger(value)) {
    throw new Error(`Field '${field}' is not an integer`);
  }

  return value;
}

function mapRosPointField(field: RosPointField): PointCloudField | undefined {
  const type = ROS_TO_FOXGLOVE_FIELD_TYPE.get(field.datatype);
  if (type === undefined) {
    return undefined;
  }

  return {
    name: field.name,
    offset: field.offset,
    type,
  };
}

function recognizedOusterRangeField({
  fields,
  height,
  originalFields,
  width,
}: {
  readonly fields: readonly PointCloudField[];
  readonly height: number;
  readonly originalFields: readonly RosPointField[];
  readonly width: number;
}): PointCloudField | undefined {
  if (height <= 1 || width <= 1) {
    return undefined;
  }

  const byName = new Map(
    originalFields.map((field) => [field.name.toLowerCase(), field]),
  );
  const matches = (name: string, datatype: number): boolean => {
    const field = byName.get(name);
    return field?.count === 1 && field.datatype === datatype;
  };
  const isOusterLayout =
    matches("x", ROS_FLOAT32_FIELD_TYPE) &&
    matches("y", ROS_FLOAT32_FIELD_TYPE) &&
    matches("z", ROS_FLOAT32_FIELD_TYPE) &&
    matches("t", ROS_UINT32_FIELD_TYPE) &&
    matches("ring", ROS_UINT16_FIELD_TYPE) &&
    matches("range", ROS_UINT32_FIELD_TYPE) &&
    matches("signal", ROS_UINT16_FIELD_TYPE) &&
    matches("reflectivity", ROS_UINT16_FIELD_TYPE) &&
    matches("near_ir", ROS_UINT16_FIELD_TYPE);
  return isOusterLayout
    ? fields.find((field) => field.name.toLowerCase() === "range")
    : undefined;
}

function flattenPointCloudRows({
  data,
  height,
  pointStep,
  rowStep,
  width,
}: {
  readonly data: Uint8Array;
  readonly height: number;
  readonly pointStep: number;
  readonly rowStep: number;
  readonly width: number;
}): Uint8Array {
  const rowPointBytes = width * pointStep;
  const expectedByteLength = rowStep * height;
  if (data.byteLength < expectedByteLength) {
    throw new Error(
      `PointCloud2 data has ${data.byteLength} bytes, expected at least ${expectedByteLength}`,
    );
  }
  if (
    data.byteLength > expectedByteLength &&
    !isZeroRange(data, expectedByteLength, data.byteLength)
  ) {
    throw new Error("PointCloud2 data has non-zero bytes after declared rows");
  }

  if (rowPointBytes === 0) {
    return new Uint8Array();
  }
  if (rowPointBytes === rowStep) {
    return data.subarray(0, expectedByteLength);
  }

  const flattened = new Uint8Array(rowPointBytes * height);
  for (let row = 0; row < height; row++) {
    const sourceOffset = row * rowStep;
    const targetOffset = row * rowPointBytes;
    flattened.set(
      data.subarray(sourceOffset, sourceOffset + rowPointBytes),
      targetOffset,
    );
  }

  return flattened;
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
