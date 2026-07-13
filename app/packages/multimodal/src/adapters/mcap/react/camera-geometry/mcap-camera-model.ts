import type { CameraCalibrationVisualization } from "../../../../decoders";

const MATRIX_3_LENGTH = 9;
const MATRIX_3X4_LENGTH = 12;
const DOMAIN_SCAN_STEPS = 4096;
const INVERSE_ITERATIONS = 24;
const GRID_COLUMNS = 9;
const GRID_ROWS = 7;
const NUMERIC_EPSILON = 1e-9;
const CAMERA_MODEL_CACHE_LIMIT = 64;
const IMAGE_TRANSPORT_TOPIC_TOKENS = new Set([
  "compress",
  "compressed",
  "compressedimage",
]);

const IDENTITY_RECTIFICATION: readonly number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** User-selectable interpretation of one recorded image's pixel geometry. */
export type McapImageGeometryMode = "auto" | "original" | "rectified";

/** User-selectable image presentation; geometry describes the recorded input. */
export type McapImageDisplayMode = "recorded" | "rectified";

/** Image geometry modes that resolve to concrete camera projection math. */
export type McapResolvedImageGeometryMode = Exclude<
  McapImageGeometryMode,
  "auto"
>;

/** Projection through a pinhole matrix, in original or rectified space. */
export interface McapPinholeCameraModel {
  readonly height: number;
  readonly kind: "pinhole";
  readonly projection: readonly number[];
  readonly rectification: readonly number[];
  readonly space: McapResolvedImageGeometryMode;
  readonly width: number;
}

/** OpenCV rational-polynomial projection with a bounded normalized radius. */
export interface McapRationalCameraModel {
  readonly D: readonly number[];
  readonly height: number;
  readonly K: readonly number[];
  readonly kind: "rational-polynomial";
  readonly maxRadius: number;
  readonly space: "original";
  readonly width: number;
}

/** OpenCV equidistant/fisheye projection with a bounded ray angle. */
export interface McapEquidistantCameraModel {
  readonly D: readonly number[];
  readonly height: number;
  readonly K: readonly number[];
  readonly kind: "equidistant";
  readonly maxTheta: number;
  readonly space: "original";
  readonly width: number;
}

/** Camera model ready for CPU reference math or GPU projection preparation. */
export type McapCameraModel =
  | McapEquidistantCameraModel
  | McapPinholeCameraModel
  | McapRationalCameraModel;

/** Effective calibration after applying ROS binning and sensor-space ROI. */
export interface McapEffectiveCameraCalibration {
  readonly D?: readonly number[];
  readonly K: readonly number[];
  readonly P?: readonly number[];
  readonly R?: readonly number[];
  readonly distortionModel?: string;
  readonly height: number;
  readonly width: number;
}

/** Result of resolving a persisted geometry choice against one calibration. */
export type McapCameraModelResolution =
  | {
      readonly equivalentDisplacementPx: number;
      readonly model: McapCameraModel;
      readonly mode: McapResolvedImageGeometryMode;
      readonly status: "ready";
    }
  | {
      readonly equivalentDisplacementPx: number | null;
      readonly message: string;
      readonly status: "ambiguous" | "invalid" | "unsupported";
      readonly suggestedMode: McapResolvedImageGeometryMode | null;
    };

/** One finite camera-space point projected into calibration pixels. */
export interface McapProjectedCameraPoint {
  readonly depth: number;
  readonly u: number;
  readonly v: number;
}

interface CameraModelBuildFailure {
  readonly message: string;
  readonly status: "invalid" | "unsupported";
}

type CameraModelBuildResult = McapCameraModel | CameraModelBuildFailure;

interface CameraModelPair {
  readonly equivalentDisplacementPx: number | null;
  readonly original: CameraModelBuildResult;
  readonly rectified: CameraModelBuildResult;
}

const cameraModelCache = new Map<string, CameraModelPair>();

/**
 * Applies ROS CameraInfo ROI and binning semantics to K/P and dimensions.
 * Foxglove calibration omits these fields and therefore passes through.
 */
