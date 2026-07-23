import { VISUALIZATION_KIND } from "../../../ir";
import { describe, expect, it } from "vitest";

import { resolveCameraModel } from "../spatial/camera-geometry/camera-model";
import {
  describeCalibrationSelection,
  describeGeometryControl,
  getProjectionIssue,
  getRectifiedDisplayIssue,
} from "./image-camera-status";

const calibration = {
  coordinateFrameId: "camera",
  height: 100,
  K: [80, 0, 50, 0, 80, 50, 0, 0, 1],
  kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
  width: 100,
};
const ready = resolveCameraModel({
  calibration,
  geometry: "original",
  imageSourceName: "/camera/image_raw",
});

describe("image camera status", () => {
  it("describes automatic and explicit calibration choices", () => {
    const sources = [{ id: "/calibration", label: "Front calibration" }];
    expect(describeCalibrationSelection(null, "/calibration", sources)).toBe(
      "Auto · Front calibration",
    );
    expect(describeCalibrationSelection("/calibration", null, sources)).toBe(
      "Front calibration",
    );
    expect(describeCalibrationSelection(null, null, sources)).toBe(
      "Auto · no match",
    );
    expect(describeCalibrationSelection("3", null, sources)).toBe(
      "Unknown calibration source",
    );
  });

  it("reports the first actionable projection gate", () => {
    expect(
      getProjectionIssue({
        calibration: null,
        calibrationStream: null,
        cameraModelResolution: null,
        enabled: true,
        explicitCalibrationAvailable: true,
        imageDims: null,
        sourceDimensionMismatch: false,
      }),
    ).toBe("Choose a camera calibration before projecting points");
    expect(
      getProjectionIssue({
        calibration,
        calibrationStream: "/calibration",
        cameraModelResolution: ready,
        enabled: true,
        explicitCalibrationAvailable: true,
        imageDims: null,
        sourceDimensionMismatch: false,
      }),
    ).toBeNull();
  });

  it("distinguishes geometry choice from rectified-display readiness", () => {
    expect(describeGeometryControl("auto", ready)).toBe("Auto → Original");
    expect(
      getRectifiedDisplayIssue({
        calibration: null,
        calibrationStream: null,
        cameraModelResolution: null,
        display: "recorded",
        explicitCalibrationAvailable: true,
        imageDims: null,
        rectifiedDisplay: null,
        rectifiedModelResolution: null,
        sourceDimensionMismatch: false,
      }),
    ).toBeNull();
  });
});
