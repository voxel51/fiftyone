import type { CameraCalibrationVisualization } from "../../../decoders";

/** Whether a camera declares distortion that requires rectified imagery. */
export function hasNonTrivialDistortion(
  calibration: Pick<CameraCalibrationVisualization, "D" | "distortionModel">,
): boolean {
  if (!calibration.distortionModel?.trim() || !calibration.D) {
    return false;
  }
  return calibration.D.some((coefficient) => Math.abs(coefficient) > 1e-9);
}