export function effectiveMcapCameraCalibration(
  calibration: CameraCalibrationVisualization,
): McapEffectiveCameraCalibration | null {
  if (
    !validDimensions(calibration.width, calibration.height) ||
    !usableMatrix(calibration.K, MATRIX_3_LENGTH)
  ) {
    return null;
  }

  const binningX = positiveBinning(calibration.binningX);
  const binningY = positiveBinning(calibration.binningY);
  const roi = normalizedRoi(calibration);
  const K = calibration.K.slice(0, MATRIX_3_LENGTH);
  const P = usableMatrix(calibration.P, MATRIX_3X4_LENGTH)
    ? calibration.P?.slice(0, MATRIX_3X4_LENGTH)
    : undefined;

  if (roi.xOffset !== 0 || roi.yOffset !== 0) {
    K[2] -= roi.xOffset;
    K[5] -= roi.yOffset;
    if (P) {
      P[2] -= roi.xOffset;
      P[6] -= roi.yOffset;
    }
  }

  if (binningX > 1) {
    const scaleX = 1 / binningX;
    K[0] *= scaleX;
    K[2] *= scaleX;
    if (P) {
      P[0] *= scaleX;
      P[2] *= scaleX;
      P[3] *= scaleX;
    }
  }
  if (binningY > 1) {
    const scaleY = 1 / binningY;
    K[4] *= scaleY;
    K[5] *= scaleY;
    if (P) {
      P[5] *= scaleY;
      P[6] *= scaleY;
      P[7] *= scaleY;
    }
  }

  const width = Math.floor(roi.width / binningX);
  const height = Math.floor(roi.height / binningY);
  if (!validDimensions(width, height)) {
    return null;
  }

  return {
    ...(calibration.D ? { D: calibration.D } : {}),
    K,
    ...(P ? { P } : {}),
    ...(finiteMatrix(calibration.R, MATRIX_3_LENGTH)
      ? { R: calibration.R?.slice(0, MATRIX_3_LENGTH) }
      : {}),
    ...(calibration.distortionModel
      ? { distortionModel: calibration.distortionModel }
      : {}),
    height,
    width,
  };
}

/** Resolves Auto/original/rectified into trustworthy projection behavior. */
export function resolveMcapCameraModel({
  calibration,
  geometry,
  imageTopic,
}: {
  readonly calibration: CameraCalibrationVisualization;
  readonly geometry: McapImageGeometryMode;
  readonly imageTopic: string;
}): McapCameraModelResolution {
  const effective = effectiveMcapCameraCalibration(calibration);
  if (!effective) {
    return resolutionFailure(
      "invalid",
      "Camera calibration is incomplete or invalid",
    );
  }

  const { equivalentDisplacementPx, original, rectified } =
    cachedCameraModels(effective);
  if (geometry === "original") {
    return readyOrFailure(original, "original");
  }
  if (geometry === "rectified") {
    return readyOrFailure(rectified, "rectified");
  }

  const inferredGeometry = suggestMcapImageGeometry(imageTopic);
  if (inferredGeometry) {
    return readyOrFailure(
      inferredGeometry === "original" ? original : rectified,
      inferredGeometry,
    );
  }

  if (isFailure(original) && isFailure(rectified)) {
    return {
      equivalentDisplacementPx: null,
      message: `${original.message}; ${rectified.message}`,
      status:
        original.status === "unsupported" || rectified.status === "unsupported"
          ? "unsupported"
          : "invalid",
      suggestedMode: null,
    };
  }

  if (!isFailure(original) && !isFailure(rectified)) {
    const displacement = equivalentDisplacementPx ?? Number.POSITIVE_INFINITY;
    if (displacement <= mcapEquivalentPixelTolerance(effective)) {
      return {
        equivalentDisplacementPx: displacement,
        model: original,
        mode: "original",
        status: "ready",
      };
    }
    return {
      equivalentDisplacementPx: displacement,
      message:
        "Original and rectified camera models differ; choose the image geometry",
      status: "ambiguous",
      suggestedMode: null,
    };
  }

  if (
    !isFailure(original) &&
    isFailure(rectified) &&
    original.kind === "pinhole"
  ) {
    return {
      equivalentDisplacementPx: 0,
      model: original,
      mode: "original",
      status: "ready",
    };
  }

  const originalUnavailable = isFailure(original);
  const availableMode = originalUnavailable ? "rectified" : "original";
  const unavailable = originalUnavailable ? original : rectified;
  if (!isFailure(unavailable)) {
    return resolutionFailure("invalid", "Unable to resolve image geometry");
  }
  return {
    equivalentDisplacementPx: null,
    message: `${capitalize(availableMode)} projection is available, but Auto cannot prove the image uses it: ${unavailable.message}`,
    status: unavailable.status === "unsupported" ? "unsupported" : "ambiguous",
    suggestedMode: availableMode,
  };
}

