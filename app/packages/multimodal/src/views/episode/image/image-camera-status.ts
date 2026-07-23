import type { CameraCalibrationVisualization } from "../../../ir";
import type {
  CameraModelResolution,
  ImageDisplayMode,
  ImageGeometryMode,
} from "../spatial/camera-geometry/camera-model";
import type { RectifiedImageDisplay } from "../spatial/camera-geometry/image-rectification";

/** User-facing names for recorded image geometry choices. */
export const IMAGE_GEOMETRY_LABELS: Record<ImageGeometryMode, string> = {
  auto: "Auto (recommended)",
  original: "Original camera",
  rectified: "Rectified",
};

/** User-facing names for image pixel presentation choices. */
export const IMAGE_DISPLAY_LABELS: Record<ImageDisplayMode, string> = {
  recorded: "Recorded pixels",
  rectified: "Rectified view",
};

type ImageDimensions = {
  readonly height: number;
  readonly width: number;
};

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
    const mode =
      resolution.mode === "original" ? "Original camera" : "Rectified";
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
      "Choose the recorded image geometry before rectifying"
    );
  }
  if (sourceDimensionMismatch && imageDims) {
    const model = cameraModelResolution.model;
    return `Cannot rectify ${imageDims.width}×${imageDims.height} pixels with ${model.width}×${model.height} calibration`;
  }
  if (cameraModelResolution.mode === "rectified") return null;
  if (rectifiedModelResolution?.status !== "ready") {
    return "Rectified view requires a usable rectified projection matrix P";
  }
  return rectifiedDisplay ? null : "Unable to build a valid rectification map";
}

/** Explains why point-cloud projection is not currently available. */
export function getProjectionIssue({
  calibration,
  calibrationStream,
  cameraModelResolution,
  enabled,
  explicitCalibrationAvailable,
  imageDims,
  sourceDimensionMismatch,
}: {
  readonly calibration: CameraCalibrationVisualization | null;
  readonly calibrationStream: string | null;
  readonly cameraModelResolution: CameraModelResolution | null;
  readonly enabled: boolean;
  readonly explicitCalibrationAvailable: boolean;
  readonly imageDims: ImageDimensions | null;
  readonly sourceDimensionMismatch: boolean;
}): string | null {
  if (!enabled) return null;
  if (!calibrationStream) {
    return "Choose a camera calibration before projecting points";
  }
  if (!explicitCalibrationAvailable) {
    return "The selected camera calibration is not available in this recording";
  }
  if (!calibration) return "Waiting for camera calibration";
  if (cameraModelResolution?.status !== "ready") {
    return cameraModelResolution?.message ?? "Camera projection is unavailable";
  }
  if (!calibration.coordinateFrameId) {
    return "Camera calibration has no coordinate frame";
  }
  if (sourceDimensionMismatch && imageDims) {
    const model = cameraModelResolution.model;
    return `Image is ${imageDims.width}×${imageDims.height}, but calibration resolves to ${model.width}×${model.height}`;
  }
  return null;
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
