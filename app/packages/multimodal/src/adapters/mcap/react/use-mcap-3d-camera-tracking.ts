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
import {
  nextMcap3dViewStateRestoreOnceKey,
  recordMcap3dCameraView,
  recordMcap3dTrackingAnchor,
  recordMcap3dTrackingMode,
  type Mcap3dCameraViewSnapshot,
} from "./mcap-3d-view-state";
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

export interface Mcap3dCameraTrackingRestore {
  readonly cameraView: Mcap3dCameraViewSnapshot | null;
  readonly trackingAnchor: Mcap3dCameraTrackingAnchor | null;
  readonly trackingMode: Mcap3dTrackingMode | null;
}

/**
 * Camera pose + tracking state for the 3D tile: free/follow tracking modes,
 * the tracking anchor that preserves the user's offset while following, the
 * provisional→transformed camera-pose remap, and the pose bookkeeping fed by
 * panel callbacks. State is local to the calling tile — it resets when the
 * tile remounts.
 * An optional `restore` snapshot (captured once at mount) carries the
 * previous sample's camera view: the tracking mode restores unconditionally;
 * the camera pose (free mode) or tracking anchor (follow modes) restores as
 * a pending intent that only applies once its frame gates hold, and is
 * abandoned on any deliberate camera or mode change by the user.
 */
export function useMcap3dCameraTracking({
  cameraTargetFrameId,
  frameTransforms,
  latencyDebugEnabled,
  placementStatus,
  playbackTimeNs,
  provisionalFrameIds,
  provisionalPlaybackFrame,
  restore = null,
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
  readonly restore?: Mcap3dCameraTrackingRestore | null;
  readonly selectedTopicsKey: string;
  readonly worldFrameId: string;
}) {
  // The restored tracking mode decides which camera restore is meaningful:
  // in follow modes the view is defined by the anchor (a target-relative
  // offset), in free mode by the absolute pose in its world frame.
  const restoredTrackingMode = restore?.trackingMode ?? DEFAULT_TRACKING_MODE;
  const restoresAnchor =
    isFollowTrackingMode(restoredTrackingMode) &&
    restore?.trackingAnchor?.mode === restoredTrackingMode;
  const [trackingMode, setTrackingMode] =
    useState<Mcap3dTrackingMode>(restoredTrackingMode);
  const [cameraPose, setCameraPose] = useState<PointCloudCameraPose | null>(
    null,
  );
  const [trackingAnchor, setTrackingAnchor] =
    useState<Mcap3dCameraTrackingAnchor | null>(null);
  const latestCameraPoseRef = useRef<PointCloudCameraPose | null>(null);
  const lastProvisionalViewRef = useRef<ProvisionalCameraView | null>(null);
  const hadRecentProvisionalPlacementRef = useRef(false);
  const cameraPoseRemapKeyRef = useRef<string | null>(null);
  // Pending camera restore intents, captured once at mount. They die on
  // apply, on any deliberate camera/mode change, or with the mount itself.
  const pendingCameraViewRestoreRef = useRef<Mcap3dCameraViewSnapshot | null>(
    restoresAnchor ? null : (restore?.cameraView ?? null),
  );
  const pendingAnchorRestoreRef = useRef<Mcap3dCameraTrackingAnchor | null>(
    restoresAnchor ? (restore?.trackingAnchor ?? null) : null,
  );
  const restoreMarkKeyRef = useRef<string | null>(null);
  if (restoreMarkKeyRef.current === null) {
    restoreMarkKeyRef.current = nextMcap3dViewStateRestoreOnceKey();
  }
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

  // This effect restores the previous sample's follow-mode tracking anchor
  // once the effective world/target frames match the frames the anchor was
  // captured in. It is declared before the re-anchor effect below so that in
  // the commit where the frames first match, the restored anchor lands first
  // and re-anchoring (from a panel-fitted pose) keeps it instead of creating
  // a fresh one.
  useEffect(() => {
    const anchor = pendingAnchorRestoreRef.current;
    if (
      !anchor ||
      !mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId,
        trackingMode,
        worldFrameId,
      })
    ) {
      return;
    }

    pendingAnchorRestoreRef.current = null;
    setTrackingAnchor(anchor);
    if (latencyDebugEnabled) {
      markMcapLatencyEvent(
        "3d view state restored",
        {
          field: "trackingAnchor",
          targetFrameId: anchor.targetFrameId,
          trackingMode: anchor.mode,
          worldFrameId: anchor.worldFrameId,
        },
        { onceKey: `${restoreMarkKeyRef.current}:trackingAnchor` },
      );
    }
  }, [cameraTargetFrameId, latencyDebugEnabled, trackingMode, worldFrameId]);

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

  // This effect applies the previous sample's carried-over camera pose once
  // placement is transformed and the effective world frame matches the frame
  // the pose was captured in. It deliberately bypasses the
  // provisional→transformed remap machinery below (which exists to fix poses
  // captured during provisional placement): on apply it consumes the
  // provisional-view memory, so the remap effect — declared after this one
  // and therefore run later in the same commit — short-circuits and can
  // never overwrite the restored pose.
  useLayoutEffect(() => {
    const pending = pendingCameraViewRestoreRef.current;
    if (
      !pending ||
      !mcap3dCameraPoseRestoreApplies({
        placementStatus,
        restoreWorldFrameId: pending.worldFrameId,
        worldFrameId,
      })
    ) {
      return;
    }

    pendingCameraViewRestoreRef.current = null;
    lastProvisionalViewRef.current = null;
    hadRecentProvisionalPlacementRef.current = false;
    latestCameraPoseRef.current = pending.pose;
    setCameraPose(pending.pose);
    if (latencyDebugEnabled) {
      markMcapLatencyEvent(
        "3d view state restored",
        {
          field: "cameraPose",
          pose: cameraPoseDebugDetail(pending.pose),
          worldFrameId,
        },
        { onceKey: `${restoreMarkKeyRef.current}:cameraPose` },
      );
    }
  }, [latencyDebugEnabled, placementStatus, worldFrameId]);

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
        // A deliberate camera change abandons any not-yet-applied carried
        // view: the user has re-oriented, so the previous sample's view no
        // longer applies.
        pendingCameraViewRestoreRef.current = null;
        pendingAnchorRestoreRef.current = null;
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
  const updateTrackingMode = useCallback((mode: Mcap3dTrackingMode) => {
    // A manual mode change is a user decision that supersedes any pending
    // carried-over camera restore; the mode itself is written through to the
    // session view-state store.
    pendingCameraViewRestoreRef.current = null;
    pendingAnchorRestoreRef.current = null;
    recordMcap3dTrackingMode(mode);
    setTrackingMode(mode);
  }, []);

  // This effect writes the latest uncontrolled camera pose (with the world
  // frame it is expressed in) through to the session view-state store so the
  // view can carry across sample navigation.
  useEffect(() => {
    if (cameraPose && worldFrameId) {
      recordMcap3dCameraView({ pose: cameraPose, worldFrameId });
    }
  }, [cameraPose, worldFrameId]);

  // This effect writes the follow-mode tracking anchor through to the
  // session view-state store so the follow offset can carry across sample
  // navigation.
  useEffect(() => {
    if (trackingAnchor) {
      recordMcap3dTrackingAnchor(trackingAnchor);
    }
  }, [trackingAnchor]);

  return {
    cameraPose,
    cameraTargetResolution,
    cameraTrackingWarning,
    controlledCameraPose,
    handleCameraPoseChange,
    noteRenderedCameraPose,
    panelCameraPose,
    setTrackingMode: updateTrackingMode,
    trackingAnchor,
    trackingMode,
  };
}

