import * as THREE from "three";
import type { Points3dBounds } from "./archetypes";
import { decodeFoxglovePointCloudMessage } from "./foxglove-protobuf";
import type { MultimodalPointCloud2DecodeResponse } from "./pointcloud2-decoder";

const NUMERIC_TYPE_UINT8 = 1;
const NUMERIC_TYPE_INT8 = 2;
const NUMERIC_TYPE_UINT16 = 3;
const NUMERIC_TYPE_INT16 = 4;
const NUMERIC_TYPE_UINT32 = 5;
const NUMERIC_TYPE_INT32 = 6;
const NUMERIC_TYPE_FLOAT32 = 7;
const NUMERIC_TYPE_FLOAT64 = 8;

function readFieldValue(view: DataView, byteOffset: number, datatype: number) {
  switch (datatype) {
    case NUMERIC_TYPE_UINT8:
      return view.getUint8(byteOffset);
    case NUMERIC_TYPE_INT8:
      return view.getInt8(byteOffset);
    case NUMERIC_TYPE_UINT16:
      return view.getUint16(byteOffset, true);
    case NUMERIC_TYPE_INT16:
      return view.getInt16(byteOffset, true);
    case NUMERIC_TYPE_UINT32:
      return view.getUint32(byteOffset, true);
    case NUMERIC_TYPE_INT32:
      return view.getInt32(byteOffset, true);
    case NUMERIC_TYPE_FLOAT32:
      return view.getFloat32(byteOffset, true);
    case NUMERIC_TYPE_FLOAT64:
      return view.getFloat64(byteOffset, true);
    default:
      throw new Error(`Unsupported Foxglove PointCloud datatype: ${datatype}`);
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

function createPoseMatrix(
  pose: ReturnType<typeof decodeFoxglovePointCloudMessage>["pose"]
) {
  if (!pose) {
    return null;
  }

  const quaternion = new THREE.Quaternion(
    pose.orientation?.x ?? 0,
    pose.orientation?.y ?? 0,
    pose.orientation?.z ?? 0,
    pose.orientation?.w ?? 1
  );

  if (!quaternion.lengthSq()) {
    quaternion.set(0, 0, 0, 1);
  } else {
    quaternion.normalize();
  }

  return new THREE.Matrix4().compose(
    new THREE.Vector3(
      pose.position?.x ?? 0,
      pose.position?.y ?? 0,
      pose.position?.z ?? 0
    ),
    quaternion,
    new THREE.Vector3(1, 1, 1)
  );
}

/** Decodes one Foxglove protobuf `PointCloud` payload. */
export function decodeFoxglovePointCloudPayload(
  payload: Uint8Array
): MultimodalPointCloud2DecodeResponse {
  const message = decodeFoxglovePointCloudMessage(payload);
  const xField = message.fields.find((field) => field.name === "x");
  const yField = message.fields.find((field) => field.name === "y");
  const zField = message.fields.find((field) => field.name === "z");
  const intensityField =
    message.fields.find((field) => field.name === "intensity") ??
    message.fields.find((field) => field.name === "rcs") ??
    null;

  if (!xField || !yField || !zField) {
    throw new Error("Foxglove PointCloud payload is missing x, y, or z fields");
  }

  const pointStride = Math.max(message.pointStride, 0);
  if (!pointStride) {
    throw new Error("Foxglove PointCloud payload is missing point_stride");
  }

  const pointCount = Math.floor(message.data.byteLength / pointStride);
  const positions = new Float32Array(pointCount * 3);
  const intensities = intensityField ? new Float32Array(pointCount) : null;
  const view = new DataView(
    message.data.buffer,
    message.data.byteOffset,
    message.data.byteLength
  );
  const bounds = createEmptyBounds();
  const poseMatrix = createPoseMatrix(message.pose);
  const transformedPoint = poseMatrix ? new THREE.Vector3() : null;
  let validPointCount = 0;

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const pointBase = pointIndex * pointStride;
    if (pointBase + pointStride > message.data.byteLength) {
      break;
    }

    let x = readFieldValue(
      view,
      pointBase + (xField.offset ?? 0),
      xField.type ?? 0
    );
    let y = readFieldValue(
      view,
      pointBase + (yField.offset ?? 0),
      yField.type ?? 0
    );
    let z = readFieldValue(
      view,
      pointBase + (zField.offset ?? 0),
      zField.type ?? 0
    );

    if (poseMatrix && transformedPoint) {
      transformedPoint.set(x, y, z).applyMatrix4(poseMatrix);
      x = transformedPoint.x;
      y = transformedPoint.y;
      z = transformedPoint.z;
    }

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
        pointBase + (intensityField.offset ?? 0),
        intensityField.type ?? 0
      );
      intensities[validPointCount] = Number.isFinite(intensity) ? intensity : 0;
    }

    validPointCount += 1;
  }

  return {
    messageId: "",
    frame: {
      id: "",
      pointCount: validPointCount,
      bounds: validPointCount > 0 ? bounds : createEmptyBounds(),
      frameId: message.frameId || "",
      primitives: [
        {
          kind: "points",
          id: "points",
          frameId: message.frameId || "",
          pointCount: validPointCount,
          positions: toPointsArray(positions, validPointCount * 3),
          intensity: intensities
            ? toPointsArray(intensities, validPointCount)
            : null,
          colors: null,
          solidColor: null,
          pointSize: null,
        },
      ],
    },
  };
}
