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
  const calibrationDetail =
    status.calibration === "available"
      ? "Calibration available"
      : status.calibration === "loading"
        ? "Calibration loading"
        : "Calibration unavailable";
  const imageDetail = status.imageStream
    ? `Image paired: ${status.imageStream}`
    : "No image stream paired";
  const placementDetail = (() => {
    switch (status.placement.kind) {
      case "calibration-unavailable":
        return "Frustum unavailable because camera calibration is required.";
      case "calibration-loading":
        return "Waiting for calibration before placing the camera frustum.";
      case "frame-missing":
        return "CameraInfo declares no camera frame; showing the frustum at the scene origin.";
      case "reference-loading":
        return `Waiting for a reference frame before placing camera frame ${status.placement.frameId}.`;
      case "placed":
        return `Placed camera frame ${status.placement.frameId} in reference frame ${status.placement.targetFrameId}.`;
      case "loading":
        return `Transform loading for camera frame ${status.placement.frameId} to reference frame ${status.placement.targetFrameId}.`;
      case "disconnected":
        return `No transform path connects camera frame ${status.placement.frameId} to reference frame ${status.placement.targetFrameId}.`;
      case "unavailable-at-time":
        return `A transform path connects camera frame ${status.placement.frameId} to reference frame ${status.placement.targetFrameId}, but no pose is available at the playhead.`;
      case "invalid-frame":
        return "The camera or reference frame identifier is invalid.";
      case "unknown":
        return `No transform connects camera frame ${status.placement.frameId} to reference frame ${status.placement.targetFrameId} at the playhead.`;
    }
  })();

  return [
    `${calibrationDetail} · ${imageDetail}`,
    ...status.diagnostics,
    placementDetail,
  ];
}
