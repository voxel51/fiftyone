import type { CameraCalibrationVisualization } from "../../../decoders";
import {
  createPointCloudColormapLookup,
  sampleColormap,
  type PointCloudColormap,
} from "../../../visualization/panels/point-cloud";

/**
 * Pure math for the lidar→camera projection overlay: transforms decoded
 * sensor-frame points into the camera frame, projects through the
 * rectified projection matrix (`P` when present, pinhole `K` otherwise),
 * and rasterizes the survivors as colormapped dots on a 2D canvas.
 *
 * V1 is rectified-only by design: when the calibration carries a
 * non-trivial distortion model the overlay still projects via `P`/`K`
 * but the host shows a "assumes rectified images" notice instead of
 * silently drawing wrong pixels (see `hasNonTrivialDistortion`).
 */

/** Projection budget: dense lidar frames are stride-sampled beyond this. */
export const MCAP_PROJECTION_MAX_POINTS = 150_000;

const POINT_COMPONENT_COUNT = 3;
const UV_COMPONENT_COUNT = 2;
const COLOR_BUCKET_COUNT = 64;

/** Unit quaternion, xyzw. */
export interface McapProjectionRotation {
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface McapProjectionTranslation {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Points projected into calibration-pixel space, compacted to the ones
 * that landed inside the image with positive depth. `values` carries the
 * colour-driving quantity per point (camera-frame depth in meters, or
 * the selected scalar channel).
 */
export interface McapProjectedPoints {
  readonly count: number;
  readonly maxValue: number;
  readonly minValue: number;
  /** Interleaved xy in calibration pixels. */
  readonly uv: Float32Array;
  readonly values: Float32Array;
}

/**
 * Projects sensor-frame positions into the calibrated image. Returns null
 * when the calibration cannot project (no usable K/P or dimensions).
 */
export function projectPointCloudToImage({
  calibration,
  colorValues,
  maxPoints = MCAP_PROJECTION_MAX_POINTS,
  positions,
  rotation,
  translation,
}: {
  readonly calibration: Pick<
    CameraCalibrationVisualization,
    "K" | "P" | "height" | "width"
  >;
  /**
   * Optional per-point channel driving colour (aligned with positions);
   * omitted → camera-frame depth drives colour.
   */
  readonly colorValues?: Float32Array | null;
  readonly maxPoints?: number;
  readonly positions: Float32Array;
  readonly rotation: McapProjectionRotation;
  readonly translation: McapProjectionTranslation;
}): McapProjectedPoints | null {
  const projection = projectionRows(calibration);
  const width = calibration.width;
  const height = calibration.height;
  if (!projection || !(width > 0) || !(height > 0)) {
    return null;
  }

  const pointCount = Math.floor(positions.length / POINT_COMPONENT_COUNT);
  if (pointCount === 0) {
    return null;
  }
  const stride = Math.max(1, Math.ceil(pointCount / Math.max(1, maxPoints)));
  const capacity = Math.ceil(pointCount / stride);
  const uv = new Float32Array(capacity * UV_COMPONENT_COUNT);
  const values = new Float32Array(capacity);

  // Rotation matrix from the (normalized) quaternion, unrolled for the
  // per-point hot loop.
  const rotationLength = Math.hypot(
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  );
  const qs = rotationLength > 1e-9 ? 1 / rotationLength : 0;
  const qx = rotation.x * qs;
  const qy = rotation.y * qs;
  const qz = rotation.z * qs;
  const qw = rotationLength > 1e-9 ? rotation.w * qs : 1;
  const r00 = 1 - 2 * (qy * qy + qz * qz);
  const r01 = 2 * (qx * qy - qz * qw);
  const r02 = 2 * (qx * qz + qy * qw);
  const r10 = 2 * (qx * qy + qz * qw);
  const r11 = 1 - 2 * (qx * qx + qz * qz);
  const r12 = 2 * (qy * qz - qx * qw);
  const r20 = 2 * (qx * qz - qy * qw);
  const r21 = 2 * (qy * qz + qx * qw);
  const r22 = 1 - 2 * (qx * qx + qy * qy);
  const tx = translation.x;
  const ty = translation.y;
  const tz = translation.z;
  const [p00, p01, p02, p03, p10, p11, p12, p13, p20, p21, p22, p23] =
    projection;

  let count = 0;
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += stride) {
    const offset = pointIndex * POINT_COMPONENT_COUNT;
    const px = positions[offset];
    const py = positions[offset + 1];
    const pz = positions[offset + 2];
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      continue;
    }

    // Camera frame (OpenCV convention: +Z forward, +X right, +Y down).
    const cx = r00 * px + r01 * py + r02 * pz + tx;
    const cy = r10 * px + r11 * py + r12 * pz + ty;
    const cz = r20 * px + r21 * py + r22 * pz + tz;

    const w = p20 * cx + p21 * cy + p22 * cz + p23;
    if (!(w > 0)) {
      continue;
    }
    const u = (p00 * cx + p01 * cy + p02 * cz + p03) / w;
    const v = (p10 * cx + p11 * cy + p12 * cz + p13) / w;
    if (!(u >= 0) || !(v >= 0) || u > width || v > height) {
      continue;
    }

    const value = colorValues ? (colorValues[pointIndex] ?? cz) : cz;
    if (!Number.isFinite(value)) {
      continue;
    }

    const target = count * UV_COMPONENT_COUNT;
    uv[target] = u;
    uv[target + 1] = v;
    values[count] = value;
    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
    count++;
  }

