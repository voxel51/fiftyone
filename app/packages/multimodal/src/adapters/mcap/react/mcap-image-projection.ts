import type { CameraCalibrationVisualization } from "../../../decoders";
import type { PointCloudColorWriter } from "../../../visualization/panels/point-cloud";

/**
 * Pure math for the pointcloud→camera projection overlay: transforms
 * decoded sensor-frame points into the camera frame, projects through
 * the rectified projection matrix (`P` when present, pinhole `K`
 * otherwise). The GPU renderer owns the production path; these helpers
 * remain as deterministic test oracles for projection and picking math.
 *
 * When the calibration carries a non-trivial distortion model, the overlay
 * still projects via `P`/`K`; the host warns that images must be rectified.
 */

/** Projection budget: dense lidar frames are stride-sampled beyond this. */
export const MCAP_PROJECTION_MAX_POINTS = 150_000;

const POINT_COMPONENT_COUNT = 3;
const UV_COMPONENT_COUNT = 2;
// Neutral dot channel when no colour writer is supplied.
const NEUTRAL_PROJECTION_CHANNEL = 0.75;

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
 * that landed inside the image with positive depth. `colors` carries
 * the interleaved rgb (normalized channels) each dot renders with.
 */
export interface McapProjectedPoints {
  readonly colors: Float32Array;
  readonly count: number;
  /** Interleaved xy in calibration pixels. */
  readonly uv: Float32Array;
}

/**
 * Projects sensor-frame positions into the calibrated image. Returns null
 * when the calibration cannot project (no usable K/P or dimensions).
 */
export function projectPointCloudToImage({
  calibration,
  colorWriter,
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
   * The cloud's resolved colour writer; omitted → neutral dots (used by
   * callers that only need the projected geometry).
   */
  readonly colorWriter?: PointCloudColorWriter | null;
  readonly maxPoints?: number;
  readonly positions: Float32Array;
  readonly rotation: McapProjectionRotation;
  readonly translation: McapProjectionTranslation;
}): McapProjectedPoints | null {
  const basis = projectionBasis({ calibration, rotation, translation });
  const width = calibration.width;
  const height = calibration.height;
  if (!basis) {
    return null;
  }

  const pointCount = Math.floor(positions.length / POINT_COMPONENT_COUNT);
  if (pointCount === 0) {
    return null;
  }
  const stride = Math.max(1, Math.ceil(pointCount / Math.max(1, maxPoints)));
  const capacity = Math.ceil(pointCount / stride);
  const uv = new Float32Array(capacity * UV_COMPONENT_COUNT);
  const colors = new Float32Array(capacity * POINT_COMPONENT_COUNT);
  if (!colorWriter) {
    colors.fill(NEUTRAL_PROJECTION_CHANNEL);
  }

  const {
    p00,
    p01,
    p02,
    p03,
    p10,
    p11,
    p12,
    p13,
    p20,
    p21,
    p22,
    p23,
    r00,
    r01,
    r02,
    r10,
    r11,
    r12,
    r20,
    r21,
    r22,
    tx,
    ty,
    tz,
  } = basis;

  let count = 0;

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
    if (!(u >= 0) || !(v >= 0) || u >= width || v >= height) {
      continue;
    }

    const target = count * UV_COMPONENT_COUNT;
    uv[target] = u;
    uv[target + 1] = v;
    // Colour by the point's sensor-frame values, exactly like the 3D
    // renderer colours the same source index.
    colorWriter?.write(colors, count * POINT_COMPONENT_COUNT, pointIndex, pz);
    count++;
  }

  if (count === 0) {
    return null;
  }

  return { colors, count, uv };
}

/** One projected point picked by a dwell hit test, in decoded index space. */
export interface ProjectedPointPick {
  /** Squared distance from the target, in calibration pixels. */
  readonly distanceSq: number;
  /** Index into the cloud's decoded per-point arrays. */
  readonly pointIndex: number;
  /** Projected position in calibration pixels. */
  readonly u: number;
  readonly v: number;
}

