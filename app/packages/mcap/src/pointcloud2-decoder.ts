import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";
import type { Points3dBounds, Points3dFrame } from "./archetypes";

const POINT_CLOUD2_DEFINITION = `sensor_msgs/msg/Header header
uint32 height
uint32 width
sensor_msgs/msg/PointField[] fields
bool is_bigendian
uint32 point_step
uint32 row_step
uint8[] data
bool is_dense
================================================================================
MSG: sensor_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec
================================================================================
MSG: sensor_msgs/msg/PointField
uint8 INT8=1
uint8 UINT8=2
uint8 INT16=3
uint8 UINT16=4
uint8 INT32=5
uint8 UINT32=6
uint8 FLOAT32=7
uint8 FLOAT64=8
string name
uint32 offset
uint8 datatype
uint32 count`;

type PointFieldMessage = {
  name: string;
  offset: number;
  datatype: number;
  count: number;
};

type PointCloud2Message = {
  height: number;
  width: number;
  fields: PointFieldMessage[];
  is_bigendian: boolean;
  point_step: number;
  row_step: number;
  data: Uint8Array;
  is_dense: boolean;
};

const pointCloud2Reader = new MessageReader<PointCloud2Message>(
  parse(POINT_CLOUD2_DEFINITION, { ros2: true })
);

const DATATYPE_INT8 = 1;
const DATATYPE_UINT8 = 2;
const DATATYPE_INT16 = 3;
const DATATYPE_UINT16 = 4;
const DATATYPE_INT32 = 5;
const DATATYPE_UINT32 = 6;
const DATATYPE_FLOAT32 = 7;
const DATATYPE_FLOAT64 = 8;

function readFieldValue(
  view: DataView,
  byteOffset: number,
  datatype: number,
  littleEndian: boolean
) {
  switch (datatype) {
    case DATATYPE_INT8:
      return view.getInt8(byteOffset);
    case DATATYPE_UINT8:
      return view.getUint8(byteOffset);
    case DATATYPE_INT16:
      return view.getInt16(byteOffset, littleEndian);
    case DATATYPE_UINT16:
      return view.getUint16(byteOffset, littleEndian);
    case DATATYPE_INT32:
      return view.getInt32(byteOffset, littleEndian);
    case DATATYPE_UINT32:
      return view.getUint32(byteOffset, littleEndian);
    case DATATYPE_FLOAT32:
      return view.getFloat32(byteOffset, littleEndian);
    case DATATYPE_FLOAT64:
      return view.getFloat64(byteOffset, littleEndian);
    default:
      throw new Error(`Unsupported PointCloud2 datatype: ${datatype}`);
  }
}

function createEmptyBounds(): Points3dBounds {
  return {
    min: [0, 0, 0],
    max: [0, 0, 0],
  };
}

function toPointsArray(values: Float32Array, usedValues: number) {
  return values.slice(0, usedValues);
}

/** Worker request payload for one raw `PointCloud2` MCAP message. */
export type McapPointCloud2DecodeRequest = {
  messageId: string;
  payload: ArrayBuffer;
};

/** Worker response payload for one decoded `PointCloud2` message. */
export type McapPointCloud2DecodeResponse = {
  messageId: string;
  frame: Points3dFrame;
};

/** Decodes one ROS2 CDR `sensor_msgs/msg/PointCloud2` payload. */
export function decodePointCloud2Payload(
  payload: Uint8Array
): McapPointCloud2DecodeResponse {
  const message = pointCloud2Reader.readMessage<PointCloud2Message>(payload);
  const xField = message.fields.find((field) => field.name === "x");
  const yField = message.fields.find((field) => field.name === "y");
  const zField = message.fields.find((field) => field.name === "z");
  const intensityField =
    message.fields.find((field) => field.name === "intensity") ?? null;

  if (!xField || !yField || !zField) {
    throw new Error("PointCloud2 payload is missing x, y, or z fields");
  }

  const data =
    message.data instanceof Uint8Array
      ? message.data
      : Uint8Array.from(message.data ?? []);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const littleEndian = !message.is_bigendian;
  const width = Math.max(message.width ?? 0, 0);
  const height = Math.max(message.height ?? 1, 1);
  const pointStep = Math.max(message.point_step ?? 0, 0);
  const rowStep = Math.max(message.row_step ?? 0, width * pointStep);
  const maxPointCount = width * height;
  const positions = new Float32Array(maxPointCount * 3);
  const intensities = intensityField ? new Float32Array(maxPointCount) : null;
  let validPointCount = 0;
  const bounds = createEmptyBounds();

  for (let row = 0; row < height; row += 1) {
    const rowBase = row * rowStep;

    for (let column = 0; column < width; column += 1) {
      const pointBase = rowBase + column * pointStep;

      if (pointBase + pointStep > data.byteLength) {
        break;
      }

      const x = readFieldValue(
        view,
        pointBase + xField.offset,
        xField.datatype,
        littleEndian
      );
      const y = readFieldValue(
        view,
        pointBase + yField.offset,
        yField.datatype,
        littleEndian
      );
      const z = readFieldValue(
        view,
        pointBase + zField.offset,
        zField.datatype,
        littleEndian
      );

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        continue;
      }

      const positionBase = validPointCount * 3;
      positions[positionBase] = x;
      positions[positionBase + 1] = y;
      positions[positionBase + 2] = z;

      if (validPointCount === 0) {
        bounds.min = [x, y, z];
        bounds.max = [x, y, z];
      } else {
        bounds.min[0] = Math.min(bounds.min[0], x);
        bounds.min[1] = Math.min(bounds.min[1], y);
        bounds.min[2] = Math.min(bounds.min[2], z);
        bounds.max[0] = Math.max(bounds.max[0], x);
        bounds.max[1] = Math.max(bounds.max[1], y);
        bounds.max[2] = Math.max(bounds.max[2], z);
      }

      if (intensityField && intensities) {
        const intensity = readFieldValue(
          view,
          pointBase + intensityField.offset,
          intensityField.datatype,
          littleEndian
        );
        intensities[validPointCount] = Number.isFinite(intensity)
          ? intensity
          : 0;
      }

      validPointCount += 1;
    }
  }

  return {
    messageId: "",
    frame: {
      id: "",
      pointCount: validPointCount,
      positions: toPointsArray(positions, validPointCount * 3),
      intensity: intensities
        ? toPointsArray(intensities, validPointCount)
        : null,
      bounds: validPointCount > 0 ? bounds : createEmptyBounds(),
    },
  };
}