function cachedCameraModels(
  calibration: McapEffectiveCameraCalibration,
): CameraModelPair {
  const key = cameraModelCacheKey(calibration);
  const cached = cameraModelCache.get(key);
  if (cached) {
    return cached;
  }
  const original = buildOriginalCameraModel(calibration);
  const rectified = buildRectifiedCameraModel(calibration);
  const pair = {
    equivalentDisplacementPx:
      !isFailure(original) && !isFailure(rectified)
        ? maxMcapModelDisplacement(original, rectified)
        : null,
    original,
    rectified,
  };
  cameraModelCache.set(key, pair);
  if (cameraModelCache.size > CAMERA_MODEL_CACHE_LIMIT) {
    const oldestKey = cameraModelCache.keys().next().value;
    if (oldestKey !== undefined) {
      cameraModelCache.delete(oldestKey);
    }
  }
  return pair;
}

function cameraModelCacheKey(
  calibration: McapEffectiveCameraCalibration,
): string {
  return [
    calibration.width,
    calibration.height,
    calibration.distortionModel ?? "",
    calibration.K.join(","),
    calibration.D?.join(",") ?? "",
    calibration.R?.join(",") ?? "",
    calibration.P?.join(",") ?? "",
  ].join("|");
}

/** Geometry encoded by a canonical terminal image topic suffix. */
export function suggestMcapImageGeometry(
  imageTopic: string,
): McapResolvedImageGeometryMode | null {
  const pathSegments = imageTopic.toLowerCase().split("/").filter(Boolean);
  for (let index = pathSegments.length - 1; index >= 0; index -= 1) {
    const tokens = pathSegments[index].split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.every((token) => IMAGE_TRANSPORT_TOPIC_TOKENS.has(token))) {
      continue;
    }
    if (!tokens.includes("image")) {
      return null;
    }
    if (tokens.includes("rect") || tokens.includes("rectified")) {
      return "rectified";
    }
    if (tokens.includes("raw")) {
      return "original";
    }
    return null;
  }
  return null;
}

/** Resolution-aware threshold below which two image models are equivalent. */
export function mcapEquivalentPixelTolerance(
  calibration: Pick<McapEffectiveCameraCalibration, "height" | "width">,
): number {
  return Math.min(
    1,
    Math.max(0.5, Math.hypot(calibration.width, calibration.height) * 0.0001),
  );
}

/** Maximum sampled pixel displacement between two camera models. */
export function maxMcapModelDisplacement(
  original: McapCameraModel,
  candidate: McapCameraModel,
): number {
  let maximum = 0;
  let sampleCount = 0;
  for (let row = 0; row < GRID_ROWS; row++) {
    const v = ((original.height - 1) * row) / (GRID_ROWS - 1);
    for (let column = 0; column < GRID_COLUMNS; column++) {
      const u = ((original.width - 1) * column) / (GRID_COLUMNS - 1);
      const ray = unprojectMcapCameraPixel(original, u, v);
      if (!ray) {
        return Number.POSITIVE_INFINITY;
      }
      const reference = projectMcapCameraPoint(original, ray);
      const projected = projectMcapCameraPoint(candidate, ray);
      if (!reference || !projected) {
        return Number.POSITIVE_INFINITY;
      }
      maximum = Math.max(
        maximum,
        Math.hypot(reference.u - projected.u, reference.v - projected.v),
      );
      sampleCount += 1;
    }
  }
  return sampleCount > 0 ? maximum : Number.POSITIVE_INFINITY;
}

