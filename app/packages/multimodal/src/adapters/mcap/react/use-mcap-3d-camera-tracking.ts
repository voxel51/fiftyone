import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Vector3 } from "three";
import type { PointCloudVisualization } from "../../../decoders";
import type {
  PointCloudCameraPose,
  PointCloudFrameTransform,
} from "../../../visualization/panels/point-cloud";
import { markMcapLatencyEvent } from "../mcap-latency-debug";
import {
  cameraPoseFromTrackingAnchor,
  cameraTargetPoseFromFrameTransform,
  cameraTrackingAnchorFromPose,
  identityCameraTargetPose,
  isFollowTrackingMode,
  type Mcap3dCameraTargetPose,
  type Mcap3dCameraTrackingAnchor,
  type Mcap3dTrackingMode,
} from "./mcap-3d-camera";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

export const TRACKING_MODES: readonly {
  readonly label: string;
  readonly value: Mcap3dTrackingMode;
}[] = [
  {
    label: "Free",
    value: "free",
  },
  {
    label: "Follow Position (translation only)",
    value: "position",
  },
  {
    label: "Follow Heading (translation + yaw)",
    value: "heading",
  },
  {
    label: "Follow Pose (full SE3)",
    value: "pose",
  },
] as const;
const DEFAULT_TRACKING_MODE: Mcap3dTrackingMode = "free";
export type CameraPoseChangeSource = "focus" | "initial" | "interaction";
export type Mcap3dPlacementStatus =
  | "empty"
  | "provisional"
  | "transformed"
  | "unframed";
interface ProvisionalCameraView {
  readonly cameraPose: PointCloudCameraPose;
  readonly contentTimeNs: bigint;
  readonly sourceFrameId: string;
}
export type CameraTargetResolution =
  | {
      readonly pose: Mcap3dCameraTargetPose;
      readonly status: "resolved";
    }
  | {
      readonly status: "missing" | "pending";
    };

/**
 * Camera pose + tracking state for the 3D tile: free/follow tracking modes,
 * the tracking anchor that preserves the user's offset while following, the
 * provisional→transformed camera-pose remap, and the pose bookkeeping fed by
 * panel callbacks. State is local to the calling tile — it resets when the
 * tile remounts.
 */
