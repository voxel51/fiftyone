import { VISUALIZATION_KIND } from "../../../ir";
import { describe, expect, it } from "vitest";

import {
  classifyImageDimensions,
  resolveCameraModel,
} from "../spatial/camera-geometry/camera-model";
import {
  describeCalibrationSelection,
  describeGeometryControl,
  getCalibrationAdaptationStatus,
  getImageViewStatus,
  getProjectionNotice,
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
const rectifiedReady = resolveCameraModel({
  calibration: {
    ...calibration,
    P: [80, 0, 50, 0, 0, 80, 50, 0, 0, 0, 1, 0],
    R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  },
  geometry: "rectified",
  imageSourceName: "/camera/image_rect",
});

describe("image camera status", () => {
  it("classifies exact and proportionally scaled image dimensions", () => {
    const calibrationDims = { height: 180, width: 320 };

    expect(
      classifyImageDimensions({ height: 180, width: 320 }, calibrationDims),
    ).toBe("exact");
    expect(
      classifyImageDimensions({ height: 720, width: 1280 }, calibrationDims),
    ).toBe("proportional");
    expect(
      classifyImageDimensions({ height: 540, width: 960 }, calibrationDims),
    ).toBe("proportional");
  });

  it("allows dimension rounding but rejects material aspect changes", () => {
    const calibrationDims = { height: 180, width: 320 };

    expect(
      classifyImageDimensions({ height: 721, width: 1280 }, calibrationDims),
    ).toBe("proportional");
    expect(
      classifyImageDimensions({ height: 722, width: 1280 }, calibrationDims),
    ).toBe("mismatch");
    expect(
      classifyImageDimensions({ height: 800, width: 1280 }, calibrationDims),
    ).toBe("mismatch");
  });

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
      getProjectionNotice({
        calibration: null,
        calibrationStream: null,
        cameraModelResolution: null,
        dimensionCompatibility: null,
        enabled: true,
        explicitCalibrationAvailable: true,
        imageDims: null,
      }),
    ).toEqual({
      message: "Choose a camera calibration before projecting points",
      severity: "warning",
    });
    expect(
      getProjectionNotice({
        calibration,
        calibrationStream: "/calibration",
        cameraModelResolution: ready,
        dimensionCompatibility: "exact",
        enabled: true,
        explicitCalibrationAvailable: true,
        imageDims: { height: 100, width: 100 },
      }),
    ).toBeNull();
  });

  it("reports proportional calibration scaling inline, not as a projection issue", () => {
    expect(
      getCalibrationAdaptationStatus({
        calibrationDims: { height: 1280, width: 1920 },
        dimensionCompatibility: "proportional",
        imageDims: { height: 640, width: 960 },
      }),
    ).toEqual({
      message: "Calibration scaled from 1920×1280 to match 960×640 image",
      severity: "info",
    });
    expect(
      getProjectionNotice({
        calibration,
        calibrationStream: "/calibration",
        cameraModelResolution: ready,
        dimensionCompatibility: "proportional",
        enabled: true,
        explicitCalibrationAvailable: true,
        imageDims: { height: 400, width: 400 },
      }),
    ).toBeNull();
  });

  it("keeps incompatible projection dimensions as a warning", () => {
    expect(
      getProjectionNotice({
        calibration,
        calibrationStream: "/calibration",
        cameraModelResolution: ready,
        dimensionCompatibility: "mismatch",
        enabled: true,
        explicitCalibrationAvailable: true,
        imageDims: { height: 300, width: 400 },
      }),
    ).toEqual({
      message:
        "Image is 400×300, but calibration is 100×100; aspect ratios differ",
      severity: "warning",
    });
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

  it("reports only true aspect-ratio mismatches as rectification issues", () => {
    expect(
      getRectifiedDisplayIssue({
        calibration,
        calibrationStream: "/calibration",
        cameraModelResolution: ready,
        display: "rectified",
        explicitCalibrationAvailable: true,
        imageDims: { height: 300, width: 400 },
        rectifiedDisplay: null,
        rectifiedModelResolution: rectifiedReady,
        sourceDimensionMismatch: true,
      }),
    ).toBe(
      "Image is 400×300, but calibration is 100×100; aspect ratios differ",
    );
  });

  it("explains no-op and unavailable rectified views inline", () => {
    expect(
      getImageViewStatus({
        cameraModelResolution: rectifiedReady,
        display: "rectified",
        issue: null,
      }),
    ).toEqual({
      message: "Already rectified — no remap needed",
      severity: "info",
    });
    expect(
      getImageViewStatus({
        cameraModelResolution: ready,
        display: "rectified",
        issue: "Rectified view requires a usable projection matrix P",
      }),
    ).toEqual({
      message: "Rectified view requires a usable projection matrix P",
      severity: "warning",
    });
    expect(
      getImageViewStatus({
        cameraModelResolution: rectifiedReady,
        display: "recorded",
        issue: null,
      }),
    ).toBeNull();
  });
});
