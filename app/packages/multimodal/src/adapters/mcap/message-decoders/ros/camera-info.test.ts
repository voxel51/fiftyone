import { describe, expect, it } from "vitest";
import { decodeRosCameraInfoRecord } from "./camera-info";

const ZERO_K = Array(9).fill(0);
const ZERO_P = Array(12).fill(0);
const USABLE_K = [100, 0, 50, 0, 100, 40, 0, 0, 1];
const USABLE_P = [100, 0, 50, 0, 0, 100, 40, 0, 0, 0, 1, 0];

describe("ROS CameraInfo classification", () => {
  it("decodes the conventional zero-sized all-zero shape as unavailable", () => {
    const output = decodeRosCameraInfoRecord(
      cameraInfo({ height: 0, K: ZERO_K, P: ZERO_P, width: 0 }),
      {},
    );

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      calibrationStatus: "unavailable",
      height: 0,
      width: 0,
    });
    expect(output.diagnostics).toEqual([
      expect.objectContaining({
        code: "camera-calibration-unavailable",
        message: expect.stringMatching(
          /CameraInfo has zero calibration dimensions.*image stream may still be available/i,
        ),
      }),
    ]);
  });

  it("reports P-only calibration as unsupported without throwing", () => {
    const output = decodeRosCameraInfoRecord(
      cameraInfo({ K: ZERO_K, P: USABLE_P }),
      {},
    );

    expect(output.visualization).toBeUndefined();
    expect(output.diagnostics?.[0]?.message).toContain("P-only");
  });

  it("keeps usable K when optional rectification matrices are malformed", () => {
    const output = decodeRosCameraInfoRecord(
      cameraInfo({ K: USABLE_K, P: [1, 2], R: [1, 2] }),
      {},
    );

    expect(output.visualization).toMatchObject({ K: USABLE_K });
    expect(output.visualization).not.toHaveProperty("P");
    expect(output.visualization).not.toHaveProperty("R");
    expect(output.diagnostics).toEqual([
      expect.objectContaining({
        code: "camera-rectification-unavailable",
        message: expect.stringContaining("P and R"),
      }),
    ]);
  });

  it("rejects contradictory zero dimensions with usable intrinsics", () => {
    expect(() =>
      decodeRosCameraInfoRecord(
        cameraInfo({ height: 0, K: USABLE_K, P: ZERO_P, width: 0 }),
        {},
      ),
    ).toThrow("Zero-sized camera info");
  });

  it("rejects zero dimensions with a nonzero optional matrix", () => {
    expect(() =>
      decodeRosCameraInfoRecord(
        cameraInfo({
          height: 0,
          K: ZERO_K,
          P: ZERO_P,
          R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          width: 0,
        }),
        {},
      ),
    ).toThrow("Zero-sized camera info");
  });

  it("rejects a required K with only one focal term", () => {
    expect(() =>
      decodeRosCameraInfoRecord(
        cameraInfo({ K: [100, 0, 50, 0, 0, 40, 0, 0, 1] }),
        {},
      ),
    ).toThrow("non-zero horizontal and vertical focal terms");
  });

  it("rejects malformed P when no usable K can be preserved", () => {
    expect(() =>
      decodeRosCameraInfoRecord(cameraInfo({ K: ZERO_K, P: [1, 2] }), {}),
    ).toThrow("P is malformed");
  });

  it("rejects missing, half-zero, negative, and non-integer dimensions", () => {
    for (const dimensions of [
      { height: 10, width: undefined },
      { height: 10, width: 0 },
      { height: -1, width: 10 },
      { height: 10.5, width: 10 },
    ]) {
      expect(() =>
        decodeRosCameraInfoRecord(
          { ...cameraInfo({ K: USABLE_K }), ...dimensions },
          {},
        ),
      ).toThrow(/camera info (height|width|dimensions)/i);
    }
  });
});

function cameraInfo(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    D: [],
    height: 80,
    K: USABLE_K,
    P: ZERO_P,
    R: Array(9).fill(0),
    binning_x: 0,
    binning_y: 0,
    distortion_model: "",
    width: 100,
    ...overrides,
  };
}
