import type { CameraCalibrationVisualization } from "../../../ir";
import type {
  CameraModelResolution,
  ImageDimensionCompatibility,
  ImageDimensions,
  ImageDisplayMode,
  ImageGeometryMode,
} from "../spatial/camera-geometry/camera-model";
import type { RectifiedImageDisplay } from "../spatial/camera-geometry/image-rectification";

/** User-facing names for source image geometry choices. */
export const IMAGE_GEOMETRY_LABELS: Record<ImageGeometryMode, string> = {
  auto: "Auto-detect (recommended)",
  original: "Original / unrectified",
  rectified: "Already rectified",
};

/** User-facing names for image pixel presentation choices. */
export const IMAGE_DISPLAY_LABELS: Record<ImageDisplayMode, string> = {
  recorded: "As recorded",
  rectified: "Rectified / undistorted",
};

/** Image-control feedback and the severity used to present it. */
export interface ImageStatusNotice {
  readonly message: string;
  readonly severity: "info" | "warning";
}

/** Describes the explicit or inventory-selected camera calibration. */
export function describeCalibrationSelection(
  explicitStream: string | null,
  automaticStream: string | null,
  sources: readonly { readonly id: string; readonly label: string }[],
): string {
  if (explicitStream) return sourceLabel(sources, explicitStream);
  return automaticStream
    ? `Auto · ${sourceLabel(sources, automaticStream)}`
    : "Auto · no match";
}

/** Human-readable resolution of the selected image geometry. */
export function describeCameraGeometry(
  resolution: CameraModelResolution | null,
): string {
  if (!resolution) return "Waiting for camera calibration";
  if (resolution.status === "ready") {
    const mode = IMAGE_GEOMETRY_LABELS[resolution.mode];
    return `${mode} · ${resolution.model.kind}`;
  }
  if (resolution.suggestedMode) {
    return `${resolution.message}. Suggested: ${IMAGE_GEOMETRY_LABELS[resolution.suggestedMode]}`;
  }
  return resolution.message;
}

/** Compact summary for the geometry settings group. */
export function describeGeometryControl(
  geometry: ImageGeometryMode,
  resolution: CameraModelResolution | null,
): string {
  if (resolution?.status === "ready" && geometry === "auto") {
    const resolved = resolution.mode === "original" ? "Original" : "Rectified";
    return `Auto → ${resolved}`;
  }
  if (resolution?.status !== "ready" && resolution?.suggestedMode) {
    return "Choose geometry";
  }
  return IMAGE_GEOMETRY_LABELS[geometry];
}

/** Reports a successful per-image calibration scale without treating it as an issue. */
export function getCalibrationAdaptationStatus({
  calibrationDims,
  dimensionCompatibility,
  imageDims,
}: {
  readonly calibrationDims: ImageDimensions | null;
  readonly dimensionCompatibility: ImageDimensionCompatibility | null;
  readonly imageDims: ImageDimensions | null;
}): ImageStatusNotice | null {
  if (
    dimensionCompatibility !== "proportional" ||
    !calibrationDims ||
    !imageDims
  ) {
    return null;
  }
  return {
    message: `Calibration scaled from ${calibrationDims.width}×${calibrationDims.height} to match ${imageDims.width}×${imageDims.height} image`,
    severity: "info",
  };
}

/** Returns inline feedback for an unavailable or no-op rectified view. */
export function getImageViewStatus({
  cameraModelResolution,
  display,
  issue,
}: {
  readonly cameraModelResolution: CameraModelResolution | null;
  readonly display: ImageDisplayMode;
  readonly issue: string | null;
}): ImageStatusNotice | null {
  if (display !== "rectified") return null;
  if (issue) return { message: issue, severity: "warning" };
  if (
    cameraModelResolution?.status === "ready" &&
    cameraModelResolution.mode === "rectified"
  ) {
    return {
      message: "Already rectified — no remap needed",
      severity: "info",
    };
  }
  return null;
}

/** Explains why a requested rectified presentation cannot be rendered. */
export function getRectifiedDisplayIssue({
  calibration,
  calibrationStream,
  cameraModelResolution,
  display,
  explicitCalibrationAvailable,
  imageDims,
  rectifiedDisplay,
  rectifiedModelResolution,
  sourceDimensionMismatch,
}: {
  readonly calibration: CameraCalibrationVisualization | null;
  readonly calibrationStream: string | null;
  readonly cameraModelResolution: CameraModelResolution | null;
  readonly display: ImageDisplayMode;
  readonly explicitCalibrationAvailable: boolean;
  readonly imageDims: ImageDimensions | null;
  readonly rectifiedDisplay: RectifiedImageDisplay | null;
  readonly rectifiedModelResolution: CameraModelResolution | null;
  readonly sourceDimensionMismatch: boolean;
}): string | null {
  if (display !== "rectified") return null;
  if (!calibrationStream) return "Rectified view needs a camera calibration";
  if (!explicitCalibrationAvailable) {
    return "The selected camera calibration is not available in this recording";
  }
  if (!calibration) return "Waiting for camera calibration";
  if (cameraModelResolution?.status !== "ready") {
    return (
      cameraModelResolution?.message ??
      "Choose the source image geometry before rectifying"
    );
  }
  if (sourceDimensionMismatch && imageDims) {
    const model = cameraModelResolution.model;
    return `Image is ${imageDims.width}×${imageDims.height}, but calibration is ${model.width}×${model.height}; aspect ratios differ`;
  }
  if (cameraModelResolution.mode === "rectified") return null;
  if (rectifiedModelResolution?.status !== "ready") {
    return "Rectified view requires a usable rectified projection matrix P";
  }
  return rectifiedDisplay ? null : "Unable to build a valid rectification map";
}

/** Describes a point-cloud projection failure or proportional-scale assumption. */
export function getProjectionNotice({
  calibration,
  calibrationStream,
  cameraModelResolution,
  dimensionCompatibility,
  enabled,
  explicitCalibrationAvailable,
  imageDims,
}: {
  readonly calibration: CameraCalibrationVisualization | null;
  readonly calibrationStream: string | null;
  readonly cameraModelResolution: CameraModelResolution | null;
  readonly dimensionCompatibility: ImageDimensionCompatibility | null;
  readonly enabled: boolean;
  readonly explicitCalibrationAvailable: boolean;
  readonly imageDims: ImageDimensions | null;
}): ImageStatusNotice | null {
  if (!enabled) return null;
  if (!calibrationStream) {
    return warning("Choose a camera calibration before projecting points");
  }
  if (!explicitCalibrationAvailable) {
    return warning(
      "The selected camera calibration is not available in this recording",
    );
  }
  if (!calibration) return warning("Waiting for camera calibration");
  if (cameraModelResolution?.status !== "ready") {
    return warning(
      cameraModelResolution?.message ?? "Camera projection is unavailable",
    );
  }
  if (!calibration.coordinateFrameId) {
    return warning("Camera calibration has no coordinate frame");
  }
  if (dimensionCompatibility === "mismatch" && imageDims) {
    const model = cameraModelResolution.model;
    return warning(
      `Image is ${imageDims.width}×${imageDims.height}, but calibration is ${model.width}×${model.height}; aspect ratios differ`,
    );
  }
  return null;
}

function warning(message: string): ImageStatusNotice {
  return { message, severity: "warning" };
}

function sourceLabel(
  sources: readonly { readonly id: string; readonly label: string }[],
  stream: string,
): string {
  return (
    sources.find((source) => source.id === stream)?.label ??
    "Unknown calibration source"
  );
}