/** Projects one point already expressed in the calibration camera frame. */
export function projectMcapCameraPoint(
  model: McapCameraModel,
  point: readonly [number, number, number],
): McapProjectedCameraPoint | null {
  if (!point.every(Number.isFinite)) {
    return null;
  }
  if (model.kind === "pinhole") {
    const rectified = applyMatrix3(model.rectification, point);
    const [x, y, z] = rectified;
    const P = model.projection;
    const depth = P[8] * x + P[9] * y + P[10] * z + P[11];
    if (!(depth > NUMERIC_EPSILON)) {
      return null;
    }
    return {
      depth,
      u: (P[0] * x + P[1] * y + P[2] * z + P[3]) / depth,
      v: (P[4] * x + P[5] * y + P[6] * z + P[7]) / depth,
    };
  }

  const [x, y, z] = point;
  if (model.kind === "rational-polynomial") {
    if (!(z > NUMERIC_EPSILON)) {
      return null;
    }
    const normalizedX = x / z;
    const normalizedY = y / z;
    const radius = Math.hypot(normalizedX, normalizedY);
    if (radius > model.maxRadius) {
      return null;
    }
    const distorted = distortRational(normalizedX, normalizedY, model.D);
    return distorted
      ? normalizedToPixel(model.K, distorted[0], distorted[1], z)
      : null;
  }

  const radialDistance = Math.hypot(x, y);
  const theta = Math.atan2(radialDistance, z);
  if (
    !(Math.hypot(radialDistance, z) > NUMERIC_EPSILON) ||
    theta > model.maxTheta
  ) {
    return null;
  }
  if (radialDistance <= NUMERIC_EPSILON) {
    return normalizedToPixel(model.K, 0, 0, z);
  }
  const thetaDistorted = equidistantRadius(theta, model.D);
  const scale = thetaDistorted / radialDistance;
  return normalizedToPixel(model.K, x * scale, y * scale, z);
}

/** Unprojects one image pixel into an arbitrary-length camera-space ray. */
export function unprojectMcapCameraPixel(
  model: McapCameraModel,
  u: number,
  v: number,
): readonly [number, number, number] | null {
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    return null;
  }
  if (model.kind === "pinhole") {
    if (model.space === "rectified") {
      const P = model.projection;
      const normalized = pixelToNormalized(
        [P[0], P[1], P[2], P[4], P[5], P[6], P[8], P[9], P[10]],
        u,
        v,
      );
      if (!normalized) {
        return null;
      }
      // Image rectification is rotational. P's translation column carries
      // stereo projection semantics for 3D points and does not participate in
      // the inverse pixel-to-ray map used to remap image pixels.
      return applyTransposeMatrix3(model.rectification, [
        normalized[0],
        normalized[1],
        1,
      ]);
    }
    const K = projectionToK(model.projection);
    const normalized = pixelToNormalized(K, u, v);
    return normalized ? [normalized[0], normalized[1], 1] : null;
  }

  const distorted = pixelToNormalized(model.K, u, v);
  if (!distorted) {
    return null;
  }
  if (model.kind === "rational-polynomial") {
    const normalized = undistortRational(distorted[0], distorted[1], model.D);
    if (!normalized || Math.hypot(...normalized) > model.maxRadius) {
      return null;
    }
    return [normalized[0], normalized[1], 1];
  }

  const thetaDistorted = Math.hypot(distorted[0], distorted[1]);
  if (thetaDistorted <= NUMERIC_EPSILON) {
    return [0, 0, 1];
  }
  const theta = invertMonotonicRadius(
    thetaDistorted,
    (value) => equidistantRadius(value, model.D),
    model.maxTheta,
  );
  if (theta === null || theta > model.maxTheta) {
    return null;
  }
  const radialScale = Math.sin(theta) / thetaDistorted;
  return [
    distorted[0] * radialScale,
    distorted[1] * radialScale,
    Math.cos(theta),
  ];
}

