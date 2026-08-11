import { describe, expect, it } from "vitest";
import type { CameraCalibrationVisualization } from "../../../../ir";
import { VISUALIZATION_KIND } from "../../../../ir";
import type { StreamPlaybackFrame } from "../../playback/use-stream-values";
import {
  buildCameraSourceStatuses,
  cameraSourceStatusDetails,
} from "./camera-source-status";

describe("camera source status", () => {
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
    expect(status && cameraSourceStatusDetails(status)).toContain(
      "No transform path connects camera frame center_camera to reference frame velodyne.",
    );
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
    expect(status && cameraSourceStatusDetails(status)).toContain(
      "A transform path connects camera frame camera to reference frame map, but no pose is available at the playhead.",
    );
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
