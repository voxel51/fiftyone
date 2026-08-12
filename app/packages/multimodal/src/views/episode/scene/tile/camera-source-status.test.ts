import { describe, expect, it } from "vitest";
import type { CameraCalibrationVisualization } from "../../../../ir";
import { VISUALIZATION_KIND } from "../../../../ir";
import type { StreamPlaybackFrame } from "../../playback/use-stream-values";
import {
  buildCameraSourceStatuses,
  cameraSourceStatusDetails,
} from "./camera-source-status";

describe("camera source status", () => {
  it("keeps healthy cameras quiet", () => {
    expect(
      cameraSourceStatusDetails({
        calibration: "available",
        diagnostics: [],
        imageStream: "/camera/image",
        placement: {
          frameId: "camera",
          kind: "placed",
          targetFrameId: "map",
        },
      }),
    ).toEqual([]);
  });

  it("combines calibration, image pairing, and disconnected placement", () => {
    const statuses = buildCameraSourceStatuses({
      calibrationDiagnostics: [[]],
      calibrationFrames: [calibrationFrame("center_camera")],
      cameraFrustumLayerIds: [],
      cameraStreams: ["/center_camera/camera_info"],
      imageStreams: ["/center_camera/image_color/compressed"],
      pendingFrustumFrameIds: [],
      unresolvedPoseUsages: [
        {
          missingReason: "disconnected",
          sourceFrameId: "center_camera",
          sourceId: "/center_camera/camera_info",
          targetFrameId: "velodyne",
        },
      ],
      worldFrameId: "velodyne",
    });

    const status = statuses.get("/center_camera/camera_info");
    expect(status).toMatchObject({
      calibration: "available",
      imageStream: "/center_camera/image_color/compressed",
      placement: {
        frameId: "center_camera",
        kind: "disconnected",
        targetFrameId: "velodyne",
      },
    });
    expect(status && cameraSourceStatusDetails(status)).toEqual([
      "Not placed — no transform to velodyne",
    ]);
  });

  it("marks unusable calibration as non-renderable while preserving diagnostics", () => {
    const statuses = buildCameraSourceStatuses({
      calibrationDiagnostics: [
        [
          {
            capability: "camera-calibration",
            code: "camera-calibration-unavailable",
            message: "No usable camera calibration",
            severity: "warning",
          },
        ],
      ],
      calibrationFrames: [null],
      cameraFrustumLayerIds: [],
      cameraStreams: ["/left_ir/camera_info"],
      imageStreams: ["/left_ir/rotated/image_raw"],
      pendingFrustumFrameIds: [],
      unresolvedPoseUsages: [],
      worldFrameId: "velodyne",
    });

    expect(statuses.get("/left_ir/camera_info")).toEqual({
      calibration: "unavailable",
      diagnostics: ["No usable camera calibration"],
      imageStream: "/left_ir/rotated/image_raw",
      placement: { kind: "calibration-unavailable" },
    });
    const status = statuses.get("/left_ir/camera_info");
    expect(status && cameraSourceStatusDetails(status)).toEqual([
      "No calibration — frustum unavailable",
    ]);
  });

  it("distinguishes a temporal pose gap from disconnected topology", () => {
    const statuses = buildCameraSourceStatuses({
      calibrationDiagnostics: [[]],
      calibrationFrames: [calibrationFrame("camera")],
      cameraFrustumLayerIds: [],
      cameraStreams: ["/camera/info"],
      imageStreams: ["/camera/image"],
      pendingFrustumFrameIds: [],
      unresolvedPoseUsages: [
        {
          missingReason: "unavailable-at-time",
          sourceFrameId: "camera",
          sourceId: "/camera/info",
          targetFrameId: "map",
        },
      ],
      worldFrameId: "map",
    });

    const status = statuses.get("/camera/info");
    expect(status?.placement).toMatchObject({
      kind: "unavailable-at-time",
    });
    expect(status && cameraSourceStatusDetails(status)).toEqual([
      "Not placed at playhead — pose unavailable",
    ]);
  });
});

function calibrationFrame(
  coordinateFrameId: string,
): StreamPlaybackFrame<CameraCalibrationVisualization> {
  return {
    ageNs: 0n,
    contentTimeNs: 10n,
    frame: {
      coordinateFrameId,
      height: 480,
      K: [100, 0, 50, 0, 100, 40, 0, 0, 1],
      kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
      width: 640,
    },
    requestedTimeNs: 10n,
  };
}
