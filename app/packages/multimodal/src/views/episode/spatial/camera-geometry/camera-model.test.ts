import { describe, expect, it } from "vitest";

import type { CameraCalibrationVisualization } from "../../../../ir";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  classifyImageDimensions,
  effectiveCameraCalibration,
  projectCameraPoint,
  resolveCameraModel,
  suggestImageGeometry,
} from "./camera-model";

const K = [100, 0, 50, 0, 100, 50, 0, 0, 1] as const;
const P = [100, 0, 50, 0, 0, 100, 50, 0, 0, 0, 1, 0] as const;

describe("episode camera model", () => {
  it("applies ROS ROI before binning", () => {
    const effective = effectiveCameraCalibration(
      calibration({
        binningX: 2,
        binningY: 4,
        height: 600,
        K: [400, 0, 320, 0, 420, 300, 0, 0, 1],
        P: [400, 0, 320, 8, 0, 420, 300, 12, 0, 0, 1, 0],
        roi: {
          doRectify: false,
          height: 400,
          width: 600,
          xOffset: 20,
          yOffset: 40,
        },
        width: 800,
      }),
    );

    expect(effective).toMatchObject({
      height: 100,
      K: [200, 0, 150, 0, 105, 65, 0, 0, 1],
      P: [200, 0, 150, 4, 0, 105, 65, 3, 0, 0, 1, 0],
      width: 300,
    });
  });

  it("adapts the quadruped equidistant calibration to decoded image pixels", () => {
    const hdrCalibration = calibration({
      D: [
        -0.06150262047071293, 0.003455916289334078, -0.001233506511528716,
        -1.770797322903057e-7,
      ],
      distortionModel: "equidistant",
      height: 1280,
      K: [
        984.407734999804, 0, 952.3920462113495, 0, 983.8103917846685,
        638.6385463949282, 0, 0, 1,
      ],
      P: [
        984.407734999804, 0, 952.3920462113495, 0, 0, 983.8103917846685,
        638.6385463949282, 0, 0, 0, 1, 0,
      ],
      R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      width: 1920,
    });
    const imageDimensions = { height: 640, width: 960 };
    const original = resolveCameraModel({
      calibration: hdrCalibration,
      geometry: "original",
      imageDimensions,
      imageSourceName: "/boxi/hdr/front/image_raw/compressed",
    });
    const rectified = resolveCameraModel({
      calibration: hdrCalibration,
      geometry: "rectified",
      imageDimensions,
      imageSourceName: "/boxi/hdr/front/image_raw/compressed",
    });

    expect(original.status).toBe("ready");
    expect(rectified.status).toBe("ready");
    if (
      original.status !== "ready" ||
      original.model.kind !== "equidistant" ||
      rectified.status !== "ready" ||
      rectified.model.kind !== "pinhole"
    ) {
      throw new Error("Expected adapted original and rectified camera models");
    }
    expect(original.model).toMatchObject({
      D: hdrCalibration.D,
      height: 640,
      K: [
        492.203867499902, 0, 476.1960231056747, 0, 491.90519589233423,
        319.3192731974641, 0, 0, 1,
      ],
      width: 960,
    });
    expect(rectified.model).toMatchObject({
      height: 640,
      projection: [
        492.203867499902, 0, 476.1960231056747, 0, 0, 491.90519589233423,
        319.3192731974641, 0, 0, 0, 1, 0,
      ],
      rectification: hdrCalibration.R,
      width: 960,
    });
  });

  it("applies image adaptation after ROS ROI and binning", () => {
    const adapted = resolveCameraModel({
      calibration: calibration({
        binningX: 2,
        binningY: 4,
        height: 600,
        K: [400, 0, 320, 0, 420, 300, 0, 0, 1],
        P: [400, 0, 320, 8, 0, 420, 300, 12, 0, 0, 1, 0],
        roi: {
          doRectify: false,
          height: 400,
          width: 600,
          xOffset: 20,
          yOffset: 40,
        },
        width: 800,
      }),
      geometry: "rectified",
      imageDimensions: { height: 50, width: 150 },
      imageSourceName: "/camera/front/image_rect",
    });

    expect(adapted.status).toBe("ready");
    if (adapted.status !== "ready" || adapted.model.kind !== "pinhole") {
      throw new Error("Expected an adapted rectified camera model");
    }
    expect(adapted.model).toMatchObject({
      height: 50,
      projection: [100, 0, 75, 2, 0, 52.5, 32.5, 1.5, 0, 0, 1, 0],
      width: 150,
    });
  });

  it("supports scale-up with one-pixel proportional rounding", () => {
    const calibrationDims = { height: 180, width: 320 };
    const imageDimensions = { height: 721, width: 1280 };
    expect(classifyImageDimensions(imageDimensions, calibrationDims)).toBe(
      "proportional",
    );

    const adapted = resolveCameraModel({
      calibration: calibration({
        ...calibrationDims,
        K: [80, 0, 160, 0, 90, 90, 0, 0, 1],
      }),
      geometry: "original",
      imageDimensions,
      imageSourceName: "/camera/front/image_raw",
    });

    expect(adapted.status).toBe("ready");
    if (adapted.status !== "ready" || adapted.model.kind !== "pinhole") {
      throw new Error("Expected a scaled pinhole camera model");
    }
    expect(adapted.model.width).toBe(1280);
    expect(adapted.model.height).toBe(721);
    expect(adapted.model.projection[0]).toBe(320);
    expect(adapted.model.projection[2]).toBe(640);
    expect(adapted.model.projection[5]).toBeCloseTo(360.5);
    expect(adapted.model.projection[6]).toBeCloseTo(360.5);
  });

  it("preserves exact calibration and rejects incompatible image dimensions", () => {
    const exact = resolveCameraModel({
      calibration: calibration(),
      geometry: "original",
      imageDimensions: { height: 100, width: 100 },
      imageSourceName: "/camera/front/image_raw",
    });
    const mismatch = resolveCameraModel({
      calibration: calibration(),
      geometry: "original",
      imageDimensions: { height: 300, width: 400 },
      imageSourceName: "/camera/front/image_raw",
    });

    expect(exact.status).toBe("ready");
    if (exact.status !== "ready" || exact.model.kind !== "pinhole") {
      throw new Error("Expected an exact pinhole camera model");
    }
    expect(exact.model.projection).toEqual([
      100, 0, 50, 0, 0, 100, 50, 0, 0, 0, 1, 0,
    ]);
    expect(mismatch).toMatchObject({
      message:
        "Image is 400×300, but calibration is 100×100; aspect ratios differ",
      status: "invalid",
    });
  });

  it("resolves Auto from canonical image geometry suffixes", () => {
    expect(suggestImageGeometry("/camera/front/image_raw")).toBe("original");
    expect(suggestImageGeometry("/camera/front/image_rect/compressed")).toBe(
      "rectified",
    );
    expect(
      suggestImageGeometry("/camera/front/image_raw/compressedDepth"),
    ).toBe("original");
    expect(suggestImageGeometry("/camera/front/image_raw/compress")).toBe(null);

    expect(suggestImageGeometry("/raw/camera/front/image")).toBeNull();

    const rectified = resolveCameraModel({
      calibration: calibration({
        D: [-0.2, 0.03, 0, 0, 0],
        distortionModel: "plumb_bob",
        P,
      }),
      geometry: "auto",
      imageSourceName: "/camera/front/image_rect",
    });
    expect(rectified.status).toBe("ready");
    if (rectified.status !== "ready") {
      throw new Error("Expected a rectified geometry resolution");
    }
    expect(rectified.mode).toBe("rectified");

    const original = resolveCameraModel({
      calibration: calibration({
        D: [-0.2, 0.03, 0, 0, 0],
        distortionModel: "plumb_bob",
        P,
      }),
      geometry: "auto",
      imageSourceName: "/camera/front/image_raw/compressed",
    });
    expect(original.status).toBe("ready");
    if (original.status !== "ready") {
      throw new Error("Expected an original geometry resolution");
    }
    expect(original.mode).toBe("original");
  });

  it("keeps Auto ambiguous when the image stream has no geometry evidence", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({
        D: [-0.2, 0.03, 0, 0, 0],
        distortionModel: "plumb_bob",
        P,
      }),
      geometry: "auto",
      imageSourceName: "/camera/front/image",
    });

    expect(resolved.status).toBe("ambiguous");
  });

  it("automatically accepts equivalent original and rectified models", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({ D: [0, 0, 0, 0, 0], P }),
      geometry: "auto",
      imageSourceName: "/camera/front/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected a ready camera model");
    }
    expect(resolved.equivalentDisplacementPx).toBeCloseTo(0);
  });

  it("uses pixel displacement instead of coefficient magnitude for equivalence", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({
        D: [1e-8, 0, 0, 0, 0],
        distortionModel: "plumb_bob",
        P,
      }),
      geometry: "auto",
      imageSourceName: "/camera/front/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected subpixel-equivalent camera models");
    }
    expect(resolved.equivalentDisplacementPx).toBeGreaterThan(0);
    expect(resolved.equivalentDisplacementPx).toBeLessThan(0.5);
  });

  it("projects plumb-bob calibration through the rational model", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({
        D: [0.1, 0, 0, 0, 0],
        distortionModel: "plumb_bob",
      }),
      geometry: "original",
      imageSourceName: "/camera/front/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected a ready camera model");
    }
    expect(projectCameraPoint(resolved.model, [0.5, 0, 1])?.u).toBeCloseTo(
      101.25,
    );
  });

  it("culls rational points beyond the monotonic image domain", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({
        D: [-0.2, 0, 0, 0, 0],
        distortionModel: "plumb_bob",
      }),
      geometry: "original",
      imageSourceName: "/camera/front/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected a ready camera model");
    }
    expect(projectCameraPoint(resolved.model, [10, 0, 1])).toBeNull();
  });

  it("blocks a rational model whose image boundary cannot be inverted", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({
        D: [-0.5, 0, 0, 0, 0],
        distortionModel: "plumb_bob",
      }),
      geometry: "original",
      imageSourceName: "/camera/front/image",
    });
    expect(resolved.status).toBe("invalid");
  });

  it("keeps valid behind-camera rays for greater-than-180-degree fisheye", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({
        D: [0, 0, 0, 0],
        distortionModel: "equidistant",
        height: 480,
        K: [200, 0, 320, 0, 200, 240, 0, 0, 1],
        width: 640,
      }),
      geometry: "original",
      imageSourceName: "/camera/fisheye/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected a ready camera model");
    }
    const theta = 1.58;
    const point = [Math.sin(theta), 0, Math.cos(theta)] as const;
    const projected = projectCameraPoint(resolved.model, point);
    expect(point[2]).toBeLessThan(0);
    expect(projected?.u).toBeCloseTo(636, 3);
  });

  it("applies rectification before the rectified projection matrix", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({
        P,
        R: [0, -1, 0, 1, 0, 0, 0, 0, 1],
      }),
      geometry: "rectified",
      imageSourceName: "/camera/front/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected a ready camera model");
    }
    expect(projectCameraPoint(resolved.model, [1, 0, 10])).toMatchObject({
      u: 50,
      v: 60,
    });
  });

  it("rejects unsupported nonzero distortion models", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({
        D: [0.1],
        distortionModel: "vendor_magic",
      }),
      geometry: "original",
      imageSourceName: "/camera/front/image",
    });
    expect(resolved.status).toBe("unsupported");
  });

  it("does not coerce declared unknown models with zero coefficients", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({
        D: [0, 0, 0, 0],
        distortionModel: "vendor_magic",
      }),
      geometry: "original",
      imageSourceName: "/camera/front/image",
    });
    expect(resolved.status).toBe("unsupported");
  });

  it("rejects non-finite distortion coefficients without reordering them", () => {
    const resolved = resolveCameraModel({
      calibration: calibration({
        D: [0.1, Number.NaN, 0, 0, 0],
        distortionModel: "plumb_bob",
      }),
      geometry: "original",
      imageSourceName: "/camera/front/image",
    });
    expect(resolved.status).toBe("invalid");
  });
});

function calibration(
  overrides: Partial<CameraCalibrationVisualization> = {},
): CameraCalibrationVisualization {
  return {
    height: 100,
    K,
    kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
    width: 100,
    ...overrides,
  };
}
