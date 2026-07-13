import { describe, expect, it } from "vitest";

import type { CameraCalibrationVisualization } from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  effectiveMcapCameraCalibration,
  projectMcapCameraPoint,
  resolveMcapCameraModel,
  suggestMcapImageGeometry,
} from "./mcap-camera-model";

const K = [100, 0, 50, 0, 100, 50, 0, 0, 1] as const;
const P = [100, 0, 50, 0, 0, 100, 50, 0, 0, 0, 1, 0] as const;

describe("MCAP camera model", () => {
  it("applies ROS ROI before binning", () => {
    const effective = effectiveMcapCameraCalibration(
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

  it("resolves Auto from canonical image geometry suffixes", () => {
    expect(suggestMcapImageGeometry("/camera/front/image_raw")).toBe(
      "original",
    );
    expect(
      suggestMcapImageGeometry("/camera/front/image_rect/compressed"),
    ).toBe("rectified");

    expect(suggestMcapImageGeometry("/raw/camera/front/image")).toBeNull();

    const rectified = resolveMcapCameraModel({
      calibration: calibration({
        D: [-0.2, 0.03, 0, 0, 0],
        distortionModel: "plumb_bob",
        P,
      }),
      geometry: "auto",
      imageTopic: "/camera/front/image_rect",
    });
    expect(rectified.status).toBe("ready");
    if (rectified.status !== "ready") {
      throw new Error("Expected a rectified geometry resolution");
    }
    expect(rectified.mode).toBe("rectified");

    const original = resolveMcapCameraModel({
      calibration: calibration({
        D: [-0.2, 0.03, 0, 0, 0],
        distortionModel: "plumb_bob",
        P,
      }),
      geometry: "auto",
      imageTopic: "/camera/front/image_raw/compressed",
    });
    expect(original.status).toBe("ready");
    if (original.status !== "ready") {
      throw new Error("Expected an original geometry resolution");
    }
    expect(original.mode).toBe("original");
  });

  it("keeps Auto ambiguous when the image topic has no geometry evidence", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({
        D: [-0.2, 0.03, 0, 0, 0],
        distortionModel: "plumb_bob",
        P,
      }),
      geometry: "auto",
      imageTopic: "/camera/front/image",
    });

    expect(resolved.status).toBe("ambiguous");
  });

  it("automatically accepts equivalent original and rectified models", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({ D: [0, 0, 0, 0, 0], P }),
      geometry: "auto",
      imageTopic: "/camera/front/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected a ready camera model");
    }
    expect(resolved.equivalentDisplacementPx).toBeCloseTo(0);
  });

  it("uses pixel displacement instead of coefficient magnitude for equivalence", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({
        D: [1e-8, 0, 0, 0, 0],
        distortionModel: "plumb_bob",
        P,
      }),
      geometry: "auto",
      imageTopic: "/camera/front/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected subpixel-equivalent camera models");
    }
    expect(resolved.equivalentDisplacementPx).toBeGreaterThan(0);
    expect(resolved.equivalentDisplacementPx).toBeLessThan(0.5);
  });

  it("projects plumb-bob calibration through the rational model", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({
        D: [0.1, 0, 0, 0, 0],
        distortionModel: "plumb_bob",
      }),
      geometry: "original",
      imageTopic: "/camera/front/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected a ready camera model");
    }
    expect(projectMcapCameraPoint(resolved.model, [0.5, 0, 1])?.u).toBeCloseTo(
      101.25,
    );
  });

  it("culls rational points beyond the monotonic image domain", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({
        D: [-0.2, 0, 0, 0, 0],
        distortionModel: "plumb_bob",
      }),
      geometry: "original",
      imageTopic: "/camera/front/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected a ready camera model");
    }
    expect(projectMcapCameraPoint(resolved.model, [10, 0, 1])).toBeNull();
  });

  it("blocks a rational model whose image boundary cannot be inverted", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({
        D: [-0.5, 0, 0, 0, 0],
        distortionModel: "plumb_bob",
      }),
      geometry: "original",
      imageTopic: "/camera/front/image",
    });
    expect(resolved.status).toBe("invalid");
  });

  it("keeps valid behind-camera rays for greater-than-180-degree fisheye", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({
        D: [0, 0, 0, 0],
        distortionModel: "equidistant",
        height: 480,
        K: [200, 0, 320, 0, 200, 240, 0, 0, 1],
        width: 640,
      }),
      geometry: "original",
      imageTopic: "/camera/fisheye/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected a ready camera model");
    }
    const theta = 1.58;
    const point = [Math.sin(theta), 0, Math.cos(theta)] as const;
    const projected = projectMcapCameraPoint(resolved.model, point);
    expect(point[2]).toBeLessThan(0);
    expect(projected?.u).toBeCloseTo(636, 3);
  });

  it("applies rectification before the rectified projection matrix", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({
        P,
        R: [0, -1, 0, 1, 0, 0, 0, 0, 1],
      }),
      geometry: "rectified",
      imageTopic: "/camera/front/image",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") {
      throw new Error("Expected a ready camera model");
    }
    expect(projectMcapCameraPoint(resolved.model, [1, 0, 10])).toMatchObject({
      u: 50,
      v: 60,
    });
  });

  it("rejects unsupported nonzero distortion models", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({
        D: [0.1],
        distortionModel: "vendor_magic",
      }),
      geometry: "original",
      imageTopic: "/camera/front/image",
    });
    expect(resolved.status).toBe("unsupported");
  });

  it("does not coerce declared unknown models with zero coefficients", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({
        D: [0, 0, 0, 0],
        distortionModel: "vendor_magic",
      }),
      geometry: "original",
      imageTopic: "/camera/front/image",
    });
    expect(resolved.status).toBe("unsupported");
  });

  it("rejects non-finite distortion coefficients without reordering them", () => {
    const resolved = resolveMcapCameraModel({
      calibration: calibration({
        D: [0.1, Number.NaN, 0, 0, 0],
        distortionModel: "plumb_bob",
      }),
      geometry: "original",
      imageTopic: "/camera/front/image",
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
