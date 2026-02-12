import type { EulerOrder } from "three";
import { eulerToQuaternion, quaternionToEuler } from "../../utils";

/**
 * Converts radians to degrees.
 *
 * @param radians - The angle in radians
 * @returns The angle in degrees
 */
export const rad2deg = (radians: number): number => radians * (180 / Math.PI);

/**
 * Normalizes an angle to be within ±180 degrees of a reference angle.
 * This helps maintain continuity when angles cross the ±180° boundary.
 *
 * @param angle - The angle to normalize (in degrees)
 * @param reference - The reference angle to stay close to (in degrees)
 * @returns The normalized angle closest to the reference
 */
function normalizeAngleToReference(angle: number, reference: number): number {
  // Normalize the difference to [-180, 180]
  let diff = angle - reference;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return reference + diff;
}

/**
 * Computes the dot product of two quaternions.
 * Used to measure similarity between quaternions.
 */
function quaternionDot(
  q1: [number, number, number, number],
  q2: [number, number, number, number]
): number {
  return q1[0] * q2[0] + q1[1] * q2[1] + q1[2] * q2[2] + q1[3] * q2[3];
}

/**
 * Negates a quaternion. Since q and -q represent the same rotation,
 * we can choose whichever is closer to a reference quaternion.
 */
function negateQuaternion(
  q: [number, number, number, number]
): [number, number, number, number] {
  return [-q[0], -q[1], -q[2], -q[3]];
}

/**
 * Converts a quaternion to Euler angles (in degrees) with polarity stabilization.
 *
 * This function addresses two sources of discontinuity in Euler angles:
 *
 * 1. **Quaternion double-cover**: q and -q represent the same rotation but can
 *    produce very different Euler angles. We choose the quaternion closer to
 *    the previous orientation.
 *
 * 2. **Angle wrapping**: Angles can jump between equivalent representations
 *    (e.g., 179° to -181°). We normalize each angle to stay within ±180° of
 *    the previous value.
 *
 * @param quaternion - Quaternion as [x, y, z, w] array
 * @param previousEuler - Optional previous Euler angles for continuity (in degrees)
 * @param order - The order of rotations (default: 'XYZ')
 * @returns Array of [x, y, z] Euler angles in degrees
 */
export function quaternionToEulerStable(
  quaternion: [number, number, number, number],
  previousEuler?: [number, number, number],
  order: EulerOrder = "XYZ"
): [number, number, number] {
  if (!previousEuler) {
    return quaternionToEuler(quaternion, order);
  }

  // Convert previous Euler to quaternion for comparison
  const prevQuaternion = eulerToQuaternion(previousEuler, order);

  // Check if q or -q is closer to the previous quaternion
  // (quaternions q and -q represent the same rotation)
  const dotPositive = quaternionDot(quaternion, prevQuaternion);
  const useNegated = dotPositive < 0;

  // Use the quaternion that's closer to previous (higher dot product = more similar)
  const stableQuaternion = useNegated
    ? negateQuaternion(quaternion)
    : quaternion;

  // Convert to Euler
  const newEuler = quaternionToEuler(stableQuaternion, order);

  // Normalize each angle to be within ±180° of the previous value
  // This prevents jumps when crossing the ±180° boundary
  return [
    normalizeAngleToReference(newEuler[0], previousEuler[0]),
    normalizeAngleToReference(newEuler[1], previousEuler[1]),
    normalizeAngleToReference(newEuler[2], previousEuler[2]),
  ];
}

/**
 * Formats radians to 2 decimal places.
 *
 * @param radians - The angle in radians (may be undefined)
 * @returns Formatted string representation, or empty string if invalid
 */
export const formatRadians = (radians: number | undefined): string => {
  if (radians === undefined || !Number.isFinite(radians)) return "";
  return radians.toFixed(2);
};

/**
 * Formats radians as degrees (rounded to integer).
 *
 * @param radians - The angle in radians (may be undefined)
 * @returns Formatted string representation of degrees, or empty string if invalid
 */
export const formatDegrees = (radians: number | undefined): string => {
  if (radians === undefined || !Number.isFinite(radians)) return "";
  return Math.round(rad2deg(radians)).toString();
};