  if (count === 0) {
    return null;
  }

  return { count, maxValue, minValue, uv, values };
}

/**
 * Whether the calibration declares a distortion model with any non-zero
 * coefficient — the trigger for the "assumes rectified images" notice.
 */
export function hasNonTrivialDistortion(
  calibration: Pick<CameraCalibrationVisualization, "D" | "distortionModel">,
): boolean {
  if (!calibration.distortionModel?.trim() || !calibration.D) {
    return false;
  }
  return calibration.D.some((coefficient) => Math.abs(coefficient) > 1e-9);
}

/**
 * Rasterizes projected points as colormapped square dots. Points are
 * bucketed by ramp position with a counting sort so the canvas sees at
 * most {@link COLOR_BUCKET_COUNT} fillStyle changes per frame instead of
 * one per point.
 */
export function drawProjectedPoints(
  context: CanvasRenderingContext2D,
  projection: McapProjectedPoints,
  {
    colormap,
    dotSize,
    invert = false,
  }: {
    readonly colormap: PointCloudColormap;
    /** Dot edge length in canvas pixels. */
    readonly dotSize: number;
    /** Flip the ramp (used for depth: near = warm reads best). */
    readonly invert?: boolean;
  },
): void {
  const { count, maxValue, minValue, uv, values } = projection;
  const span = maxValue - minValue;
  const scale = span > 1e-9 ? 1 / span : 0;

  const bucketOf = new Uint8Array(count);
  const bucketCounts = new Uint32Array(COLOR_BUCKET_COUNT);
  for (let index = 0; index < count; index++) {
    let t = scale > 0 ? (values[index] - minValue) * scale : 0.5;
    if (invert) t = 1 - t;
    let bucket = Math.floor(t * COLOR_BUCKET_COUNT);
    if (bucket < 0) bucket = 0;
    if (bucket >= COLOR_BUCKET_COUNT) bucket = COLOR_BUCKET_COUNT - 1;
    bucketOf[index] = bucket;
    bucketCounts[bucket]++;
  }

  const bucketOffsets = new Uint32Array(COLOR_BUCKET_COUNT);
  let offset = 0;
  for (let bucket = 0; bucket < COLOR_BUCKET_COUNT; bucket++) {
    bucketOffsets[bucket] = offset;
    offset += bucketCounts[bucket];
  }
  const ordered = new Uint32Array(count);
  const cursor = bucketOffsets.slice();
  for (let index = 0; index < count; index++) {
    ordered[cursor[bucketOf[index]]++] = index;
  }

  const styles = colormapBucketStyles(colormap);
  const half = dotSize / 2;
  for (let bucket = 0; bucket < COLOR_BUCKET_COUNT; bucket++) {
    const bucketCount = bucketCounts[bucket];
    if (bucketCount === 0) continue;
    context.fillStyle = styles[bucket];
    const start = bucketOffsets[bucket];
    for (let position = 0; position < bucketCount; position++) {
      const pointIndex = ordered[start + position];
      const uvOffset = pointIndex * UV_COMPONENT_COUNT;
      context.fillRect(
        uv[uvOffset] - half,
        uv[uvOffset + 1] - half,
        dotSize,
        dotSize,
      );
    }
  }
}

/** Row-major 3x4 projection rows from P (preferred) or pinhole K. */
function projectionRows(
  calibration: Pick<CameraCalibrationVisualization, "K" | "P">,
): readonly number[] | null {
  const P = calibration.P;
  if (P && P.length >= 12 && hasUsableFocals(P[0], P[5])) {
    return P.slice(0, 12);
  }

  const K = calibration.K;
  if (K && K.length >= 9 && hasUsableFocals(K[0], K[4])) {
    return [K[0], K[1], K[2], 0, K[3], K[4], K[5], 0, K[6], K[7], K[8], 0];
  }

  return null;
}

function hasUsableFocals(fx: number, fy: number): boolean {
  return Number.isFinite(fx) && Number.isFinite(fy) && fx !== 0 && fy !== 0;
}

const bucketStyleCache = new Map<string, readonly string[]>();

function colormapBucketStyles(colormap: PointCloudColormap): readonly string[] {
  const key =
    typeof colormap === "string" ? colormap : JSON.stringify(colormap);
  const cached = bucketStyleCache.get(key);
  if (cached) {
    return cached;
  }

  // Force materialization through the shared lookup so custom colormaps
  // resolve identically to the 3D ramps.
  createPointCloudColormapLookup(colormap);
  const styles: string[] = [];
  for (let bucket = 0; bucket < COLOR_BUCKET_COUNT; bucket++) {
    const [r, g, b] = sampleColormap(
      colormap,
      (bucket + 0.5) / COLOR_BUCKET_COUNT,
    );
    styles.push(
      `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(
        b * 255,
      )})`,
    );
  }
  bucketStyleCache.set(key, styles);
  return styles;
}
