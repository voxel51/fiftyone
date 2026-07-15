import { optionalRecord, numberField } from "./records";

/** Three-component vector decoded from Foxglove protobuf geometry messages. */
export type ProtobufVector3 = readonly [number, number, number];

/** Four-component quaternion decoded from Foxglove protobuf geometry messages. */
export type ProtobufQuaternion = readonly [number, number, number, number];

/** Pose decoded from Foxglove protobuf fields, represented as position plus orientation. */
export interface ProtobufPose3D {
  readonly position: ProtobufVector3;
  readonly quaternion: ProtobufQuaternion;
}

/** Default zero vector used when an optional protobuf vector is absent. */
export const ZERO_VECTOR3: ProtobufVector3 = [0, 0, 0];

/** Default identity orientation used when an optional protobuf quaternion is absent. */
export const IDENTITY_QUATERNION: ProtobufQuaternion = [0, 0, 0, 1];

/** Decode a protobuf vector record with per-component fallback values. */
export function decodeVector3(
  record: Record<string, unknown> | undefined,
  defaultValue: ProtobufVector3 = ZERO_VECTOR3,
): ProtobufVector3 {
  if (!record) return defaultValue;

  return [
    numberField(record, "x", undefined, defaultValue[0]),
    numberField(record, "y", undefined, defaultValue[1]),
    numberField(record, "z", undefined, defaultValue[2]),
  ];
}

/** Decode a protobuf quaternion record with per-component fallback values. */
export function decodeQuaternion(
  record: Record<string, unknown> | undefined,
  defaultValue: ProtobufQuaternion = IDENTITY_QUATERNION,
): ProtobufQuaternion {
  if (!record) return defaultValue;

  return [
    numberField(record, "x", undefined, defaultValue[0]),
    numberField(record, "y", undefined, defaultValue[1]),
    numberField(record, "z", undefined, defaultValue[2]),
    numberField(record, "w", undefined, defaultValue[3]),
  ];
}

/** Decode a Foxglove pose record into shared point-cloud/vector primitives. */
export function decodePose(
  record: Record<string, unknown> | undefined,
): ProtobufPose3D {
  if (!record) {
    return {
      position: ZERO_VECTOR3,
      quaternion: IDENTITY_QUATERNION,
    };
  }

  return {
    position: decodeVector3(optionalRecord(record, "position")),
    quaternion: decodeQuaternion(optionalRecord(record, "orientation")),
  };
}

/**
 * Returns the unit rotation quaternion, or undefined for identity/degenerate
 * rotations (absent orientations decode as all zeros in some Foxglove schemas).
 */
export function normalizedQuaternion(
  quaternion: ProtobufQuaternion,
): ProtobufQuaternion | undefined {
  const [x, y, z, w] = quaternion;
  if (x === 0 && y === 0 && z === 0) {
    return undefined;
  }

  const norm = Math.hypot(x, y, z, w);
  if (!Number.isFinite(norm) || norm === 0) {
    return undefined;
  }

  return [x / norm, y / norm, z / norm, w / norm];
}
