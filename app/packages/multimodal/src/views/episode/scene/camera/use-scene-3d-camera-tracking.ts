import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Vector3 } from "three";
import type { PointCloudVisualization } from "../../../../ir/index";
import type {
  PointCloudCameraPose,
  PointCloudFrameTransform,
  PointCloudSceneBoundsSummary,
} from "../../../../visualization/scene-3d/index";
import { markEpisodeLatencyEvent } from "../../../../observability/episode-latency";
import {
  cameraTargetPoseFromFrameTransform,
  DEFAULT_SCENE_3D_TRACKING_MODE,
  identityCameraTargetPose,
  isFollowTrackingMode,
  trackingAnchorMatches,
  type CameraTargetResolution,
  type Scene3dCameraTrackingAnchor,
  type Scene3dTrackingMode,
} from "./scene-3d-camera";
import type { Scene3dCameraRigSample } from "./scene-3d-camera-rig-core";
import {
  captureScene3dCameraCompositions,
  resolveScene3dCameraComposition,
  type Scene3dCameraComposition,
} from "./scene-3d-camera-composition";
import {
  DEFAULT_SCENE_3D_UP_AXIS,
  type Scene3dUpAxis,
} from "../../spatial/view-preferences";
import { buildCameraTargetNotice } from "../../status/health";
import {
  DEFAULT_SCENE_3D_CAMERA_NAVIGATION_MODE,
  scene3dSourceShapeMatches,
  type Scene3dCameraNavigationMode,
  type Scene3dCameraViewSnapshot,
  type Scene3dViewStateStore,
} from "./scene-3d-view-state";
import { useScene3dViewStateStore } from "./scene-3d-view-state-context";
import type { ReferenceTransition } from "../../spatial/frame-transforms/reference-selection";
import type { FrameTransformsState } from "../../spatial/frame-transforms/use-frame-transforms";
import type { StreamContentFrame } from "../../playback/use-stream-values";
import type { EpisodeHeldFrameTransform } from "../../../../runtime/frame-transform-types";