function buildOriginalCameraModel(
  calibration: McapEffectiveCameraCalibration,
): CameraModelBuildResult {
  if (!usableMatrix(calibration.K, MATRIX_3_LENGTH)) {
    return failure("invalid", "Original intrinsics K are unavailable");
  }
  const D = calibration.D ?? [];
  if (!D.every(Number.isFinite)) {
    return failure("invalid", "Distortion coefficients must be finite");
  }
  const normalizedModel = normalizedDistortionModel(
    calibration.distortionModel,
  );
  const hasDeclaredModel = Boolean(calibration.distortionModel?.trim());
  if (hasDeclaredModel && !normalizedModel) {
    return failure(
      "unsupported",
      `Unsupported distortion model '${calibration.distortionModel}'`,
    );
  }

  if (!normalizedModel) {
    if (D.some((coefficient) => coefficient !== 0)) {
      return failure(
        "unsupported",
        "Nonzero distortion coefficients have no declared model",
      );
    }
    return {
      height: calibration.height,
      kind: "pinhole",
      projection: kToProjection(calibration.K),
      rectification: IDENTITY_RECTIFICATION,
      space: "original",
      width: calibration.width,
    };
  }

  if (normalizedModel === "rational-polynomial") {
    const coefficients = rationalCoefficients(calibration.distortionModel, D);
    if (!coefficients) {
      return failure(
        "unsupported",
        `Distortion model '${calibration.distortionModel}' has an unsupported coefficient layout`,
      );
    }
    if (coefficients.every((coefficient) => coefficient === 0)) {
      return {
        height: calibration.height,
        kind: "pinhole",
        projection: kToProjection(calibration.K),
        rectification: IDENTITY_RECTIFICATION,
        space: "original",
        width: calibration.width,
      };
    }
    const maxRadius = rationalProjectionDomain(calibration, coefficients);
    if (!(maxRadius > 0) || !Number.isFinite(maxRadius)) {
      return failure(
        "invalid",
        "Unable to establish a valid radial projection domain",
      );
    }
    return {
      D: coefficients,
      height: calibration.height,
      K: calibration.K,
      kind: "rational-polynomial",
      maxRadius,
      space: "original",
      width: calibration.width,
    };
  }

  if (D.length !== 4) {
    return failure(
      "unsupported",
      "Equidistant calibration requires exactly four coefficients",
    );
  }
  const maxTheta = equidistantProjectionDomain(calibration, D);
  if (!(maxTheta > 0) || !Number.isFinite(maxTheta)) {
    return failure(
      "invalid",
      "Unable to establish a valid equidistant projection domain",
    );
  }
  return {
    D,
    height: calibration.height,
    K: calibration.K,
    kind: "equidistant",
    maxTheta,
    space: "original",
    width: calibration.width,
  };
}

function buildRectifiedCameraModel(
  calibration: McapEffectiveCameraCalibration,
): CameraModelBuildResult {
  if (!usableMatrix(calibration.P, MATRIX_3X4_LENGTH)) {
    return failure("invalid", "Rectified projection matrix P is unavailable");
  }
  const rectification = finiteMatrix(calibration.R, MATRIX_3_LENGTH)
    ? calibration.R?.slice(0, MATRIX_3_LENGTH)
    : IDENTITY_RECTIFICATION;
  return {
    height: calibration.height,
    kind: "pinhole",
    projection: calibration.P?.slice(0, MATRIX_3X4_LENGTH) ?? [],
    rectification,
    space: "rectified",
    width: calibration.width,
  };
}