/**
 * Pure gate for applying a carried-over camera pose: only once placement is
 * transformed (never against a provisional source-frame preview) and only in
 * the world frame the pose was captured in — a pose is meaningless in any
 * other frame.
 */
export function mcap3dCameraPoseRestoreApplies({
  placementStatus,
  restoreWorldFrameId,
  worldFrameId,
}: {
  readonly placementStatus: Mcap3dPlacementStatus;
  readonly restoreWorldFrameId: string;
  readonly worldFrameId: string;
}): boolean {
  return (
    placementStatus === "transformed" &&
    worldFrameId !== "" &&
    restoreWorldFrameId === worldFrameId
  );
}

/**
 * Pure gate for applying a carried-over follow-mode tracking anchor: the
 * anchor's mode and both of its frames must match the effective selections.
 */
export function mcap3dTrackingAnchorRestoreApplies({
  anchor,
  cameraTargetFrameId,
  trackingMode,
  worldFrameId,
}: {
  readonly anchor: Mcap3dCameraTrackingAnchor;
  readonly cameraTargetFrameId: string;
  readonly trackingMode: Mcap3dTrackingMode;
  readonly worldFrameId: string;
}): boolean {
  return (
    isFollowTrackingMode(trackingMode) &&
    cameraTargetFrameId !== "" &&
    worldFrameId !== "" &&
    trackingAnchorMatches({
      anchor,
      mode: trackingMode,
      targetFrameId: cameraTargetFrameId,
      worldFrameId,
    })
  );
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
