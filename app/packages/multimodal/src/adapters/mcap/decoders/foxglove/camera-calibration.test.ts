import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../visualization";
import { foxgloveCameraCalibrationDecoder } from "./camera-calibration";
import { decodeProtobufMessage } from "./protobuf";

vi.mock("./protobuf", () => ({
  decodeProtobufMessage: vi.fn(),
}));

const EMPTY_BYTES = new Uint8Array(0);
const NUSCENES_K = [1252.8, 0, 826.6, 0, 1252.8, 469.9, 0, 0, 1];
const IDENTITY_R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const NUSCENES_P = [1252.8, 0, 826.6, 0, 0, 1252.8, 469.9, 0, 0, 0, 1, 0];
const mockDecode = vi.mocked(decodeProtobufMessage);

beforeEach(() => {
  mockDecode.mockReset();
});

describe("foxgloveCameraCalibrationDecoder", () => {
  it("declares the foxglove.CameraCalibration payload descriptor", () => {
    expect(foxgloveCameraCalibrationDecoder.payload).toMatchObject({
      encoding: "protobuf",
      schema: "foxglove.CameraCalibration",
      schemaEncoding: "protobuf",
    });
  });

  it("decodes NuScenes-style calibration with K/R/P and no distortion", () => {
    mockDecode.mockReturnValue(
      calibrationMessage({
        K: NUSCENES_K,
        P: NUSCENES_P,
        R: IDENTITY_R,
      }),
    );

    const { attributes, timing, visualization } =
      foxgloveCameraCalibrationDecoder.decode(EMPTY_BYTES, {});

    expect(visualization?.kind).toBe(VISUALIZATION_KIND.CAMERA_CALIBRATION);
    if (visualization?.kind !== VISUALIZATION_KIND.CAMERA_CALIBRATION) {
      throw new Error("Expected camera calibration visualization");
    }
    expect(visualization).toMatchObject({
      coordinateFrameId: "CAM_FRONT",
      height: 900,
      K: NUSCENES_K,
      P: NUSCENES_P,
      R: IDENTITY_R,
      timestampNs: 12_000_000_034n,
      width: 1600,
    });
    expect(visualization.D).toBeUndefined();
    expect(visualization.distortionModel).toBeUndefined();
    expect(attributes).toMatchObject({
      frameId: "CAM_FRONT",
      height: 900,
      width: 1600,
    });
    expect(timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
  });

  it("drops malformed rectification/projection matrices but keeps K", () => {
    mockDecode.mockReturnValue(
      calibrationMessage({
        K: NUSCENES_K,
        P: [1, 2, 3],
        R: [1, 0],
      }),
    );

    const { visualization } = foxgloveCameraCalibrationDecoder.decode(
      EMPTY_BYTES,
      {},
    );
    if (visualization?.kind !== VISUALIZATION_KIND.CAMERA_CALIBRATION) {
      throw new Error("Expected camera calibration visualization");
    }
    expect(visualization.K).toEqual(NUSCENES_K);
    expect(visualization.R).toBeUndefined();
    expect(visualization.P).toBeUndefined();
  });

  it("keeps distortion data when present", () => {
    mockDecode.mockReturnValue(
      calibrationMessage({
        D: [0.1, -0.2, 0, 0, 0.05],
        distortionModel: "plumb_bob",
        K: NUSCENES_K,
      }),
    );

    const { visualization } = foxgloveCameraCalibrationDecoder.decode(
      EMPTY_BYTES,
      {},
    );
    if (visualization?.kind !== VISUALIZATION_KIND.CAMERA_CALIBRATION) {
      throw new Error("Expected camera calibration visualization");
    }
    expect(visualization.distortionModel).toBe("plumb_bob");
    expect(visualization.D).toEqual([0.1, -0.2, 0, 0, 0.05]);
  });

  it("rejects invalid intrinsics and dimensions", () => {
    mockDecode.mockReturnValue(calibrationMessage({ K: [1, 2, 3] }));
    expect(() =>
      foxgloveCameraCalibrationDecoder.decode(EMPTY_BYTES, {}),
    ).toThrow("Camera calibration K must have 9 values, got 3");

    mockDecode.mockReturnValue(calibrationMessage({ K: NUSCENES_K, width: 0 }));
    expect(() =>
      foxgloveCameraCalibrationDecoder.decode(EMPTY_BYTES, {}),
    ).toThrow("Invalid camera calibration width 0");

    mockDecode.mockReturnValue(
      calibrationMessage({ height: -1, K: NUSCENES_K }),
    );
    expect(() =>
      foxgloveCameraCalibrationDecoder.decode(EMPTY_BYTES, {}),
    ).toThrow("Invalid camera calibration height -1");
  });
});

function calibrationMessage({
  D,
  distortionModel,
  height = 900,
  K,
  P,
  R,
  width = 1600,
}: {
  readonly D?: readonly number[];
  readonly distortionModel?: string;
  readonly height?: number;
  readonly K: readonly number[];
  readonly P?: readonly number[];
  readonly R?: readonly number[];
  readonly width?: number;
}): Record<string, unknown> {
  return {
    ...(D ? { D } : {}),
    ...(distortionModel ? { distortionModel } : {}),
    frameId: "CAM_FRONT",
    height,
    K,
    ...(P ? { P } : {}),
    ...(R ? { R } : {}),
    timestamp: { nanos: 34n, seconds: 12n },
    width,
  };
}