function rationalProjectionDomain(
  calibration: McapEffectiveCameraCalibration,
  D: readonly number[],
): number {
  const distortedBoundary = boundaryPixels(
    calibration.width,
    calibration.height,
  )
    .map(([u, v]) => pixelToNormalized(calibration.K, u, v))
    .filter((point): point is readonly [number, number] => point !== null);
  const undistortedBoundary = distortedBoundary.map(([x, y]) =>
    undistortRational(x, y, D),
  );
  const validBoundary = undistortedBoundary.filter(
    (point): point is readonly [number, number] => point !== null,
  );
  if (
    validBoundary.length === 0 ||
    validBoundary.length !== distortedBoundary.length
  ) {
    return Number.NaN;
  }
  const boundaryRadius = Math.max(
    ...validBoundary.map((point) => Math.hypot(...point)),
  );
  const monotonicLimit = firstMonotonicLimit(
    (radius) => rationalRadialRadius(radius, D),
    Math.max(10, boundaryRadius * 4),
  );
  return Math.min(boundaryRadius, monotonicLimit * 0.999);
}

function equidistantProjectionDomain(
  calibration: McapEffectiveCameraCalibration,
  D: readonly number[],
): number {
  const maximumDistortedRadius = Math.max(
    ...boundaryPixels(calibration.width, calibration.height)
      .map(([u, v]) => pixelToNormalized(calibration.K, u, v))
      .filter((point): point is readonly [number, number] => point !== null)
      .map(([x, y]) => Math.hypot(x, y)),
  );
  const monotonicLimit = firstMonotonicLimit(
    (theta) => equidistantRadius(theta, D),
    Math.PI,
  );
  const boundaryTheta = invertMonotonicRadius(
    maximumDistortedRadius,
    (theta) => equidistantRadius(theta, D),
    monotonicLimit,
  );
  if (boundaryTheta === null) {
    return Number.NaN;
  }
  return Math.min(boundaryTheta, monotonicLimit * 0.999, Math.PI);
}

function rationalCoefficients(
  declaredModel: string | undefined,
  D: readonly number[],
): readonly number[] | null {
  const normalized = declaredModel?.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "plumb_bob") {
    if (D.length !== 4 && D.length !== 5) {
      return null;
    }
    return [D[0], D[1], D[2], D[3], D[4] ?? 0, 0, 0, 0];
  }
  if (normalized === "rational_polynomial" && D.length === 8) {
    return D.slice(0, 8);
  }
  return null;
}

function normalizedDistortionModel(
  model: string | undefined,
): "equidistant" | "rational-polynomial" | null {
  const normalized = model?.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "plumb_bob" || normalized === "rational_polynomial") {
    return "rational-polynomial";
  }
  if (normalized === "equidistant" || normalized === "fisheye") {
    return "equidistant";
  }
  return null;
}

function distortRational(
  x: number,
  y: number,
  D: readonly number[],
): readonly [number, number] | null {
  const [k1, k2, p1, p2, k3, k4, k5, k6] = D;
  const x2 = x * x;
  const y2 = y * y;
  const xy = x * y;
  const r2 = x2 + y2;
  const r4 = r2 * r2;
  const r6 = r4 * r2;
  const denominator = 1 + k4 * r2 + k5 * r4 + k6 * r6;
  if (
    !Number.isFinite(denominator) ||
    Math.abs(denominator) <= NUMERIC_EPSILON
  ) {
    return null;
  }
  const radial = (1 + k1 * r2 + k2 * r4 + k3 * r6) / denominator;
  const distortedX = x * radial + 2 * p1 * xy + p2 * (r2 + 2 * x2);
  const distortedY = y * radial + 2 * p2 * xy + p1 * (r2 + 2 * y2);
  return Number.isFinite(distortedX) && Number.isFinite(distortedY)
    ? [distortedX, distortedY]
    : null;
}

