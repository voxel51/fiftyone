import type {
  CameraCalibrationVisualization,
  DecodedDiagnostic,
} from "../../../../ir";
import type { StreamPlaybackFrame } from "../../playback/use-stream-values";
import type { UnresolvedPoseUsage } from "../../status/health";

export type CameraCalibrationStatus = "available" | "loading" | "unavailable";

export type CameraPlacementStatus =
  | { readonly kind: "calibration-unavailable" }
  | { readonly kind: "calibration-loading" }
  | { readonly kind: "frame-missing" }
  | { readonly frameId: string; readonly kind: "reference-loading" }
  | {
      readonly frameId: string;
      readonly kind: "loading" | "placed";
      readonly targetFrameId: string;
    }
  | {
      readonly frameId: string;
      readonly kind:
        | "disconnected"
        | "invalid-frame"
        | "unavailable-at-time"
        | "unknown";
      readonly targetFrameId: string;
    };

/** Presentation-ready camera capability and placement state. */
export interface CameraSourceStatus {
  readonly calibration: CameraCalibrationStatus;
  readonly diagnostics: readonly string[];
  readonly imageStream?: string;
  readonly placement: CameraPlacementStatus;
}

/** Derives one combined settings status for each selected camera source. */
export function buildCameraSourceStatuses({
  calibrationDiagnostics,
  calibrationFrames,
  cameraFrustumLayerIds,
  cameraStreams,
  imageStreams,
  pendingFrustumFrameIds,
  unresolvedPoseUsages,
  worldFrameId,
}: {
  readonly calibrationDiagnostics: readonly (readonly DecodedDiagnostic[])[];
  readonly calibrationFrames: readonly (StreamPlaybackFrame<CameraCalibrationVisualization> | null)[];
  readonly cameraFrustumLayerIds: readonly string[];
  readonly cameraStreams: readonly string[];
  readonly imageStreams: readonly string[];
  readonly pendingFrustumFrameIds: readonly string[];
  readonly unresolvedPoseUsages: readonly UnresolvedPoseUsage[];
  readonly worldFrameId: string;
}): ReadonlyMap<string, CameraSourceStatus> {
  const layerIds = new Set(cameraFrustumLayerIds);
  const pendingFrameIds = new Set(pendingFrustumFrameIds);
  const unresolvedBySourceId = new Map(
    unresolvedPoseUsages.map((usage) => [usage.sourceId, usage]),
  );

  return new Map(
    cameraStreams.map((stream, index) => {
      const diagnostics = calibrationDiagnostics[index] ?? [];
      const diagnosticMessages = diagnostics.map(
        (diagnostic) => diagnostic.message,
      );
      const calibrationUnavailable = diagnostics.some(
        (diagnostic) => diagnostic.code === "camera-calibration-unavailable",
      );
      const playbackFrame = calibrationFrames[index];
      const coordinateFrameId = playbackFrame?.frame.coordinateFrameId;
      const calibration: CameraCalibrationStatus = calibrationUnavailable
        ? "unavailable"
        : playbackFrame
          ? "available"
          : "loading";
      const placement: CameraPlacementStatus = (() => {
        if (calibrationUnavailable) {
          return { kind: "calibration-unavailable" };
        }
        if (!playbackFrame) {
          return { kind: "calibration-loading" };
        }
        if (!coordinateFrameId) {
          return { kind: "frame-missing" };
        }
        if (!worldFrameId) {
          return { frameId: coordinateFrameId, kind: "reference-loading" };
        }
        const unresolved = unresolvedBySourceId.get(stream);
        if (unresolved) {
          return {
            frameId: coordinateFrameId,
            kind: unresolved.missingReason ?? "unknown",
            targetFrameId: unresolved.targetFrameId,
          };
        }
        if (pendingFrameIds.has(coordinateFrameId)) {
          return {
            frameId: coordinateFrameId,
            kind: "loading",
            targetFrameId: worldFrameId,
          };
        }
        return {
          frameId: coordinateFrameId,
          kind: layerIds.has(stream) ? "placed" : "loading",
          targetFrameId: worldFrameId,
        };
      })();

      return [
        stream,
        {
          calibration,
          diagnostics: diagnosticMessages,
          ...(imageStreams[index] ? { imageStream: imageStreams[index] } : {}),
          placement,
        },
      ] as const;
    }),
  );
}

/** Formats a combined camera status for the settings source row. */
export function cameraSourceStatusDetails(
  status: CameraSourceStatus,
): readonly string[] {
  const details: string[] = [];
  if (status.calibration === "unavailable") {
    details.push("No calibration — frustum unavailable");
  } else if (status.calibration === "loading") {
    details.push("Calibration loading…");
  } else {
    details.push(...status.diagnostics);
    if (!status.imageStream) {
      details.push("No paired image");
    }
  }

  const placementIssue = (() => {
    switch (status.placement.kind) {
      case "calibration-unavailable":
        return null;
      case "calibration-loading":
        return null;
      case "frame-missing":
        return "No camera frame — shown at scene origin";
      case "reference-loading":
        return "Waiting for reference frame…";
      case "placed":
        return null;
      case "loading":
        return "Placing camera…";
      case "disconnected":
        return `Not placed — no transform to ${status.placement.targetFrameId}`;
      case "unavailable-at-time":
        return "Not placed at playhead — pose unavailable";
      case "invalid-frame":
        return "Not placed — invalid frame";
      case "unknown":
        return "Not placed at playhead";
    }
  })();
  if (placementIssue) {
    details.push(placementIssue);
  }

  return details;
}