export function useMcap3dCameraTracking({
  cameraTargetFrameId,
  frameTransforms,
  latencyDebugEnabled,
  placementStatus,
  playbackTimeNs,
  provisionalFrameIds,
  provisionalPlaybackFrame,
  selectedTopicsKey,
  worldFrameId,
}: {
  readonly cameraTargetFrameId: string;
  readonly frameTransforms: McapFrameTransformsState;
  readonly latencyDebugEnabled: boolean;
  readonly placementStatus: Mcap3dPlacementStatus;
  readonly playbackTimeNs: bigint | undefined;
  readonly provisionalFrameIds: readonly string[];
  readonly provisionalPlaybackFrame: McapTopicPlaybackFrame<PointCloudVisualization> | null;
  readonly selectedTopicsKey: string;
  readonly worldFrameId: string;
}) {
  const [trackingMode, setTrackingMode] = useState<Mcap3dTrackingMode>(
    DEFAULT_TRACKING_MODE,
  );
  const [cameraPose, setCameraPose] = useState<PointCloudCameraPose | null>(
    null,
  );
  const [trackingAnchor, setTrackingAnchor] =
    useState<Mcap3dCameraTrackingAnchor | null>(null);
  const latestCameraPoseRef = useRef<PointCloudCameraPose | null>(null);
  const lastProvisionalViewRef = useRef<ProvisionalCameraView | null>(null);
  const hadRecentProvisionalPlacementRef = useRef(false);
  const cameraPoseRemapKeyRef = useRef<string | null>(null);
  const followTrackingMode = isFollowTrackingMode(trackingMode)
    ? trackingMode
    : null;
  const cameraTargetResolution = useMemo(
    () =>
      resolveCameraTargetPose({
        cameraTargetFrameId,
        frameTransforms,
        playbackTimeNs,
        worldFrameId,
      }),
    [cameraTargetFrameId, frameTransforms, playbackTimeNs, worldFrameId],
  );
  const cameraTargetPose =
    cameraTargetResolution.status === "resolved"
      ? cameraTargetResolution.pose
      : null;
  const controlledCameraPose = useMemo(() => {
    if (
      !followTrackingMode ||
      !trackingAnchor ||
      !cameraTargetPose ||
      !trackingAnchorMatches({
        anchor: trackingAnchor,
        mode: followTrackingMode,
        targetFrameId: cameraTargetFrameId,
        worldFrameId,
      })
    ) {
      return null;
    }

    return cameraPoseFromTrackingAnchor(trackingAnchor, cameraTargetPose);
  }, [
    cameraTargetFrameId,
    cameraTargetPose,
    followTrackingMode,
    trackingAnchor,
    worldFrameId,
  ]);
  const panelCameraPose = controlledCameraPose ?? cameraPose;
  const cameraTrackingWarning = useMemo(
    () =>
      cameraTrackingWarningText({
        cameraTargetFrameId,
        cameraTargetStatus: cameraTargetResolution.status,
        trackingMode,
        worldFrameId,
      }),
    [
      cameraTargetFrameId,
      cameraTargetResolution.status,
      trackingMode,
      worldFrameId,
    ],
  );

  // Re-anchor when the user changes tracking mode or target frame. During
  // normal playback the anchor remains stable and the target transform moves.
  useEffect(() => {
    if (!followTrackingMode) {
      setTrackingAnchor(null);
      return;
    }
    if (!cameraTargetPose || !cameraTargetFrameId || !worldFrameId) {
      return;
    }

    setTrackingAnchor((current) => {
      if (
        trackingAnchorMatches({
          anchor: current,
          mode: followTrackingMode,
          targetFrameId: cameraTargetFrameId,
          worldFrameId,
        })
      ) {
        return current;
      }

      const basePose = latestCameraPoseRef.current ?? cameraPose;
      if (!basePose) {
        return current;
      }

      return cameraTrackingAnchorFromPose({
        cameraPose: basePose,
        mode: followTrackingMode,
        targetFrameId: cameraTargetFrameId,
        targetPose: cameraTargetPose,
        worldFrameId,
      });
    });
  }, [
    cameraPose,
    cameraTargetFrameId,
    cameraTargetPose,
    followTrackingMode,
    worldFrameId,
  ]);

  useEffect(() => {
    const latestPose = controlledCameraPose ?? cameraPose;
    if (latestPose) {
      latestCameraPoseRef.current = latestPose;
    }
  }, [cameraPose, controlledCameraPose]);

  useEffect(() => {
    lastProvisionalViewRef.current = null;
    hadRecentProvisionalPlacementRef.current = false;
    cameraPoseRemapKeyRef.current = null;
  }, [selectedTopicsKey]);

  const rememberProvisionalCameraPose = useCallback(
    (pose: PointCloudCameraPose) => {
      if (placementStatus !== "provisional" || !provisionalPlaybackFrame) {
        return;
      }

      const sourceFrameId =
        provisionalPlaybackFrame.frame.coordinateFrameId?.trim();
      if (!sourceFrameId || !provisionalFrameIds.includes(sourceFrameId)) {
        return;
      }

      lastProvisionalViewRef.current = {
        cameraPose: pose,
        contentTimeNs: provisionalPlaybackFrame.contentTimeNs,
        sourceFrameId,
      };
    },
    [placementStatus, provisionalFrameIds, provisionalPlaybackFrame],
  );

  useLayoutEffect(() => {
    if (placementStatus === "provisional") {
      hadRecentProvisionalPlacementRef.current = true;
      return;
    }
    if (
      placementStatus !== "transformed" ||
      !hadRecentProvisionalPlacementRef.current
    ) {
      return;
    }

    hadRecentProvisionalPlacementRef.current = false;
    if (controlledCameraPose || !worldFrameId) {
      return;
    }

    const provisionalView = lastProvisionalViewRef.current;
    if (!provisionalView || provisionalView.sourceFrameId === worldFrameId) {
      return;
    }

    const remapKey = `${provisionalView.sourceFrameId}->${worldFrameId}:${provisionalView.contentTimeNs.toString()}`;
    if (cameraPoseRemapKeyRef.current === remapKey) {
      return;
    }

    const resolution = frameTransforms.resolve(
      provisionalView.sourceFrameId,
      worldFrameId,
      provisionalView.contentTimeNs,
    );
    if (resolution.status !== "resolved") {
      return;
    }

    const remappedPose = transformCameraPose(
      provisionalView.cameraPose,
      resolution.transform,
    );
    cameraPoseRemapKeyRef.current = remapKey;
    latestCameraPoseRef.current = remappedPose;
    setCameraPose(remappedPose);

    if (latencyDebugEnabled) {
      markMcapLatencyEvent("3d camera pose remapped", {
        contentTimeNs: provisionalView.contentTimeNs.toString(),
        from: cameraPoseDebugDetail(provisionalView.cameraPose),
        sourceFrameId: provisionalView.sourceFrameId,
        targetFrameId: worldFrameId,
        to: cameraPoseDebugDetail(remappedPose),
        transformKind: resolution.resolutionKind ?? "unknown",
      });
    }
  }, [
    controlledCameraPose,
    frameTransforms,
    latencyDebugEnabled,
    placementStatus,
    worldFrameId,
  ]);

  const handleCameraPoseChange = useCallback(
    (pose: PointCloudCameraPose, source: CameraPoseChangeSource) => {
      latestCameraPoseRef.current = pose;
      rememberProvisionalCameraPose(pose);
      if (source !== "initial") {
        setCameraPose(pose);
      }
      if (
        !followTrackingMode ||
        !cameraTargetPose ||
        !cameraTargetFrameId ||
        !worldFrameId
      ) {
        return;
      }

      setTrackingAnchor(
        cameraTrackingAnchorFromPose({
          cameraPose: pose,
          mode: followTrackingMode,
          targetFrameId: cameraTargetFrameId,
          targetPose: cameraTargetPose,
          worldFrameId,
        }),
      );
    },
    [
      cameraTargetFrameId,
      cameraTargetPose,
      followTrackingMode,
      rememberProvisionalCameraPose,
      worldFrameId,
    ],
  );
  const noteRenderedCameraPose = useCallback(
    (pose: PointCloudCameraPose) => {
      latestCameraPoseRef.current = pose;
      rememberProvisionalCameraPose(pose);
    },
    [rememberProvisionalCameraPose],
  );

  return {
    cameraPose,
    cameraTargetResolution,
    cameraTrackingWarning,
    controlledCameraPose,
    handleCameraPoseChange,
    noteRenderedCameraPose,
    panelCameraPose,
    setTrackingMode,
    trackingAnchor,
    trackingMode,
  };
}