function undistortRational(
  distortedX: number,
  distortedY: number,
  D: readonly number[],
): readonly [number, number] | null {
  let x = distortedX;
  let y = distortedY;
  for (let iteration = 0; iteration < INVERSE_ITERATIONS; iteration++) {
    const projected = distortRational(x, y, D);
    if (!projected) {
      return null;
    }
    const errorX = projected[0] - distortedX;
    const errorY = projected[1] - distortedY;
    if (Math.hypot(errorX, errorY) < 1e-10) {
      return [x, y];
    }
    const step = 1e-6 * Math.max(1, Math.hypot(x, y));
    const projectedX = distortRational(x + step, y, D);
    const projectedY = distortRational(x, y + step, D);
    if (!projectedX || !projectedY) {
      return null;
    }
    const j00 = (projectedX[0] - projected[0]) / step;
    const j10 = (projectedX[1] - projected[1]) / step;
    const j01 = (projectedY[0] - projected[0]) / step;
    const j11 = (projectedY[1] - projected[1]) / step;
    const determinant = j00 * j11 - j01 * j10;
    if (Math.abs(determinant) <= NUMERIC_EPSILON) {
      return null;
    }
    const deltaX = (j11 * errorX - j01 * errorY) / determinant;
    const deltaY = (-j10 * errorX + j00 * errorY) / determinant;
    const maximumStep = Math.max(0.25, Math.hypot(x, y) * 0.25);
    const scale = Math.min(
      1,
      maximumStep / Math.max(NUMERIC_EPSILON, Math.hypot(deltaX, deltaY)),
    );
    x -= deltaX * scale;
    y -= deltaY * scale;
  }
  const projected = distortRational(x, y, D);
  return projected &&
    Math.hypot(projected[0] - distortedX, projected[1] - distortedY) < 1e-6
    ? [x, y]
    : null;
}

function rationalRadialRadius(radius: number, D: readonly number[]): number {
  const [k1, k2, , , k3, k4, k5, k6] = D;
  const r2 = radius * radius;
  const r4 = r2 * r2;
  const r6 = r4 * r2;
  const denominator = 1 + k4 * r2 + k5 * r4 + k6 * r6;
  if (!(denominator > NUMERIC_EPSILON)) {
    return Number.NaN;
  }
  return (radius * (1 + k1 * r2 + k2 * r4 + k3 * r6)) / denominator;
}

function equidistantRadius(theta: number, D: readonly number[]): number {
  const [k1, k2, k3, k4] = D;
  const theta2 = theta * theta;
  const theta4 = theta2 * theta2;
  const theta6 = theta4 * theta2;
  const theta8 = theta4 * theta4;
  return theta * (1 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8);
}

function firstMonotonicLimit(
  mapping: (value: number) => number,
  maximum: number,
): number {
  let previousInput = 0;
  let previousOutput = mapping(0);
  for (let step = 1; step <= DOMAIN_SCAN_STEPS; step++) {
    const input = (maximum * step) / DOMAIN_SCAN_STEPS;
    const output = mapping(input);
    if (!Number.isFinite(output) || output <= previousOutput) {
      return Math.max(NUMERIC_EPSILON, previousInput);
    }
    previousInput = input;
    previousOutput = output;
  }
  return maximum;
}