/** User-selectable camera tracking modes and their display labels. */
export const TRACKING_MODES: readonly {
  readonly label: string;
  readonly value: Scene3dTrackingMode;
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
/** Origin of a camera-pose change reported by the point-cloud panel. */
export type CameraPoseChangeSource = "focus" | "initial" | "interaction";

/** Coordinate readiness of the currently displayed 3D scene. */
export type Scene3dPlacementStatus =
  | "empty"
  | "provisional"
  | "transformed"
  | "unframed";
interface ProvisionalCameraView {
  readonly cameraPose: PointCloudCameraPose;
  readonly contentTimeNs: bigint;
  readonly sourceFrameId: string;
}
/** Re-exported target resolution shared by camera consumers. */
export type { CameraTargetResolution } from "./scene-3d-camera";

/** Camera intent captured at a 3D source epoch and carried into the next one. */
export interface Scene3dCameraTrackingRestore {
  readonly cameraView: Scene3dCameraViewSnapshot | null;
  readonly navigationCompositions: readonly Scene3dCameraComposition[];
  readonly renderableSourceIds: readonly string[] | null;
  readonly trackingMode: Scene3dTrackingMode | null;
}

/**
 * Boundary-commit camera tracking state for the 3D tile.
 *
 * The camera itself is owned imperatively: OrbitControls moves it during
 * gestures and the Scene3dCameraRig composes follow modes per target update,
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
 * previous sample's camera view: the tracking mode restores independently;
 * an exact same-source pose or portable cross-source composition restores as
 * a pending intent only after its compatibility gates hold, and is abandoned
 * on any deliberate camera or mode change by the user.
 */
export function useScene3dCameraTracking({
  cameraNavigationMode = DEFAULT_SCENE_3D_CAMERA_NAVIGATION_MODE,
  cameraTargetFrameId,
  cameraTargetSelectionSource,
  defaultTrackingMode = DEFAULT_SCENE_3D_TRACKING_MODE,
  frameTransforms,
  placementStatus,
  playbackTimeNs,
  provisionalFrameIds,
  provisionalPlaybackFrame,
  onCameraPoseSample,
  onDefaultTrackingModeChange,
  navigationReferenceSettled,
  renderableSourceIds,
  restore = null,
  sceneUpAxis = DEFAULT_SCENE_3D_UP_AXIS,
  selectedStreamsKey,
  sourceKey,
  suspendAutoFollowAtReference = false,
  viewStateStore: suppliedViewStateStore,
  worldFrameTransition = null,
  worldFrameId,
}: {
  readonly cameraNavigationMode?: Scene3dCameraNavigationMode;
  readonly cameraTargetFrameId: string;
  readonly cameraTargetSelectionSource: "auto" | "user";
  readonly defaultTrackingMode?: Scene3dTrackingMode;
  readonly frameTransforms: FrameTransformsState;
  readonly placementStatus: Scene3dPlacementStatus;
  readonly playbackTimeNs: bigint | undefined;
  readonly provisionalFrameIds: readonly string[];
  readonly provisionalPlaybackFrame: StreamContentFrame<PointCloudVisualization> | null;
  /** Live pose sink for non-React camera observers such as Viewpoint. */
  readonly onCameraPoseSample?: (pose: PointCloudCameraPose) => void;
  readonly onDefaultTrackingModeChange?: (mode: Scene3dTrackingMode) => void;
  /** Whether the incoming sample's durable world-frame choice has settled. */
  readonly navigationReferenceSettled: boolean;
  readonly renderableSourceIds: readonly string[];
  readonly restore?: Scene3dCameraTrackingRestore | null;
  readonly sceneUpAxis?: Scene3dUpAxis;
  readonly selectedStreamsKey: string;
  readonly sourceKey: string;
  /** Retain follow intent, but run effectively free until an ego target exists. */
  readonly suspendAutoFollowAtReference?: boolean;
  readonly viewStateStore?: Scene3dViewStateStore;
  /** Exact transform accepted by a guarded automatic reference promotion. */
  readonly worldFrameTransition?: ReferenceTransition | null;
  readonly worldFrameId: string;
}) {
  const viewStateStore = useScene3dViewStateStore(suppliedViewStateStore);
  const restoreSourceShapeMatches = scene3dSourceShapeMatches(
    restore?.renderableSourceIds ?? null,
    renderableSourceIds,
  );
  // The restored tracking mode decides which camera restore is meaningful:
  // in follow modes the view is defined by the anchor (a target-relative
  // offset), in free mode by the absolute pose in its world frame.
  const restoredTrackingMode =
    (restoreSourceShapeMatches
      ? restore?.navigationCompositions[0]?.trackingMode
      : undefined) ??
    restore?.trackingMode ??
    defaultTrackingMode;
  const [trackingMode, setTrackingMode] =
    useState<Scene3dTrackingMode>(restoredTrackingMode);
  const effectiveTrackingMode =
    suspendAutoFollowAtReference && isFollowTrackingMode(trackingMode)
      ? "free"
      : trackingMode;
  const [poseCommand, setPoseCommand] = useState<PointCloudCameraPose | null>(
    null,
  );
  const [adoptAnchor, setAdoptAnchor] =
    useState<Scene3dCameraTrackingAnchor | null>(null);
  const latestCameraPoseRef = useRef<PointCloudCameraPose | null>(null);
  const latestAnchorRef = useRef<Scene3dCameraTrackingAnchor | null>(null);
  const latestSceneBoundsRef = useRef<PointCloudSceneBoundsSummary | null>(
    null,
  );
  const hasRecordedCompositionRef = useRef(false);
  const hasRecordedBoundsCompositionRef = useRef(false);
  const lastProvisionalViewRef = useRef<ProvisionalCameraView | null>(null);
  const hadRecentProvisionalPlacementRef = useRef(false);
  const cameraPoseRemapKeyRef = useRef<string | null>(null);
  const worldFrameRemapTrackerRef = useRef(worldFrameId);
  // The modal shell intentionally keeps this hook mounted across sample
  // navigation. Track the source that owns the current command so the old
  // recording's absolute pose can never be sent into the next recording.
  const activeSourceKeyRef = useRef(sourceKey);
  const [cameraCommandSourceKey, setCameraCommandSourceKey] =
    useState(sourceKey);
  const sourceChanged = cameraCommandSourceKey !== sourceKey;
  // The provider's temporary unbound interval is not a source hop. Keep the
  // last non-empty source epoch until the incoming recording is available.
  const cameraRigEpoch = sourceKey || activeSourceKeyRef.current;
  const cameraEpochRef = useRef(nextScene3dViewStateRestoreOnceKey());
  // Pending camera restore intents, captured once at mount. They die on
  // apply, on any deliberate camera/mode change, or with the mount itself.
  const pendingCameraViewRestoreRef = useRef<Scene3dCameraViewSnapshot | null>(
    restore?.cameraView &&
      (restore.cameraView.sourceKey === sourceKey ||
        cameraNavigationMode === "absolute")
      ? restore.cameraView
      : null,
  );
  const pendingCompositionRestoreRef = useRef<
    readonly Scene3dCameraComposition[]
  >(
    pendingCameraViewRestoreRef.current
      ? []
      : restoreSourceShapeMatches
        ? (restore?.navigationCompositions ?? [])
        : [],
  );
  // This layout effect discards cross-source raw coordinates in relative mode
  // while retaining explicit absolute navigation. It also invalidates portable
  // compositions when the renderable source family changes.
  useLayoutEffect(() => {
    const snapshot = viewStateStore.getSnapshot();
    if (
      restore?.cameraView &&
      restore.cameraView.sourceKey !== sourceKey &&
      cameraNavigationMode !== "absolute" &&
      snapshot.cameraView === restore.cameraView
    ) {
      viewStateStore.recordCameraView(null);
    }
    if (
      sourceKey &&
      !restoreSourceShapeMatches &&
      restore?.navigationCompositions.length &&
      snapshot.navigationCompositions === restore.navigationCompositions
    ) {
      pendingCompositionRestoreRef.current = [];
      viewStateStore.recordNavigationCompositions([]);
    }
  }, [
    cameraNavigationMode,
    restore,
    restoreSourceShapeMatches,
    sourceKey,
    viewStateStore,
  ]);
  // Recording gate readable from imperative callbacks (rig commits, unmount)
  // without re-binding them per render. Render-phase ref write: idempotent.
  const recordGateRef = useRef({ placementStatus, sourceKey, worldFrameId });
  recordGateRef.current = { placementStatus, sourceKey, worldFrameId };
  // Imperative camera callbacks can outlive the render that created them.
  // Accept traffic only when both the committed epoch and latest render own it.
  const isCameraEpochActive = useCallback(
    () =>
      Boolean(sourceKey) &&
      activeSourceKeyRef.current === sourceKey &&
      recordGateRef.current.sourceKey === sourceKey,
    [sourceKey],
  );
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
      buildCameraTargetNotice({
        cameraTargetFrameId,
        cameraTargetStatus: cameraTargetResolution.status,
        trackingMode: effectiveTrackingMode,
        worldFrameId,
      }),
    [
      cameraTargetFrameId,
      cameraTargetResolution.status,
      effectiveTrackingMode,
      worldFrameId,
    ],
  );
  const cameraFollowHeldPose = useMemo(() => {
    if (
      !isFollowTrackingMode(effectiveTrackingMode) ||
      cameraTargetResolution.status !== "resolved"
    ) {
      return null;
    }

    let worst: EpisodeHeldFrameTransform | undefined;
    for (const edge of cameraTargetResolution.heldEdges ?? []) {
      if (
        edge.ageNs > edge.staleAfterNs &&
        (!worst ||
          edge.ageNs * worst.staleAfterNs > worst.ageNs * edge.staleAfterNs)
      ) {
        worst = edge;
      }
    }
    return worst ?? null;
  }, [cameraTargetResolution, effectiveTrackingMode]);

  const recordCameraViewIfEligible = useCallback(
    (pose: PointCloudCameraPose) => {
      // Gated on transformed placement: a pose captured during provisional
      // placement is NOT a world-frame pose yet — recording it would restore
      // a wrong-frame view on the next sample.
      const gate = recordGateRef.current;
      if (
        gate.sourceKey &&
        gate.worldFrameId &&
        gate.placementStatus === "transformed"
      ) {
        viewStateStore.recordCameraView({
          pose,
          sourceKey: gate.sourceKey,
          worldFrameId: gate.worldFrameId,
        });
      }
    },
    [viewStateStore],
  );

  const recordNavigationComposition = useCallback(
    (
      pose: PointCloudCameraPose,
      anchor: Scene3dCameraTrackingAnchor | null,
      mode = trackingMode,
    ) => {
      if (placementStatus !== "transformed") return;
      const compositions = captureScene3dCameraCompositions({
        cameraPose: pose,
        cameraTargetFrameId,
        cameraTargetResolution,
        sceneBounds: latestSceneBoundsRef.current,
        sceneUpAxis,
        trackingAnchor: anchor,
        trackingMode: mode,
        worldFrameId,
      });
      if (compositions.length > 0) {
        viewStateStore.recordNavigationCompositions(compositions);
        hasRecordedCompositionRef.current = true;
        if (latestSceneBoundsRef.current) {
          hasRecordedBoundsCompositionRef.current = true;
        }
      }
    },
    [
      cameraTargetFrameId,
      cameraTargetResolution,
      placementStatus,
      sceneUpAxis,
      trackingMode,
      viewStateStore,
      worldFrameId,
    ],
  );
  const recordNavigationCompositionRef = useRef(recordNavigationComposition);
  recordNavigationCompositionRef.current = recordNavigationComposition;
  // This layout effect refreshes portable intent after frame conventions change.
  useLayoutEffect(() => {
    if (
      pendingCameraViewRestoreRef.current ||
      pendingCompositionRestoreRef.current.length > 0 ||
      worldFrameRemapTrackerRef.current !== worldFrameId
    ) {
      return;
    }
    const pose = latestCameraPoseRef.current;
    if (pose) {
      recordNavigationCompositionRef.current(pose, latestAnchorRef.current);
    }
  }, [cameraTargetFrameId, sceneUpAxis, worldFrameId]);

  const applyPendingComposition = useCallback(() => {
    const compositions = pendingCompositionRestoreRef.current;
    if (compositions.length === 0 || !navigationReferenceSettled) return;

    let resolved: Extract<
      ReturnType<typeof resolveScene3dCameraComposition>,
      { status: "resolved" }
    > | null = null;
    let resolvedComposition: Scene3dCameraComposition | null = null;
    for (const composition of compositions) {
      const resolveAgainstCarriedTarget =
        composition.kind === "target-relative" &&
        cameraTargetSelectionSource === "auto" &&
        composition.targetFrameId !== cameraTargetFrameId;
      const compositionTargetFrameId = resolveAgainstCarriedTarget
        ? composition.targetFrameId
        : cameraTargetFrameId;
      const carriedTargetResolution = resolveAgainstCarriedTarget
        ? resolveCameraTargetPose({
            cameraTargetFrameId: composition.targetFrameId,
            frameTransforms,
            playbackTimeNs,
            worldFrameId,
          })
        : cameraTargetResolution;
      const candidate = resolveScene3dCameraComposition({
        cameraTargetFrameId: compositionTargetFrameId,
        cameraTargetResolution: carriedTargetResolution,
        composition,
        placementStatus,
        sceneBounds: latestSceneBoundsRef.current,
        sceneUpAxis,
        worldFrameId,
      });
      if (candidate.status === "resolved") {
        resolved = candidate;
        resolvedComposition = composition;
        break;
      }
      if (candidate.status === "pending") return;
    }

    pendingCompositionRestoreRef.current = [];
    if (!resolved || !resolvedComposition) {
      return;
    }

    lastProvisionalViewRef.current = null;
    hadRecentProvisionalPlacementRef.current = false;
    latestCameraPoseRef.current = resolved.pose;
    latestAnchorRef.current = resolved.anchor;
    setPoseCommand(resolved.pose);
    if (resolved.anchor) setAdoptAnchor(resolved.anchor);
    recordCameraViewIfEligible(resolved.pose);
    recordNavigationComposition(
      resolved.pose,
      resolved.anchor,
      resolvedComposition.trackingMode,
    );
  }, [
    cameraTargetFrameId,
    cameraTargetResolution,
    cameraTargetSelectionSource,
    frameTransforms,
    navigationReferenceSettled,
    placementStatus,
    playbackTimeNs,
    recordCameraViewIfEligible,
    recordNavigationComposition,
    sceneUpAxis,
    worldFrameId,
  ]);

  // This effect discards provisional camera memory when source streams change.
  useEffect(() => {
    lastProvisionalViewRef.current = null;
    hadRecentProvisionalPlacementRef.current = false;
    cameraPoseRemapKeyRef.current = null;
  }, [selectedStreamsKey]);

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
    if (activeSourceKeyRef.current !== sourceKey) return;

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

    const committedTransform =
      worldFrameTransition?.sourceFrameId === previousWorldFrameId &&
      worldFrameTransition.targetFrameId === worldFrameId
        ? worldFrameTransition.transform
        : null;
    const resolution = committedTransform
      ? null
      : playbackTimeNs === undefined
        ? null
        : frameTransforms.resolve(
            previousWorldFrameId,
            worldFrameId,
            playbackTimeNs,
          );
    const transform =
      committedTransform ??
      (resolution?.status === "resolved" ? resolution.transform : null);
    if (!transform) {
      latestCameraPoseRef.current = null;
      setPoseCommand(null);
      return;
    }

    const remappedPose = transformCameraPose(basePose, transform);
    latestCameraPoseRef.current = remappedPose;
    setPoseCommand(remappedPose);
    recordCameraViewIfEligible(remappedPose);
    recordNavigationCompositionRef.current(
      remappedPose,
      latestAnchorRef.current,
    );
  }, [
    frameTransforms,
    placementStatus,
    playbackTimeNs,
    recordCameraViewIfEligible,
    sourceKey,
    worldFrameTransition,
    worldFrameId,
  ]);

  // Applies a same-source pose, or an explicitly absolute cross-source pose,
  // once placement and world-frame gates match. Consuming provisional memory
  // here prevents the later provisional remap from overwriting the restore.
  const applyPendingCameraView = useCallback(() => {
    const pending = pendingCameraViewRestoreRef.current;
    if (
      !pending ||
      !scene3dCameraPoseRestoreApplies({
        allowCrossSource: cameraNavigationMode === "absolute",
        currentSourceKey: sourceKey,
        placementStatus,
        restoreSourceKey: pending.sourceKey,
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
  }, [
    cameraNavigationMode,
    placementStatus,
    recordCameraViewIfEligible,
    sourceKey,
    worldFrameId,
  ]);

  // This layout effect retries an exact or absolute pose restore before paint.
  useLayoutEffect(() => {
    if (activeSourceKeyRef.current !== sourceKey) return;
    applyPendingCameraView();
  }, [applyPendingCameraView, sourceKey]);

  // This layout effect remaps a provisional camera once placement resolves.
  useLayoutEffect(() => {
    if (activeSourceKeyRef.current !== sourceKey) return;

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
      isFollowTrackingMode(effectiveTrackingMode) &&
      anchor !== null &&
      trackingAnchorMatches({
        anchor,
        mode: effectiveTrackingMode,
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
    sourceKey,
    effectiveTrackingMode,
    worldFrameId,
  ]);

  // This layout effect retries a portable restore after coordinate-space
  // remaps. When the incoming reference settles with a world-frame promotion,
  // the carried composition must be the final writer to avoid a second remap.
  useLayoutEffect(() => {
    applyPendingComposition();
  }, [applyPendingComposition]);

  const handleCameraPoseChange = useCallback(
    (pose: PointCloudCameraPose, source: CameraPoseChangeSource) => {
      if (!isCameraEpochActive()) {
        return;
      }
      // A canvas can remount while the outgoing source is unbound and emit its
      // fitted pose as "initial". Preserve the last displayed user pose until
      // the real source epoch changes; otherwise the handoff flush records the
      // transient fit instead of the viewpoint the user established.
      if (
        source === "initial" &&
        (latestCameraPoseRef.current ||
          pendingCameraViewRestoreRef.current ||
          pendingCompositionRestoreRef.current.length > 0)
      ) {
        return;
      }
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
      pendingCompositionRestoreRef.current = [];
      setPoseCommand(pose);
      recordCameraViewIfEligible(pose);
      recordNavigationComposition(pose, latestAnchorRef.current);
    },
    [
      isCameraEpochActive,
      recordCameraViewIfEligible,
      recordNavigationComposition,
      rememberProvisionalCameraPose,
    ],
  );
  const noteRenderedCameraPose = useCallback(
    (
      pose: PointCloudCameraPose,
      sceneBounds?: PointCloudSceneBoundsSummary,
    ) => {
      if (!isCameraEpochActive()) {
        return;
      }
      latestCameraPoseRef.current = pose;
      if (sceneBounds) latestSceneBoundsRef.current = sceneBounds;
      rememberProvisionalCameraPose(pose);
      if (pendingCompositionRestoreRef.current.length > 0) {
        applyPendingComposition();
        return;
      }
      if (
        !hasRecordedCompositionRef.current ||
        (sceneBounds && !hasRecordedBoundsCompositionRef.current)
      ) {
        recordNavigationComposition(pose, latestAnchorRef.current);
      }
    },
    [
      applyPendingComposition,
      isCameraEpochActive,
      recordNavigationComposition,
      rememberProvisionalCameraPose,
    ],
  );
  // Stable getter for the last displayed pose (composed, dragged, applied,
  // or fitted — whatever actually painted). View-preset shortcuts read it to
  // preserve the user's current zoom distance without re-rendering per pose
  // change.
  const getDisplayedCameraPose = useCallback(
    (): PointCloudCameraPose | null => latestCameraPoseRef.current,
    [],
  );

  const onGestureStart = useCallback(
    (pose: PointCloudCameraPose) => {
      if (!isCameraEpochActive()) {
        return;
      }
      // A grab is deliberate: abandon carried-over restores the moment the
      // user takes hold, and pin the panel out of fit-fallback. The pin is
      // one-shot — the functional update bails once any command exists, so
      // wheel micro-gestures cost no renders.
      pendingCameraViewRestoreRef.current = null;
      pendingCompositionRestoreRef.current = [];
      latestCameraPoseRef.current = pose;
      setPoseCommand((current) => current ?? pose);
    },
    [isCameraEpochActive],
  );

  const onCommit = useCallback(
    (
      pose: PointCloudCameraPose,
      anchor: Scene3dCameraTrackingAnchor | null,
    ) => {
      if (!isCameraEpochActive()) {
        return;
      }
      latestCameraPoseRef.current = pose;
      latestAnchorRef.current = anchor;
      rememberProvisionalCameraPose(pose);
      recordCameraViewIfEligible(pose);
      recordNavigationComposition(pose, anchor);
    },
    [
      isCameraEpochActive,
      recordCameraViewIfEligible,
      recordNavigationComposition,
      rememberProvisionalCameraPose,
    ],
  );

  const onPoseSample = useCallback(
    (sample: Scene3dCameraRigSample) => {
      if (!isCameraEpochActive()) {
        return;
      }
      onCameraPoseSample?.(sample.pose);
      latestCameraPoseRef.current = sample.pose;
      latestAnchorRef.current = sample.anchor;
      rememberProvisionalCameraPose(sample.pose);
    },
    [isCameraEpochActive, onCameraPoseSample, rememberProvisionalCameraPose],
  );

  const activeEpochRecorderRef = useRef({
    placementStatus,
    recordNavigationComposition,
    sourceKey,
    worldFrameId,
  });
  if (activeEpochRecorderRef.current.sourceKey === sourceKey) {
    activeEpochRecorderRef.current = {
      placementStatus,
      recordNavigationComposition,
      sourceKey,
      worldFrameId,
    };
  }

  // This layout effect treats a source hop as an in-place camera epoch change:
  // the shell and controls survive, but raw coordinates do not. It re-seeds
  // the pending restore from the previous source and clears source-local
  // camera latches before paint; `sourceChanged` masks the old command during
  // the transition render.
  useLayoutEffect(() => {
    // The data-stream provider deliberately hides the outgoing stream while
    // modal navigation binds the next one. That unbound interval is not a
    // camera epoch: consuming the portable composition there resolves it
    // against the outgoing scene and leaves nothing for the incoming sample.
    if (!sourceKey || activeSourceKeyRef.current === sourceKey) return;

    const previousEpoch = activeEpochRecorderRef.current;
    const previousPose = latestCameraPoseRef.current;
    if (
      previousPose &&
      !pendingCameraViewRestoreRef.current &&
      pendingCompositionRestoreRef.current.length === 0 &&
      previousEpoch.placementStatus === "transformed" &&
      previousEpoch.sourceKey &&
      previousEpoch.worldFrameId
    ) {
      viewStateStore.recordCameraView({
        pose: previousPose,
        sourceKey: previousEpoch.sourceKey,
        worldFrameId: previousEpoch.worldFrameId,
      });
      previousEpoch.recordNavigationComposition(
        previousPose,
        latestAnchorRef.current,
      );
    }

    const snapshot = viewStateStore.getSnapshot();
    const navigationRestoreCompatible = scene3dSourceShapeMatches(
      snapshot.renderableSourceIds,
      renderableSourceIds,
    );
    const carriedCameraView =
      snapshot.cameraView &&
      (snapshot.cameraView.sourceKey === sourceKey ||
        cameraNavigationMode === "absolute")
        ? snapshot.cameraView
        : null;
    const navigationCompositions = carriedCameraView
      ? []
      : navigationRestoreCompatible
        ? snapshot.navigationCompositions
        : [];

    activeSourceKeyRef.current = sourceKey;
    setCameraCommandSourceKey(sourceKey);
    activeEpochRecorderRef.current = {
      placementStatus,
      recordNavigationComposition,
      sourceKey,
      worldFrameId,
    };
    pendingCameraViewRestoreRef.current = carriedCameraView;
    pendingCompositionRestoreRef.current = navigationCompositions;
    latestCameraPoseRef.current = null;
    latestAnchorRef.current = null;
    latestSceneBoundsRef.current = null;
    lastProvisionalViewRef.current = null;
    hadRecentProvisionalPlacementRef.current = false;
    cameraPoseRemapKeyRef.current = null;
    worldFrameRemapTrackerRef.current = worldFrameId;
    hasRecordedCompositionRef.current = false;
    hasRecordedBoundsCompositionRef.current = false;
    setPoseCommand(null);
    setAdoptAnchor(null);

    if (snapshot.cameraView && !carriedCameraView) {
      viewStateStore.recordCameraView(null);
    }
    if (
      !navigationRestoreCompatible &&
      snapshot.navigationCompositions.length
    ) {
      viewStateStore.recordNavigationCompositions([]);
    }

    const restoredMode =
      navigationCompositions[0]?.trackingMode ??
      snapshot.trackingMode ??
      defaultTrackingMode;
    setTrackingMode(restoredMode);
    applyPendingCameraView();
    applyPendingComposition();
  }, [
    applyPendingCameraView,
    applyPendingComposition,
    cameraNavigationMode,
    defaultTrackingMode,
    placementStatus,
    recordNavigationComposition,
    renderableSourceIds,
    sourceKey,
    viewStateStore,
    worldFrameId,
  ]);

  const updateTrackingMode = useCallback(
    (mode: Scene3dTrackingMode) => {
      // A manual mode change is a user decision that supersedes any pending
      // carried-over camera restore; the mode itself is written through to
      // the session view-state store.
      pendingCameraViewRestoreRef.current = null;
      pendingCompositionRestoreRef.current = [];
      // Freeze the displayed pose into the command channel: switching modes
      // must never move the camera. The rig re-derives its anchor under the
      // new mode from the live camera without moving it; the frozen command
      // keeps the downward channel pointing at the view the user kept.
      const latestPose = latestCameraPoseRef.current;
      if (latestPose) {
        setPoseCommand(latestPose);
        recordCameraViewIfEligible(latestPose);
        recordNavigationComposition(latestPose, latestAnchorRef.current, mode);
      }
      viewStateStore.recordTrackingMode(mode);
      onDefaultTrackingModeChange?.(mode);
      setTrackingMode(mode);
    },
    [
      onDefaultTrackingModeChange,
      recordCameraViewIfEligible,
      recordNavigationComposition,
      viewStateStore,
    ],
  );

  // This effect records the final view state on unmount, so a sample hop
  // mid-gesture still carries the last displayed composition (write-through
  // recording otherwise happens at gesture commits).
  const recordCameraViewRef = useRef(recordCameraViewIfEligible);
  recordCameraViewRef.current = recordCameraViewIfEligible;
  useEffect(
    () => () => {
      if (
        pendingCameraViewRestoreRef.current ||
        pendingCompositionRestoreRef.current.length > 0
      ) {
        return;
      }
      const pose = latestCameraPoseRef.current;
      if (pose) {
        recordCameraViewRef.current(pose);
        recordNavigationCompositionRef.current(pose, latestAnchorRef.current);
      }
    },
    [],
  );

  const rig = useMemo(
    () => ({
      adoptAnchor: sourceChanged ? null : adoptAnchor,
      cameraEpoch: cameraRigEpoch,
      mode: effectiveTrackingMode,
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
      cameraRigEpoch,
      cameraTargetFrameId,
      cameraTargetResolution,
      onCommit,
      onGestureStart,
      onPoseSample,
      sceneUpAxis,
      sourceChanged,
      effectiveTrackingMode,
      worldFrameId,
    ],
  );

  return {
    cameraFollowHeldPose,
    cameraTargetResolution,
    cameraTrackingNotice,
    getDisplayedCameraPose,
    handleCameraPoseChange,
    noteRenderedCameraPose,
    poseCommand: sourceChanged ? null : poseCommand,
    rig,
    setTrackingMode: updateTrackingMode,
    trackingMode,
  };
}

/**
 * Pure gate for applying a carried-over camera pose: only once placement is
 * transformed (never against a provisional source-frame preview), within the
 * same recording, and in the world frame the pose was captured in.
 */
export function scene3dCameraPoseRestoreApplies({
  allowCrossSource = false,
  currentSourceKey,
  placementStatus,
  restoreSourceKey,
  restoreWorldFrameId,
  worldFrameId,
}: {
  readonly allowCrossSource?: boolean;
  readonly currentSourceKey: string;
  readonly placementStatus: Scene3dPlacementStatus;
  readonly restoreSourceKey: string;
  readonly restoreWorldFrameId: string;
  readonly worldFrameId: string;
}): boolean {
  return (
    placementStatus === "transformed" &&
    currentSourceKey !== "" &&
    (allowCrossSource || currentSourceKey === restoreSourceKey) &&
    worldFrameId !== "" &&
    restoreWorldFrameId === worldFrameId
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
  readonly frameTransforms: FrameTransformsState;
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
    return {
      status: resolution.status === "pending" ? "pending" : "missing",
    };
  }

  return {
    ...(resolution.heldEdges?.length
      ? { heldEdges: resolution.heldEdges }
      : {}),
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
