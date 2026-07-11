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
  cameraTargetPoseFromFrameTransform,
  identityCameraTargetPose,
  isFollowTrackingMode,
  trackingAnchorMatches,
  type CameraTargetResolution,
  type Mcap3dCameraTrackingAnchor,
  type Mcap3dTrackingMode,
} from "./mcap-3d-camera";
import type { Mcap3dCameraRigSample } from "./mcap-3d-camera-rig-core";
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
export type { CameraTargetResolution } from "./mcap-3d-camera";

export interface Mcap3dCameraTrackingRestore {
  readonly cameraView: Mcap3dCameraViewSnapshot | null;
  readonly trackingAnchor: Mcap3dCameraTrackingAnchor | null;
  readonly trackingMode: Mcap3dTrackingMode | null;
}

/**
 * Boundary-commit camera tracking state for the 3D tile.
 *
 * The camera itself is owned imperatively: OrbitControls moves it during
 * gestures and the Mcap3dCameraRig composes follow modes per target update,
 * both inside the canvas. This hook holds only *intent* (tracking mode,
 * frame-derived target resolution) and *boundary snapshots*:
 *
 * - `poseCommand` is the one downward channel — the last external pose the
 *   camera was told to adopt (restore, world-frame remap, provisional remap,
 *   view preset, focus/recenter, mode-switch freeze) plus a one-shot
 *   first-gesture pin that holds the panel out of fit-fallback. Interaction
 *   never writes it; gestures cost zero React renders.
 * - The rig reports upward through `onPoseSample` (ref-writes at frame
 *   rate), `onGestureStart` (abandons carried-over restores, pins the fit
 *   latch), and `onCommit` (per-gesture persistence to the view-state
 *   store).
 *
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
  const [poseCommand, setPoseCommand] = useState<PointCloudCameraPose | null>(
    null,
  );
  const [adoptAnchor, setAdoptAnchor] =
    useState<Mcap3dCameraTrackingAnchor | null>(null);
  const latestCameraPoseRef = useRef<PointCloudCameraPose | null>(null);
  const latestAnchorRef = useRef<Mcap3dCameraTrackingAnchor | null>(null);
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
  // Recording gate readable from imperative callbacks (rig commits, unmount)
  // without re-binding them per render. Render-phase ref write: idempotent.
  const recordGateRef = useRef({ placementStatus, worldFrameId });
  recordGateRef.current = { placementStatus, worldFrameId };
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

  const recordCameraViewIfEligible = useCallback(
    (pose: PointCloudCameraPose) => {
      // Gated on transformed placement: a pose captured during provisional
      // placement is NOT a world-frame pose yet — recording it would restore
      // a wrong-frame view on the next sample.
      const gate = recordGateRef.current;
      if (gate.worldFrameId && gate.placementStatus === "transformed") {
        recordMcap3dCameraView({ pose, worldFrameId: gate.worldFrameId });
      }
    },
    [],
  );

  // This effect hands the previous sample's follow-mode tracking anchor to
  // the rig once the effective world/target frames match the frames the
  // anchor was captured in. Adoption is one-shot per anchor object (the rig
  // tracks the last adopted identity), so the value staying in state cannot
  // re-apply after later mode or frame round-trips.
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
    latestAnchorRef.current = anchor;
    setAdoptAnchor(anchor);
  }, [cameraTargetFrameId, sceneUpAxis, trackingMode, worldFrameId]);

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
  // pose command (fit-pin latch included) is dropped and the panel falls
  // back to fitting the re-placed scene.
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
      setPoseCommand(null);
      return;
    }

    const remappedPose = transformCameraPose(basePose, resolution.transform);
    latestCameraPoseRef.current = remappedPose;
    setPoseCommand(remappedPose);
    recordCameraViewIfEligible(remappedPose);
  }, [
    frameTransforms,
    placementStatus,
    playbackTimeNs,
    recordCameraViewIfEligible,
    worldFrameId,
  ]);

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
    setPoseCommand(pending.pose);
    recordCameraViewIfEligible(pending.pose);
  }, [placementStatus, recordCameraViewIfEligible, worldFrameId]);

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
    // When a matching follow anchor governs the camera, the provisional pose
    // memory is moot: the rig composes in the effective world frame on its
    // own and re-bases from whatever the shell applies.
    const anchor = latestAnchorRef.current;
    const anchorGoverned =
      isFollowTrackingMode(trackingMode) &&
      anchor !== null &&
      trackingAnchorMatches({
        anchor,
        mode: trackingMode,
        sceneUpAxis,
        targetFrameId: cameraTargetFrameId,
        worldFrameId,
      });
    if (anchorGoverned || !worldFrameId) {
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
    setPoseCommand(remappedPose);
    recordCameraViewIfEligible(remappedPose);
  }, [
    cameraTargetFrameId,
    frameTransforms,
    placementStatus,
    recordCameraViewIfEligible,
    sceneUpAxis,
    trackingMode,
    worldFrameId,
  ]);

  const handleCameraPoseChange = useCallback(
    (pose: PointCloudCameraPose, source: CameraPoseChangeSource) => {
      latestCameraPoseRef.current = pose;
      rememberProvisionalCameraPose(pose);
      if (source === "initial" || source === "interaction") {
        // Interaction traffic is bookkeeping only: the rig re-bases the
        // anchor imperatively (external-write protocol) and commits at
        // gesture boundaries — a per-event React write here would re-render
        // the whole tile per pointer move.
        return;
      }
      // "focus": recenter and view presets — deliberate one-shot changes.
      // The shell applies the command; the rig observes that application as
      // an external write and re-bases its anchor within the same dispatch.
      pendingCameraViewRestoreRef.current = null;
      pendingAnchorRestoreRef.current = null;
      setPoseCommand(pose);
      recordCameraViewIfEligible(pose);
    },
    [recordCameraViewIfEligible, rememberProvisionalCameraPose],
  );
  const noteRenderedCameraPose = useCallback(
    (pose: PointCloudCameraPose) => {
      latestCameraPoseRef.current = pose;
      rememberProvisionalCameraPose(pose);
    },
    [rememberProvisionalCameraPose],
  );
  // Stable getter for the last displayed pose (composed, dragged, applied,
  // or fitted — whatever actually painted). View-preset shortcuts read it to
  // preserve the user's current zoom distance without re-rendering per pose
  // change.
  const getDisplayedCameraPose = useCallback(
    (): PointCloudCameraPose | null => latestCameraPoseRef.current,
    [],
  );

  const onGestureStart = useCallback((pose: PointCloudCameraPose) => {
    // A grab is deliberate: abandon carried-over restores the moment the
    // user takes hold, and pin the panel out of fit-fallback. The pin is
    // one-shot — the functional update bails once any command exists, so
    // wheel micro-gestures cost no renders.
    pendingCameraViewRestoreRef.current = null;
    pendingAnchorRestoreRef.current = null;
    latestCameraPoseRef.current = pose;
    setPoseCommand((current) => current ?? pose);
  }, []);

  const onCommit = useCallback(
    (pose: PointCloudCameraPose, anchor: Mcap3dCameraTrackingAnchor | null) => {
      latestCameraPoseRef.current = pose;
      latestAnchorRef.current = anchor;
      rememberProvisionalCameraPose(pose);
      recordCameraViewIfEligible(pose);
      if (anchor) {
        recordMcap3dTrackingAnchor(anchor);
      }
    },
    [recordCameraViewIfEligible, rememberProvisionalCameraPose],
  );

  const onPoseSample = useCallback(
    (sample: Mcap3dCameraRigSample) => {
      latestCameraPoseRef.current = sample.pose;
      latestAnchorRef.current = sample.anchor;
      rememberProvisionalCameraPose(sample.pose);
    },
    [rememberProvisionalCameraPose],
  );

  const updateTrackingMode = useCallback(
    (mode: Mcap3dTrackingMode) => {
      // A manual mode change is a user decision that supersedes any pending
      // carried-over camera restore; the mode itself is written through to
      // the session view-state store.
      pendingCameraViewRestoreRef.current = null;
      pendingAnchorRestoreRef.current = null;
      // Freeze the displayed pose into the command channel: switching modes
      // must never move the camera. The rig re-derives its anchor under the
      // new mode from the live camera without moving it; the frozen command
      // keeps the downward channel pointing at the view the user kept.
      const latestPose = latestCameraPoseRef.current;
      if (latestPose) {
        setPoseCommand(latestPose);
        recordCameraViewIfEligible(latestPose);
      }
      recordMcap3dTrackingMode(mode);
      setTrackingMode(mode);
    },
    [recordCameraViewIfEligible],
  );

  // This effect records the final view state on unmount, so a sample hop
  // mid-gesture still carries the mid-drag pose AND anchor (write-through
  // recording otherwise happens at gesture commits). Follow-mode restoration
  // consumes the anchor, so the pose alone would lose the follow offset.
  useEffect(
    () => () => {
      const pose = latestCameraPoseRef.current;
      if (pose) {
        recordCameraViewIfEligible(pose);
      }
      const anchor = latestAnchorRef.current;
      if (anchor) {
        recordMcap3dTrackingAnchor(anchor);
      }
    },
    [recordCameraViewIfEligible],
  );

  const rig = useMemo(
    () => ({
      adoptAnchor,
      mode: trackingMode,
      onCommit,
      onGestureStart,
      onPoseSample,
      sceneUpAxis,
      targetFrameId: cameraTargetFrameId,
      targetResolution: cameraTargetResolution,
      worldFrameId,
    }),
    [
      adoptAnchor,
      cameraTargetFrameId,
      cameraTargetResolution,
      onCommit,
      onGestureStart,
      onPoseSample,
      sceneUpAxis,
      trackingMode,
      worldFrameId,
    ],
  );

  return {
    cameraTargetResolution,
    cameraTrackingNotice,
    getDisplayedCameraPose,
    handleCameraPoseChange,
    noteRenderedCameraPose,
    poseCommand,
    rig,
    setTrackingMode: updateTrackingMode,
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