function invertMonotonicRadius(
  target: number,
  mapping: (value: number) => number,
  maximum: number,
): number | null {
  if (!(target >= 0) || !(maximum > 0) || mapping(maximum) < target) {
    return null;
  }
  let low = 0;
  let high = maximum;
  for (let iteration = 0; iteration < 64; iteration++) {
    const middle = (low + high) / 2;
    if (mapping(middle) < target) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
}

function normalizedToPixel(
  K: readonly number[],
  x: number,
  y: number,
  depth: number,
): McapProjectedCameraPoint {
  return {
    depth,
    u: K[0] * x + K[1] * y + K[2],
    v: K[3] * x + K[4] * y + K[5],
  };
}

function pixelToNormalized(
  K: readonly number[],
  u: number,
  v: number,
): readonly [number, number] | null {
  const determinant = K[0] * K[4] - K[1] * K[3];
  if (Math.abs(determinant) <= NUMERIC_EPSILON) {
    return null;
  }
  const shiftedU = u - K[2];
  const shiftedV = v - K[5];
  return [
    (K[4] * shiftedU - K[1] * shiftedV) / determinant,
    (-K[3] * shiftedU + K[0] * shiftedV) / determinant,
  ];
}

function boundaryPixels(
  width: number,
  height: number,
): readonly (readonly [number, number])[] {
  const result: Array<readonly [number, number]> = [];
  const segments = 16;
  for (let index = 0; index <= segments; index++) {
    const x = ((width - 1) * index) / segments;
    const y = ((height - 1) * index) / segments;
    result.push([x, 0], [x, height - 1], [0, y], [width - 1, y]);
  }
  return result;
}

function normalizedRoi(calibration: CameraCalibrationVisualization): {
  readonly height: number;
  readonly width: number;
  readonly xOffset: number;
  readonly yOffset: number;
} {
  const roi = calibration.roi;
  const empty =
    !roi ||
    (roi.xOffset === 0 &&
      roi.yOffset === 0 &&
      roi.width === 0 &&
      roi.height === 0);
  return empty
    ? {
        height: calibration.height,
        width: calibration.width,
        xOffset: 0,
        yOffset: 0,
      }
    : {
        height: roi.height,
        width: roi.width,
        xOffset: roi.xOffset,
        yOffset: roi.yOffset,
      };
}

function positiveBinning(value: number | undefined): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? (value as number) : 1;
}

function kToProjection(K: readonly number[]): readonly number[] {
  return [K[0], K[1], K[2], 0, K[3], K[4], K[5], 0, K[6], K[7], K[8], 0];
}

function projectionToK(P: readonly number[]): readonly number[] {
  return [P[0], P[1], P[2], P[4], P[5], P[6], P[8], P[9], P[10]];
}

function applyMatrix3(
  matrix: readonly number[],
  point: readonly [number, number, number],
): readonly [number, number, number] {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z,
    matrix[3] * x + matrix[4] * y + matrix[5] * z,
    matrix[6] * x + matrix[7] * y + matrix[8] * z,
  ];
}

function applyTransposeMatrix3(
  matrix: readonly number[],
  point: readonly [number, number, number],
): readonly [number, number, number] {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[3] * y + matrix[6] * z,
    matrix[1] * x + matrix[4] * y + matrix[7] * z,
    matrix[2] * x + matrix[5] * y + matrix[8] * z,
  ];
}

function usableMatrix(
  matrix: readonly number[] | undefined,
  length: number,
): matrix is readonly number[] {
  return (
    !!matrix &&
    matrix.length >= length &&
    matrix.slice(0, length).every(Number.isFinite) &&
    matrix[0] !== 0 &&
    matrix[length === MATRIX_3_LENGTH ? 4 : 5] !== 0
  );
}

function finiteMatrix(
  matrix: readonly number[] | undefined,
  length: number,
): matrix is readonly number[] {
  return (
    !!matrix &&
    matrix.length >= length &&
    matrix.slice(0, length).every(Number.isFinite)
  );
}

function validDimensions(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    width > 0 &&
    Number.isInteger(height) &&
    height > 0
  );
}

function isFailure(
  result: CameraModelBuildResult,
): result is CameraModelBuildFailure {
  return "status" in result;
}

function failure(
  status: "invalid" | "unsupported",
  message: string,
): CameraModelBuildFailure {
  return { message, status };
}

function resolutionFailure(
  status: "invalid" | "unsupported",
  message: string,
): McapCameraModelResolution {
  return {
    equivalentDisplacementPx: null,
    message,
    status,
    suggestedMode: null,
  };
}

function readyOrFailure(
  result: CameraModelBuildResult,
  mode: McapResolvedImageGeometryMode,
): McapCameraModelResolution {
  if (isFailure(result)) {
    return {
      equivalentDisplacementPx: null,
      message: result.message,
      status: result.status,
      suggestedMode: null,
    };
  }
  return {
    equivalentDisplacementPx: 0,
    model: result,
    mode,
    status: "ready",
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
