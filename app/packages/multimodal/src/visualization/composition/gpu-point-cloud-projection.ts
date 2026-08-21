import * as THREE from "three";

export {
  imagePlaneSize as gpuProjectionImagePlaneSize,
  imagePlaneViewportRect as gpuProjectionViewportRect,
} from "../media-2d/image-plane-viewport";

const QUATERNION_EPSILON = 1e-9;

/** Camera intrinsics and image dimensions consumed by GPU projection math. */
export interface GpuProjectionCalibration {
  readonly K?: readonly number[] | null;
  readonly P?: readonly number[] | null;
  readonly R?: readonly number[] | null;
  readonly height: number;
  readonly width: number;
}

/** Sensor-to-camera rotation represented as an xyzw quaternion. */
export interface GpuProjectionRotation {
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Sensor-to-camera translation in metres. */
export interface GpuProjectionTranslation {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Builds the homogeneous sensor-to-calibration-pixel transform consumed by
 * the GPU projection layer. The first two output components are pixel
 * numerators and the third is their shared divisor.
 */
export function sensorToImageProjectionMatrix({
  calibration,
  rotation,
  translation,
}: {
  readonly calibration: GpuProjectionCalibration;
  readonly rotation: GpuProjectionRotation;
  readonly translation: GpuProjectionTranslation;
}): THREE.Matrix4 | null {
  if (!(calibration.width > 0) || !(calibration.height > 0)) {
    return null;
  }

  const projection = projectionRows(calibration);
  if (!projection) {
    return null;
  }

  const sensor = sensorTransformRows(rotation, translation);
  const rectification = finiteRectification(calibration.R);
  const [c00, c01, c02, c10, c11, c12, c20, c21, c22] = rectification;
  const {
    r00: s00,
    r01: s01,
    r02: s02,
    r10: s10,
    r11: s11,
    r12: s12,
    r20: s20,
    r21: s21,
    r22: s22,
    tx: stx,
    ty: sty,
    tz: stz,
  } = sensor;
  const r00 = c00 * s00 + c01 * s10 + c02 * s20;
  const r01 = c00 * s01 + c01 * s11 + c02 * s21;
  const r02 = c00 * s02 + c01 * s12 + c02 * s22;
  const r10 = c10 * s00 + c11 * s10 + c12 * s20;
  const r11 = c10 * s01 + c11 * s11 + c12 * s21;
  const r12 = c10 * s02 + c11 * s12 + c12 * s22;
  const r20 = c20 * s00 + c21 * s10 + c22 * s20;
  const r21 = c20 * s01 + c21 * s11 + c22 * s21;
  const r22 = c20 * s02 + c21 * s12 + c22 * s22;
  const tx = c00 * stx + c01 * sty + c02 * stz;
  const ty = c10 * stx + c11 * sty + c12 * stz;
  const tz = c20 * stx + c21 * sty + c22 * stz;

  const [p00, p01, p02, p03, p10, p11, p12, p13, p20, p21, p22, p23] =
    projection;

  // Precompose P * [R | t] once per layer/frame. Matrix4.set accepts rows;
  // Three stores them column-major internally and the TSL multiply below sees
  // the intended homogeneous transform.
  return new THREE.Matrix4().set(
    p00 * r00 + p01 * r10 + p02 * r20,
    p00 * r01 + p01 * r11 + p02 * r21,
    p00 * r02 + p01 * r12 + p02 * r22,
    p00 * tx + p01 * ty + p02 * tz + p03,
    p10 * r00 + p11 * r10 + p12 * r20,
    p10 * r01 + p11 * r11 + p12 * r21,
    p10 * r02 + p11 * r12 + p12 * r22,
    p10 * tx + p11 * ty + p12 * tz + p13,
    p20 * r00 + p21 * r10 + p22 * r20,
    p20 * r01 + p21 * r11 + p22 * r21,
    p20 * r02 + p21 * r12 + p22 * r22,
    p20 * tx + p21 * ty + p22 * tz + p23,
    0,
    0,
    0,
    1,
  );
}

/** Builds a homogeneous sensor-to-camera transform for distorted models. */
export function sensorToCameraMatrix({
  rotation,
  translation,
}: {
  readonly rotation: GpuProjectionRotation;
  readonly translation: GpuProjectionTranslation;
}): THREE.Matrix4 {
  const transform = sensorTransformRows(rotation, translation);
  return new THREE.Matrix4().set(
    transform.r00,
    transform.r01,
    transform.r02,
    transform.tx,
    transform.r10,
    transform.r11,
    transform.r12,
    transform.ty,
    transform.r20,
    transform.r21,
    transform.r22,
    transform.tz,
    0,
    0,
    0,
    1,
  );
}

/** Stable content key for sharing one prepared cloud frame across image tiles. */
export function gpuPointCloudProjectionResourceKey(
  sourceKey: string,
  topic: string,
  contentTimeNs: bigint,
): string {
  return `${sourceKey}\n${topic}\n${contentTimeNs.toString()}`;
}

/** Stable grow-only GPU buffer identity shared across frame content. */
export function gpuPointCloudProjectionStreamKey(
  sourceKey: string,
  topic: string,
): string {
  return `${sourceKey}\n${topic}`;
}

interface SensorTransformRows {
  readonly r00: number;
  readonly r01: number;
  readonly r02: number;
  readonly r10: number;
  readonly r11: number;
  readonly r12: number;
  readonly r20: number;
  readonly r21: number;
  readonly r22: number;
  readonly tx: number;
  readonly ty: number;
  readonly tz: number;
}

function sensorTransformRows(
  rotation: GpuProjectionRotation,
  translation: GpuProjectionTranslation,
): SensorTransformRows {
  const rotationLength = Math.hypot(
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  );
  const scale = rotationLength > QUATERNION_EPSILON ? 1 / rotationLength : 0;
  const qx = rotation.x * scale;
  const qy = rotation.y * scale;
  const qz = rotation.z * scale;
  const qw = rotationLength > QUATERNION_EPSILON ? rotation.w * scale : 1;
  return {
    r00: 1 - 2 * (qy * qy + qz * qz),
    r01: 2 * (qx * qy - qz * qw),
    r02: 2 * (qx * qz + qy * qw),
    r10: 2 * (qx * qy + qz * qw),
    r11: 1 - 2 * (qx * qx + qz * qz),
    r12: 2 * (qy * qz - qx * qw),
    r20: 2 * (qx * qz - qy * qw),
    r21: 2 * (qy * qz + qx * qw),
    r22: 1 - 2 * (qx * qx + qy * qy),
    tx: translation.x,
    ty: translation.y,
    tz: translation.z,
  };
}

function finiteRectification(
  rectification: readonly number[] | null | undefined,
): readonly number[] {
  if (
    rectification &&
    rectification.length >= 9 &&
    rectification.slice(0, 9).every(Number.isFinite)
  ) {
    return rectification;
  }
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

function projectionRows(
  calibration: Pick<GpuProjectionCalibration, "K" | "P">,
): readonly number[] | null {
  const projection = calibration.P;
  // Prefer the rectified 3x4 projection matrix when usable: it may encode
  // principal-point and baseline terms not present in K. Fall back to K as a
  // zero-translation 3x4 matrix for producers that omit P.
  if (
    projection &&
    projection.length >= 12 &&
    hasUsableFocals(projection[0], projection[5])
  ) {
    const row = projection.slice(0, 12);
    if (isFiniteRow(row)) return row;
  }

  const intrinsic = calibration.K;
  if (
    intrinsic &&
    intrinsic.length >= 9 &&
    hasUsableFocals(intrinsic[0], intrinsic[4])
  ) {
    const row = [
      intrinsic[0],
      intrinsic[1],
      intrinsic[2],
      0,
      intrinsic[3],
      intrinsic[4],
      intrinsic[5],
      0,
      intrinsic[6],
      intrinsic[7],
      intrinsic[8],
      0,
    ];
    if (isFiniteRow(row)) return row;
  }

  return null;
}

function isFiniteRow(row: readonly number[]): boolean {
  return row.every(Number.isFinite);
}

function hasUsableFocals(fx: number, fy: number): boolean {
  return Number.isFinite(fx) && Number.isFinite(fy) && fx !== 0 && fy !== 0;
}
