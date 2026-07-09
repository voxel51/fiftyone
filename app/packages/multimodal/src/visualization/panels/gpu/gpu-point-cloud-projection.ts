import * as THREE from "three";

import type { ImageViewTransform } from "../base-2d-scene";

const QUATERNION_EPSILON = 1e-9;

/** Camera intrinsics and image dimensions consumed by GPU projection math. */
export interface GpuProjectionCalibration {
  readonly K?: readonly number[] | null;
  readonly P?: readonly number[] | null;
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

  const r00 = 1 - 2 * (qy * qy + qz * qz);
  const r01 = 2 * (qx * qy - qz * qw);
  const r02 = 2 * (qx * qz + qy * qw);
  const r10 = 2 * (qx * qy + qz * qw);
  const r11 = 1 - 2 * (qx * qx + qz * qz);
  const r12 = 2 * (qy * qz - qx * qw);
  const r20 = 2 * (qx * qz - qy * qw);
  const r21 = 2 * (qy * qz + qx * qw);
  const r22 = 1 - 2 * (qx * qx + qy * qy);

  const [p00, p01, p02, p03, p10, p11, p12, p13, p20, p21, p22, p23] =
    projection;

  return new THREE.Matrix4().set(
    p00 * r00 + p01 * r10 + p02 * r20,
    p00 * r01 + p01 * r11 + p02 * r21,
    p00 * r02 + p01 * r12 + p02 * r22,
    p00 * translation.x + p01 * translation.y + p02 * translation.z + p03,
    p10 * r00 + p11 * r10 + p12 * r20,
    p10 * r01 + p11 * r11 + p12 * r21,
    p10 * r02 + p11 * r12 + p12 * r22,
    p10 * translation.x + p11 * translation.y + p12 * translation.z + p13,
    p20 * r00 + p21 * r10 + p22 * r20,
    p20 * r01 + p21 * r11 + p22 * r21,
    p20 * r02 + p21 * r12 + p22 * r22,
    p20 * translation.x + p21 * translation.y + p22 * translation.z + p23,
    0,
    0,
    0,
    1,
  );
}

/** Size of the image plane in the orthographic 2D scene's CSS-pixel units. */
export function gpuProjectionImagePlaneSize({
  containerHeight,
  containerWidth,
  fit,
  imageHeight,
  imageWidth,
}: {
  readonly containerHeight: number;
  readonly containerWidth: number;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
}): { readonly height: number; readonly width: number } {
  const safeContainerHeight = Math.max(1, containerHeight);
  const safeContainerWidth = Math.max(1, containerWidth);
  const imageAspect = Math.max(1, imageWidth) / Math.max(1, imageHeight);
  const containerAspect = safeContainerWidth / safeContainerHeight;
  const imageIsWider = imageAspect > containerAspect;
  const constrainByWidth = fit === "contain" ? imageIsWider : !imageIsWider;

  return constrainByWidth
    ? { height: safeContainerWidth / imageAspect, width: safeContainerWidth }
    : { height: safeContainerHeight, width: safeContainerHeight * imageAspect };
}

/** Projected image bounds in normalized viewport coordinates. */
export interface GpuProjectionViewportRect {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

/**
 * Fitted image rectangle in top-left-origin viewport UVs, intersected with
 * the current View. Used by the fragment shader to clip edge-crossing dots.
 */
export function gpuProjectionViewportRect({
  containerHeight,
  containerWidth,
  fit,
  imageHeight,
  imageWidth,
  viewTransform,
}: {
  readonly containerHeight: number;
  readonly containerWidth: number;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
  readonly viewTransform?: ImageViewTransform;
}): GpuProjectionViewportRect {
  const safeContainerHeight = Math.max(1, containerHeight);
  const safeContainerWidth = Math.max(1, containerWidth);
  const fitted = gpuProjectionImagePlaneSize({
    containerHeight: safeContainerHeight,
    containerWidth: safeContainerWidth,
    fit,
    imageHeight,
    imageWidth,
  });
  const fittedX = (safeContainerWidth - fitted.width) / 2;
  const fittedY = (safeContainerHeight - fitted.height) / 2;
  const scale = Number.isFinite(viewTransform?.scale)
    ? Math.max(1e-6, viewTransform?.scale ?? 1)
    : 1;
  const translateX = Number.isFinite(viewTransform?.translateX)
    ? (viewTransform?.translateX ?? 0)
    : 0;
  const translateY = Number.isFinite(viewTransform?.translateY)
    ? (viewTransform?.translateY ?? 0)
    : 0;
  const width = fitted.width * scale;
  const height = fitted.height * scale;
  const x = fittedX + (fitted.width - width) / 2 + translateX;
  const y = fittedY + (fitted.height - height) / 2 + translateY;

  return {
    bottom: clamp01((y + height) / safeContainerHeight),
    left: clamp01(x / safeContainerWidth),
    right: clamp01((x + width) / safeContainerWidth),
    top: clamp01(y / safeContainerHeight),
  };
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

function projectionRows(
  calibration: Pick<GpuProjectionCalibration, "K" | "P">,
): readonly number[] | null {
  const projection = calibration.P;
  if (
    projection &&
    projection.length >= 12 &&
    hasUsableFocals(projection[0], projection[5])
  ) {
    return projection.slice(0, 12);
  }

  const intrinsic = calibration.K;
  if (
    intrinsic &&
    intrinsic.length >= 9 &&
    hasUsableFocals(intrinsic[0], intrinsic[4])
  ) {
    return [
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
  }

  return null;
}

function hasUsableFocals(fx: number, fy: number): boolean {
  return Number.isFinite(fx) && Number.isFinite(fy) && fx !== 0 && fy !== 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
