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
  DEFAULT_MCAP_3D_SCENE_UP_AXIS,
  type Mcap3dSceneUpAxis,
} from "./mcap-3d-scene-up";
import { buildMcapCameraTargetNotice } from "./mcap-health";
import {
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
    label: "Follow Pose (translation + rotation)",
    value: "pose",
  },
] as const;
const DEFAULT_TRACKING_MODE: Mcap3dTrackingMode = "position";
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
interface HeldControlledCameraPose {
  readonly mode: Exclude<Mcap3dTrackingMode, "free">;
  readonly pose: PointCloudCameraPose;
  readonly targetFrameId: string;
  readonly worldFrameId: string;
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
 * provisional→transformed and world-frame-change camera-pose remaps, and the
 * pose bookkeeping fed by panel callbacks. State is local to the calling
 * tile — it resets when the tile remounts.
 * An optional `restore` snapshot (captured once at mount) carries the
 * previous sample's camera view: the tracking mode restores unconditionally;
 * the camera pose (free mode) or tracking anchor (follow modes) restores as
 * a pending intent that only applies once its frame gates hold, and is
 * abandoned on any deliberate camera or mode change by the user.
 */
export function useMcap3dCameraTracking({
  cameraTargetFrameId,
  frameTransforms,
  placementStatus,
  playbackTimeNs,
  provisionalFrameIds,
  provisionalPlaybackFrame,
  restore = null,
  sceneUpAxis = DEFAULT_MCAP_3D_SCENE_UP_AXIS,
  selectedTopicsKey,
  worldFrameId,
}: {
  readonly cameraTargetFrameId: string;
  readonly frameTransforms: McapFrameTransformsState;
  readonly placementStatus: Mcap3dPlacementStatus;
  readonly playbackTimeNs: bigint | undefined;
  readonly provisionalFrameIds: readonly string[];
  readonly provisionalPlaybackFrame: McapTopicPlaybackFrame<PointCloudVisualization> | null;
  readonly restore?: Mcap3dCameraTrackingRestore | null;
  readonly sceneUpAxis?: Mcap3dSceneUpAxis;
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
  const heldControlledCameraPoseRef = useRef<HeldControlledCameraPose | null>(
    null,
  );
  const lastProvisionalViewRef = useRef<ProvisionalCameraView | null>(null);
  const hadRecentProvisionalPlacementRef = useRef(false);
  const cameraPoseRemapKeyRef = useRef<string | null>(null);
  const worldFrameRemapTrackerRef = useRef(worldFrameId);
  // Pending camera restore intents, captured once at mount. They die on
  // apply, on any deliberate camera/mode change, or with the mount itself.
  const pendingCameraViewRestoreRef = useRef<Mcap3dCameraViewSnapshot | null>(
    restoresAnchor ? null : (restore?.cameraView ?? null),
  );
  const pendingAnchorRestoreRef = useRef<Mcap3dCameraTrackingAnchor | null>(
    restoresAnchor ? (restore?.trackingAnchor ?? null) : null,
  );
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
      !trackingAnchorMatches({
        anchor: trackingAnchor,
        mode: followTrackingMode,
        sceneUpAxis,
        targetFrameId: cameraTargetFrameId,
        worldFrameId,
      })
    ) {
      return null;
    }
    if (cameraTargetPose) {
      return cameraPoseFromTrackingAnchor(
        trackingAnchor,
        cameraTargetPose,
        sceneUpAxis,
      );
    }

    // The target transform is momentarily unresolved (a seek outside the
    // indexed window): hold the last controlled pose instead of falling back
    // to the stale uncontrolled pose — a frozen follow view beats a double
    // camera jump. `missing` still falls through to the fallback plus the
    // camera-target notice.
    const held = heldControlledCameraPoseRef.current;
    if (
      cameraTargetResolution.status === "pending" &&
      held &&
      held.mode === followTrackingMode &&
      held.targetFrameId === cameraTargetFrameId &&
      held.worldFrameId === worldFrameId
    ) {
      return held.pose;
    }

    return null;
  }, [
    cameraTargetFrameId,
    cameraTargetPose,
    cameraTargetResolution.status,
    followTrackingMode,
    sceneUpAxis,
    trackingAnchor,
    worldFrameId,
  ]);
  const panelCameraPose = controlledCameraPose ?? cameraPose;
  const cameraTrackingNotice = useMemo(
    () =>
      buildMcapCameraTargetNotice({
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
        sceneUpAxis,
        trackingMode,
        worldFrameId,
      })
    ) {
      return;
    }

    pendingAnchorRestoreRef.current = null;
    setTrackingAnchor(anchor);
  }, [cameraTargetFrameId, sceneUpAxis, trackingMode, worldFrameId]);

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
          sceneUpAxis,
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
        sceneUpAxis,
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
    sceneUpAxis,
    worldFrameId,
  ]);

  useEffect(() => {
    const latestPose = controlledCameraPose ?? cameraPose;
    if (latestPose) {
      latestCameraPoseRef.current = latestPose;
    }
  }, [cameraPose, controlledCameraPose]);

  // This effect remembers the last controlled pose together with the frames
  // it was derived for, so the memo above can hold it through transient
  // pending target resolutions without ever serving a wrong-frame pose.
  useEffect(() => {
    if (controlledCameraPose && followTrackingMode) {
      heldControlledCameraPoseRef.current = {
        mode: followTrackingMode,
        pose: controlledCameraPose,
        targetFrameId: cameraTargetFrameId,
        worldFrameId,
      };
    }
  }, [
    cameraTargetFrameId,
    controlledCameraPose,
    followTrackingMode,
    worldFrameId,
  ]);

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

  // This layout effect keeps the view meaningful across a mid-mount world
  // frame change (e.g. base_link → map): all content is re-placed through
  // T(newWorld ← oldWorld), so re-expressing the displayed pose through the
  // same transform shows the identical view of the identical content. It is
  // declared before the carried-view restore below so a carried view gated
  // on the new world frame still wins the commit. When the two world frames
  // have no resolvable path, a stale-frame pose is worse than a refit: the
  // pose is dropped and the panel falls back to fitting the re-placed scene.
  useLayoutEffect(() => {
    const previousWorldFrameId = worldFrameRemapTrackerRef.current;
    if (previousWorldFrameId === worldFrameId) {
      return;
    }

    worldFrameRemapTrackerRef.current = worldFrameId;
    if (
      !previousWorldFrameId ||
      !worldFrameId ||
      // During provisional placement the displayed pose lives in the
      // provisional source frame, not the old world frame; the
      // provisional→transformed remap below owns that pose and maps it
      // straight into the current world frame when placement resolves.
      placementStatus === "provisional" ||
      hadRecentProvisionalPlacementRef.current
    ) {
      return;
    }
    const pendingView = pendingCameraViewRestoreRef.current;
    if (pendingView && pendingView.worldFrameId === worldFrameId) {
      // The carried-over view was captured in the new world frame; the
      // restore below applies it this commit and must win.
      return;
    }
    const basePose = latestCameraPoseRef.current;
    if (!basePose) {
      return;
    }

    const resolution =
      playbackTimeNs === undefined
        ? null
        : frameTransforms.resolve(
            previousWorldFrameId,
            worldFrameId,
            playbackTimeNs,
          );
    if (resolution?.status !== "resolved") {
      latestCameraPoseRef.current = null;
      setCameraPose(null);
      return;
    }

    const remappedPose = transformCameraPose(basePose, resolution.transform);
    latestCameraPoseRef.current = remappedPose;
    setCameraPose(remappedPose);
  }, [frameTransforms, placementStatus, playbackTimeNs, worldFrameId]);

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
  }, [placementStatus, worldFrameId]);

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
  }, [controlledCameraPose, frameTransforms, placementStatus, worldFrameId]);

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
          sceneUpAxis,
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
      sceneUpAxis,
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
  // Stable getter for the last displayed pose (controlled, held, or fitted —
  // whatever actually painted). View-preset shortcuts read it to preserve the
  // user's current zoom distance without re-rendering per pose change.
  const getDisplayedCameraPose = useCallback(
    (): PointCloudCameraPose | null => latestCameraPoseRef.current,
    [],
  );
  const updateTrackingMode = useCallback((mode: Mcap3dTrackingMode) => {
    // A manual mode change is a user decision that supersedes any pending
    // carried-over camera restore; the mode itself is written through to the
    // session view-state store.
    pendingCameraViewRestoreRef.current = null;
    pendingAnchorRestoreRef.current = null;
    // Freeze the currently displayed pose as the uncontrolled base: switching
    // modes must never move the camera. Without this, leaving a follow mode
    // would fall back to the pose from the last drag, snapping the view back
    // by however far the target has travelled since.
    const latestPose = latestCameraPoseRef.current;
    if (latestPose) {
      setCameraPose(latestPose);
    }
    recordMcap3dTrackingMode(mode);
    setTrackingMode(mode);
  }, []);

  // This effect writes the latest uncontrolled camera pose (with the world
  // frame it is expressed in) through to the session view-state store so the
  // view can carry across sample navigation. Gated on transformed placement:
  // during provisional placement the scene renders in its source frame, so a
  // pose captured then is NOT a world-frame pose yet — recording it would
  // restore a wrong-frame view on the next sample (the remap machinery that
  // would have corrected it in-sample cannot run against the store).
  useEffect(() => {
    if (cameraPose && worldFrameId && placementStatus === "transformed") {
      recordMcap3dCameraView({ pose: cameraPose, worldFrameId });
    }
  }, [cameraPose, placementStatus, worldFrameId]);

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
    cameraTrackingNotice,
    controlledCameraPose,
    getDisplayedCameraPose,
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
 * anchor's mode, scene-up, and both of its frames must match the effective
 * selections.
 */
export function mcap3dTrackingAnchorRestoreApplies({
  anchor,
  cameraTargetFrameId,
  sceneUpAxis,
  trackingMode,
  worldFrameId,
}: {
  readonly anchor: Mcap3dCameraTrackingAnchor;
  readonly cameraTargetFrameId: string;
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
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
      sceneUpAxis,
      targetFrameId: cameraTargetFrameId,
      worldFrameId,
    })
  );
}

/**
 * Resolves a frame's pose in the world frame at the playhead. Exported for
 * the ego/top view-preset shortcuts, which anchor on the same resolution.
 */
export function resolveCameraTargetPose({
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
  sceneUpAxis,
  targetFrameId,
  worldFrameId,
}: {
  readonly anchor: Mcap3dCameraTrackingAnchor | null;
  readonly mode: Exclude<Mcap3dTrackingMode, "free">;
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
  readonly targetFrameId: string;
  readonly worldFrameId: string;
}): boolean {
  return (
    anchor?.mode === mode &&
    anchor.sceneUpAxis === sceneUpAxis &&
    anchor.targetFrameId === targetFrameId &&
    anchor.worldFrameId === worldFrameId
  );
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