function resolveCameraTargetPose({
  cameraTargetFrameId,
  frameTransforms,
  playbackTimeNs,
  worldFrameId,
}: {
  readonly cameraTargetFrameId: string;
  readonly frameTransforms: McapFrameTransformsState;
  readonly playbackTimeNs: bigint | undefined;
  readonly worldFrameId: string;
}): CameraTargetResolution {
  if (!cameraTargetFrameId || !worldFrameId) {
    return { status: "pending" };
  }
  if (cameraTargetFrameId === worldFrameId) {
    return {
      pose: identityCameraTargetPose(),
      status: "resolved",
    };
  }
  if (playbackTimeNs === undefined) {
    return { status: "pending" };
  }

  const resolution = frameTransforms.resolve(
    cameraTargetFrameId,
    worldFrameId,
    playbackTimeNs,
  );
  if (resolution.status !== "resolved") {
    return { status: resolution.status };
  }

  return {
    pose: cameraTargetPoseFromFrameTransform(resolution.transform),
    status: "resolved",
  };
}

function trackingAnchorMatches({
  anchor,
  mode,
  targetFrameId,
  worldFrameId,
}: {
  readonly anchor: Mcap3dCameraTrackingAnchor | null;
  readonly mode: Exclude<Mcap3dTrackingMode, "free">;
  readonly targetFrameId: string;
  readonly worldFrameId: string;
}): boolean {
  return (
    anchor?.mode === mode &&
    anchor.targetFrameId === targetFrameId &&
    anchor.worldFrameId === worldFrameId
  );
}

function cameraTrackingWarningText({
  cameraTargetFrameId,
  cameraTargetStatus,
  trackingMode,
  worldFrameId,
}: {
  readonly cameraTargetFrameId: string;
  readonly cameraTargetStatus: CameraTargetResolution["status"];
  readonly trackingMode: Mcap3dTrackingMode;
  readonly worldFrameId: string;
}) {
  if (
    !isFollowTrackingMode(trackingMode) ||
    cameraTargetStatus !== "missing" ||
    !cameraTargetFrameId ||
    !worldFrameId
  ) {
    return null;
  }

  return `Camera target transform unavailable: ${cameraTargetFrameId} to ${worldFrameId}`;
}

function transformCameraPose(
  pose: PointCloudCameraPose,
  transform: PointCloudFrameTransform,
): PointCloudCameraPose {
  return {
    position: transformCameraPosePoint(pose.position, transform),
    target: transformCameraPosePoint(pose.target, transform),
  };
}

function transformCameraPosePoint(
  point: PointCloudCameraPose["position"],
  transform: PointCloudFrameTransform,
): PointCloudCameraPose["position"] {
  const transformed = new Vector3(point[0], point[1], point[2]);
  const rotationLength = Math.hypot(
    transform.rotation.w,
    transform.rotation.x,
    transform.rotation.y,
    transform.rotation.z,
  );
  if (rotationLength > 0) {
    transformed.applyQuaternion(transform.rotation.clone().normalize());
  }
  transformed.add(transform.translation);

  return [transformed.x, transformed.y, transformed.z];
}

/**
 * Rounded camera-pose detail for latency-debug events.
 */
export function cameraPoseDebugDetail(pose: PointCloudCameraPose) {
  return {
    position: pose.position.map(roundDebugNumber),
    target: pose.target.map(roundDebugNumber),
  };
}

function roundDebugNumber(value: number): number {
  return Number(value.toFixed(3));
}