/**
 * Hit-tests the projected cloud against a target position in calibration
 * pixels, returning the nearest point within `radiusPx`. Walks the exact
 * stride and culls of {@link projectPointCloudToImage}, so only points
 * that can be drawn are pickable, and — mirroring the 3D side — the walk
 * runs only on dwell instead of shipping an index map on every tick.
 */
export function pickProjectedPoint({
  calibration,
  maxPoints = MCAP_PROJECTION_MAX_POINTS,
  positions,
  radiusPx,
  rotation,
  targetU,
  targetV,
  translation,
}: {
  readonly calibration: Pick<
    CameraCalibrationVisualization,
    "K" | "P" | "height" | "width"
  >;
  readonly maxPoints?: number;
  readonly positions: Float32Array;
  readonly radiusPx: number;
  readonly rotation: McapProjectionRotation;
  readonly targetU: number;
  readonly targetV: number;
  readonly translation: McapProjectionTranslation;
}): ProjectedPointPick | null {
  const basis = projectionBasis({ calibration, rotation, translation });
  const width = calibration.width;
  const height = calibration.height;
  if (!basis || !(radiusPx > 0)) {
    return null;
  }

  const pointCount = Math.floor(positions.length / POINT_COMPONENT_COUNT);
  const stride = Math.max(1, Math.ceil(pointCount / Math.max(1, maxPoints)));
  const radiusSq = radiusPx * radiusPx;
  const {
    p00,
    p01,
    p02,
    p03,
    p10,
    p11,
    p12,
    p13,
    p20,
    p21,
    p22,
    p23,
    r00,
    r01,
    r02,
    r10,
    r11,
    r12,
    r20,
    r21,
    r22,
    tx,
    ty,
    tz,
  } = basis;

  let best: ProjectedPointPick | null = null;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += stride) {
    const offset = pointIndex * POINT_COMPONENT_COUNT;
    const px = positions[offset];
    const py = positions[offset + 1];
    const pz = positions[offset + 2];
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      continue;
    }

    const cx = r00 * px + r01 * py + r02 * pz + tx;
    const cy = r10 * px + r11 * py + r12 * pz + ty;
    const cz = r20 * px + r21 * py + r22 * pz + tz;
    const w = p20 * cx + p21 * cy + p22 * cz + p23;
    if (!(w > 0)) {
      continue;
    }
    const u = (p00 * cx + p01 * cy + p02 * cz + p03) / w;
    const v = (p10 * cx + p11 * cy + p12 * cz + p13) / w;
    if (!(u >= 0) || !(v >= 0) || u >= width || v >= height) {
      continue;
    }

    const du = u - targetU;
    const dv = v - targetV;
    const distanceSq = du * du + dv * dv;
    if (distanceSq > radiusSq) {
      continue;
    }
    if (!best || distanceSq < best.distanceSq) {
      best = { distanceSq, pointIndex, u, v };
    }
  }

  return best;
}

interface ProjectionBasis {
  readonly p00: number;
  readonly p01: number;
  readonly p02: number;
  readonly p03: number;
  readonly p10: number;
  readonly p11: number;
  readonly p12: number;
  readonly p13: number;
  readonly p20: number;
  readonly p21: number;
  readonly p22: number;
  readonly p23: number;
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

/**
 * Unrolled sensor→pixel basis shared by the draw and pick walks: the
 * rotation matrix from the (normalized) quaternion plus the projection
 * rows. Null when the calibration cannot project.
 */
function projectionBasis({
  calibration,
  rotation,
  translation,
}: {
  readonly calibration: Pick<
    CameraCalibrationVisualization,
    "K" | "P" | "height" | "width"
  >;
  readonly rotation: McapProjectionRotation;
  readonly translation: McapProjectionTranslation;
}): ProjectionBasis | null {
  const projection = projectionRows(calibration);
  if (!projection || !(calibration.width > 0) || !(calibration.height > 0)) {
    return null;
  }

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
  const [p00, p01, p02, p03, p10, p11, p12, p13, p20, p21, p22, p23] =
    projection;

  return {
    p00,
    p01,
    p02,
    p03,
    p10,
    p11,
    p12,
    p13,
    p20,
    p21,
    p22,
    p23,
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
