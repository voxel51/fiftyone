import { useTileId, useTiling } from "@fiftyone/tiling";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePublishAnnotationStreams } from "../../../../extensions/timeline/index";
import { usePublishFullHistoryStreams } from "../../playback/full-history-interests";
import type {
  CameraCalibrationVisualization,
  GridVisualization,
  ImageVisualization,
  LocationVisualization,
  PoseVisualization,
  SceneUpdateVisualization,
} from "../../../../ir/index";
import { useKeyedIdentityMap } from "../../../../visualization/panel-ui/use-keyed-identity-map";
import type { ThreeSceneBackground } from "../../../../visualization/scene-3d/Base3dScene";
import { DEFAULT_POINT_CLOUD_CAMERA_PROJECTION } from "../../../../visualization/scene-3d/camera-fit-bounds";
import { PointCloudPanel } from "../../../../visualization/composition/index";
import {
  type PointCloudCameraPose,
  type PointCloudPanelRenderStats,
  type SceneRayPanelLayer,
} from "../../../../visualization/scene-3d/types";
import {
  createScene3dCameraRigStore,
  Scene3dCameraRigFromStore,
} from "../camera/Scene3dCameraRig";
import Scene3dTileSettings from "./Scene3dTileSettings";
import { Scene3dViewControls } from "../camera/Scene3dViewControls";
import type { Scene3dHeldSceneReason } from "../entities/scene-3d-scene-snapshot";
import { useScene3dViewSettings } from "../../spatial/view-settings-context";
import {
  buildScene3dPlacementNotices,
  buildScene3dTransformNotices,
  buildCapabilityNotices,
  buildReferenceFrameNotices,
  useStabilizedNotices,
  type HealthNotice,
} from "../../status/health";
import {
  useStreamDiagnostics,
  useStreamStatuses,
} from "../../playback/stream-status-state";
import { useScene3dViewStateStore } from "../camera/scene-3d-view-state-context";
import {
  useRegisterSceneFrameControls,
  useSceneFrameControls,
  type SceneFrameControls,
} from "../../spatial/frame-transforms/scene-frame-controls";
import { usePublishSceneNotices } from "../../status/scene-notices-context";
import { useRegisterTileSettings } from "../../tiles/tile-settings-context";
import {
  createScene3dViewpointStore,
  normalizeScene3dCameraProjection,
} from "../camera/scene-3d-viewpoint";
import type { Scene3dCameraNavigationMode } from "../camera/scene-3d-view-state";
import { useHoverEcho } from "../../interaction/point-hover/hover-echo";
import { useDataStream } from "../../playback/data-stream-context";
import { useDepthHover } from "../../spatial/depth-sampling";
import { resolveDepthRay } from "../../spatial/depth-projection";
import { resolveProjectionCorrespondence } from "../../spatial/projection-correspondence";
import { useFrameTransformsContext } from "../../spatial/frame-transforms/context";
import {
  defaultPointCloudColorForSource,
  useImageProjectionSettingsByStream,
  usePinholeCameraSettings,
  usePointCloudStyleSettings,
  useReferenceGridSettings,
  useSceneBackgroundSettings,
} from "../../settings/modal/state";
import { usePointCloudColorCapabilities } from "./use-point-cloud-color-capabilities";
import type { EpisodeTileProps } from "../../tiles/tile-types";
import styles from "../../tiles/Tile.module.css";
import { TileEmptyState, TileStatusBadge } from "../../tiles/TileStreamState";
import { locationHudLine, speedHudLine } from "../entities/pose-trajectory";
import {
  useScene3dCameraTracking,
  type Scene3dPlacementStatus,
} from "../camera/use-scene-3d-camera-tracking";
import { useScene3dFrameSelection } from "../placement/use-scene-3d-frame-selection";
import { useScene3dPoseTrajectories } from "../entities/use-scene-3d-pose-trajectories";
import { useScene3dViewShortcuts } from "../camera/use-scene-3d-view-shortcuts";
import {
  playbackFrameForStream,
  selectProvisionalPointCloudStream,
  useScene3dSelection,
} from "../picking/use-scene-3d-selection";
import { useInterpolatedSceneUpdateFrames } from "../entities/use-interpolated-scene-updates";
import { usePlaybackTimeNs } from "../../playback/use-playback-time-ns";
import {
  usePointCloudPlaybackFrames,
  useStreamPlaybackFrames,
} from "../../playback/use-stream-values";
import { useVideoDecodeRunways } from "../../playback/video-decode-runway/use-video-decode-runways";
import {
  scene3dSnapshotHasLayers,
  useScene3dSnapshot,
  type Scene3dSnapshot,
} from "../entities/use-scene-3d-snapshot";
import {
  Scene3dHoverTooltip,
  useScene3dPickingLayers,
} from "../picking/use-scene-3d-picking-layers";
import { useScene3dFrustumLayers } from "../camera/use-scene-3d-frustum-layers";
import { useScene3dPlacedLayers } from "../placement/use-scene-3d-placed-layers";
import { useScene3dViewpointRegistration } from "../camera/use-scene-3d-viewpoint-registration";
import { useScene3dTilePlaybackSettings } from "./scene-3d-tile-state";
import { frameTransformIdentityInputs } from "../entities/scene-3d-layer-identity";

/**
 * Named gradient backdrop profiles for the 3D scene. "Abyss" is dark
 * (green → violet-black), "Studio" is light and warm (off-white →
 * taupe). Both kept desaturated so data colors stay legible on top.
 */
const ABYSS_BACKGROUND: ThreeSceneBackground = {
  bottom: "#150d2e",
  kind: "gradient",
  top: "#12362b",
};
const EMPTY_SCENE_RAYS: readonly SceneRayPanelLayer[] = [];
const STUDIO_BACKGROUND: ThreeSceneBackground = {
  bottom: "#c8b39a",
  kind: "gradient",
  top: "#faf4e8",
};

/**
 * 3D tile: renders every enabled 3D-renderable source fused into one shared
 * scene. Unlike the image tile, sources are multi-selectable — overlaying
 * several sensors in one view is the point of a 3D panel — so the settings
 * sidebar offers checkboxes and panel-specific frame controls.
 */
const Scene3dTile: React.FC<EpisodeTileProps> = () => {
  const viewStateStore = useScene3dViewStateStore();
  const dataStream = useDataStream();
  const sourceKey = dataStream?.sourceKey ?? "";
  const timelineStartTimeNs = dataStream?.getTimelineIndex()?.startTimeNs;
  // The previous mount's view state, read once before any write-through can
  // overwrite it. The tile remounts per sample, so this snapshot is exactly
  // the state the user left the previous sample's 3D tile in.
  const [viewStateRestore] = useState(() => viewStateStore.getSnapshot());
  const [cameraProjection, setCameraProjection] = useState(() =>
    normalizeScene3dCameraProjection(
      viewStateRestore.cameraProjection ??
        DEFAULT_POINT_CLOUD_CAMERA_PROJECTION,
    ),
  );
  const [cameraNavigationMode, setCameraNavigationMode] =
    useState<Scene3dCameraNavigationMode>(
      viewStateRestore.cameraNavigationMode,
    );
  const carriedTargetComposition = viewStateRestore.navigationCompositions.find(
    (composition) => composition.kind === "target-relative",
  );
  const carriedCameraTargetFrameId =
    cameraNavigationMode === "relative" &&
    carriedTargetComposition?.kind === "target-relative"
      ? carriedTargetComposition.targetFrameId
      : null;
  const {
    cameraSources,
    cameraStreams,
    enabled,
    frustumImageStreams,
    imageSources,
    locationStreams,
    mapLayerSources,
    mapLayerStreams,
    pointCloudSources,
    pointCloudStreams,
    poseSources,
    poseStreams,
    primarySourceId,
    renderableSourceIds,
    restoredSourceShapeMatches,
    sceneAnnotationSources,
    sceneAnnotationStreams,
    selectedPointCloudSources,
    selectedPoseSources,
    selectedStreams,
    selectedStreamsKey,
    setSourcesEnabled,
    toggleSource,
  } = useScene3dSelection({ restore: viewStateRestore, sourceKey });
  usePublishAnnotationStreams(sceneAnnotationStreams);
  usePublishFullHistoryStreams("pose", poseStreams);
  usePublishFullHistoryStreams("scene-update", sceneAnnotationStreams);
  const selectedStreamStatuses = useStreamStatuses(selectedStreams);
  const selectedSourcePending = selectedStreamStatuses.some(
    (status) => status === "loading",
  );
  const frameTransforms = useFrameTransformsContext();
  const { smoothTrackedLabels } = useScene3dTilePlaybackSettings();
  const { pinholeCamera } = usePinholeCameraSettings();
  const imageProjectionSettings = useImageProjectionSettingsByStream();
  const { pointCloudColors, pointCloudPointSize, showPointCloudColorLegend } =
    usePointCloudStyleSettings();
  const { referenceGrid } = useReferenceGridSettings();
  const { sceneBackground } = useSceneBackgroundSettings();
  const {
    defaultTrackingMode,
    preferredCameraTargetFrameId,
    preferredWorldFrameId,
    sceneUpAxis,
    setDefaultTrackingMode,
    setPreferredCameraTargetFrameId,
    setPreferredWorldFrameId,
  } = useScene3dViewSettings();
  const [viewpointStore] = useState(() =>
    createScene3dViewpointStore({
      cameraNavigationMode,
      pose: null,
      projection: cameraProjection,
      sceneUpAxis,
    }),
  );
  const publishViewpointPose = useCallback(
    (pose: PointCloudCameraPose) => viewpointStore.publish({ pose }),
    [viewpointStore],
  );
  const tileId = useTileId();
  const { focusedTileId } = useTiling();
  const panelHasCommittedRef = useRef(false);
  const panelBackground = useMemo<ThreeSceneBackground>(() => {
    switch (sceneBackground.mode) {
      case "abyss":
        return ABYSS_BACKGROUND;
      case "studio":
        return STUDIO_BACKGROUND;
      default:
        return { color: sceneBackground.solidColor, kind: "solid" };
    }
  }, [sceneBackground]);
  const worldGrid = useMemo(
    () =>
      referenceGrid.enabled
        ? {
            opacity: referenceGrid.opacityPercent / 100,
            spacing: referenceGrid.spacingM,
            up: sceneUpAxis,
          }
        : null,
    [referenceGrid, sceneUpAxis],
  );
  const frustumImageFrames =
    useStreamPlaybackFrames<ImageVisualization>(frustumImageStreams);
  const frustumImageDecodeRunways = useVideoDecodeRunways(
    frustumImageStreams,
    frustumImageFrames,
  );
  const pointCloudColorBy = useMemo(
    () =>
      pointCloudStreams.map((stream) => {
        const source = pointCloudSources.find(
          (candidate) => candidate.id === stream,
        ) ?? {
          id: stream,
          label: stream,
          sourceName: "",
        };
        const settings = {
          ...defaultPointCloudColorForSource(source, pointCloudSources),
          ...pointCloudColors[stream],
        };
        return settings.colorBy;
      }),
    [pointCloudColors, pointCloudSources, pointCloudStreams],
  );
  const frames = usePointCloudPlaybackFrames(
    pointCloudStreams,
    pointCloudColorBy,
  );
  const pointCloudColorCapabilities = usePointCloudColorCapabilities(
    pointCloudStreams,
    frames,
  );
  const heldAnnotationFrames =
    useStreamPlaybackFrames<SceneUpdateVisualization>(sceneAnnotationStreams);
  const annotationFrames = useInterpolatedSceneUpdateFrames({
    frames: heldAnnotationFrames,
    interpolate: smoothTrackedLabels,
    streams: sceneAnnotationStreams,
  });
  const gridFrames =
    useStreamPlaybackFrames<GridVisualization>(mapLayerStreams);
  const calibrationFrames =
    useStreamPlaybackFrames<CameraCalibrationVisualization>(cameraStreams);
  const calibrationDiagnostics = useStreamDiagnostics(cameraStreams);
  const poseFrames = useStreamPlaybackFrames<PoseVisualization>(poseStreams);
  const locationFrames =
    useStreamPlaybackFrames<LocationVisualization>(locationStreams);
  const playbackTimeNs = usePlaybackTimeNs();
  const registeredSceneFrameControls = useSceneFrameControls();
  const referenceAuthority =
    registeredSceneFrameControls &&
    registeredSceneFrameControls.authorityTileId !== tileId
      ? registeredSceneFrameControls
      : null;
  const {
    cameraTargetFrameId,
    cameraTargetSelectionSource,
    frameIds,
    localActiveComponentFrameIds,
    localFrameIds,
    localOmittedFrameIds,
    localOmittedSourceIds,
    localReferenceTransition,
    localReferenceSelectionSource,
    localUseRecommendedWorldFrame,
    localUpdateWorldFrameId,
    localWorldFrameId,
    navigationReferenceSettled,
    omittedFrameIds,
    omittedSourceIds,
    referenceTransition,
    referenceSelectionSource,
    updateCameraTargetFrameId,
    worldFrameId,
  } = useScene3dFrameSelection({
    annotationFrames,
    annotationStreams: sceneAnnotationStreams,
    calibrationFrames,
    calibrationStreams: cameraStreams,
    frames,
    frameTransforms,
    gridFrames,
    gridStreams: mapLayerStreams,
    onPreferredCameraTargetFrameIdChange: setPreferredCameraTargetFrameId,
    onPreferredWorldFrameIdChange: setPreferredWorldFrameId,
    carriedCameraTargetFrameId,
    playbackTimeNs,
    pointCloudStreams,
    poseFrames,
    poseStreams,
    preferredCameraTargetFrameId,
    preferredWorldFrameId,
    primarySourceId,
    referenceAuthority,
    restore: viewStateRestore,
  });
  // The reference frame is scene-scoped: publish this tile's controls so
  // the sidebar's Scene tab can edit them. Selections write through the
  // modal-wide preference, so concurrent 3D tiles converge on one choice.
  const sceneFrameControls = useMemo<SceneFrameControls>(
    () => ({
      activeComponentFrameIds: localActiveComponentFrameIds,
      authorityTileId: tileId ?? "",
      frameIds: localFrameIds,
      omittedFrameIds: localOmittedFrameIds,
      omittedSourceIds: localOmittedSourceIds,
      referenceTransition: localReferenceTransition,
      updateWorldFrameId: localUpdateWorldFrameId,
      useRecommendedWorldFrame: localUseRecommendedWorldFrame,
      worldFrameId: localWorldFrameId,
      worldFrameSelectionSource: localReferenceSelectionSource,
    }),
    [
      localActiveComponentFrameIds,
      localFrameIds,
      localOmittedFrameIds,
      localOmittedSourceIds,
      localReferenceTransition,
      localReferenceSelectionSource,
      localUseRecommendedWorldFrame,
      localUpdateWorldFrameId,
      localWorldFrameId,
      tileId,
    ],
  );
  useRegisterSceneFrameControls(tileId, sceneFrameControls);

  const provisionalStreamId = useMemo(
    () => selectProvisionalPointCloudStream(selectedPointCloudSources, frames),
    [frames, selectedPointCloudSources],
  );
  const provisionalPlaybackFrame = useMemo(
    () =>
      playbackFrameForStream(pointCloudStreams, frames, provisionalStreamId),
    [frames, pointCloudStreams, provisionalStreamId],
  );
  const {
    combinedAnnotationFrames,
    combinedAnnotationStreams,
    setTrajectoryFrameOverrides,
    trajectories,
    trajectoryFrameByStream,
  } = useScene3dPoseTrajectories({
    annotationFrames,
    frameIds,
    playbackTimeNs,
    poseFrames,
    poseStreams,
    // Trajectory overrides share the enabled-set's strict shape gate: they
    // only carry over onto a same-shaped recording.
    restore: restoredSourceShapeMatches
      ? viewStateRestore.trajectoryFrameOverrides
      : null,
    sceneAnnotationStreams,
  });
  const {
    cameraFrustumLayers,
    gridLayers,
    pendingAnnotationFrameIds,
    pendingFrustumFrameIds,
    pendingGridFrameIds,
    placementReadiness,
    pointCloudLayers,
    provisionalFrameIds,
    sceneAnnotationLayers,
    stalePoseUsages,
    transformedLayerCount,
    unresolvedPoseUsages,
  } = useScene3dPlacedLayers({
    annotationFrames: combinedAnnotationFrames,
    annotationStreams: combinedAnnotationStreams,
    calibrationFrames,
    calibrationStreams: cameraStreams,
    frameTransforms,
    frames,
    gridFrames,
    gridStreams: mapLayerStreams,
    playbackTimeNs,
    pointCloudStreams,
    provisionalStreamId,
    tileId,
    worldFrameId,
  });
  const pointCloudSourceById = useMemo(
    () =>
      new Map(pointCloudSources.map((source) => [source.id, source] as const)),
    [pointCloudSources],
  );
  const sourceLabelsById = useMemo(
    () =>
      new Map(
        [
          ...cameraSources,
          ...mapLayerSources,
          ...pointCloudSources,
          ...poseSources,
          ...sceneAnnotationSources,
        ].map((source) => [source.id, source.label] as const),
      ),
    [
      cameraSources,
      mapLayerSources,
      pointCloudSources,
      poseSources,
      sceneAnnotationSources,
    ],
  );

  // Attach each cloud's color settings outside build3dLayers so the pure
  // layer builder stays color-agnostic; layer id = stream. Keyed identity:
  // wrappers survive renders their own inputs didn't cause, so memoized
  // scene layers skip reconciliation for untouched siblings.
  const coloredPointCloudLayers = useKeyedIdentityMap(pointCloudLayers, {
    build: (layer) => {
      const source = pointCloudSourceById.get(layer.id) ?? {
        id: layer.id,
        label: layer.id,
        sourceName: "",
      };
      const settings = {
        ...defaultPointCloudColorForSource(source, pointCloudSources),
        ...pointCloudColors[layer.id],
      };
      return {
        ...layer,
        colorSettings: {
          colorBy: settings.colorBy,
          colormap: settings.colormap,
          ...(settings.rangeMax !== null
            ? { rangeMax: settings.rangeMax }
            : {}),
          ...(settings.rangeMin !== null
            ? { rangeMin: settings.rangeMin }
            : {}),
          uniformColor: settings.uniformColor,
        },
      };
    },
    inputs: (layer) => [
      layer.frame,
      layer.contentTimeNs,
      ...frameTransformIdentityInputs(layer.frameTransform),
      pointCloudColors[layer.id],
      pointCloudSourceById.get(layer.id),
      pointCloudSources,
    ],
    key: (layer) => layer.id,
  });
  const {
    annotationLayers,
    hoverablePointCloudLayers,
    hoverTooltip,
    hoverTooltipContainerProps,
    onHoverCamera,
  } = useScene3dPickingLayers({
    pointCloudLayers: coloredPointCloudLayers,
    pointCloudSources,
    sceneAnnotationLayers,
    worldFrameId,
  });
  const frustumLayers = useScene3dFrustumLayers({
    cameraFrustumLayers,
    cameraSources,
    cameraStreams,
    focusedTileId,
    frustumImageDecodeRunways,
    frustumImageFrames,
    frustumImageStreams,
    imageSources,
    imagePlaneDepthM: pinholeCamera.imagePlaneDepthM,
    imageProjectionSettings,
    onHoverCamera,
    opacity: pinholeCamera.opacityPercent / 100,
    sourceKey,
  });
  const stableGridLayers = useKeyedIdentityMap(gridLayers, {
    build: (layer) => layer,
    inputs: (layer) => [
      layer.frame,
      layer.contentTimeNs,
      ...frameTransformIdentityInputs(layer.frameTransform),
    ],
    key: (layer) => layer.id,
  });
  // Schema-driven telemetry: speed from the first enabled pose stream whose
  // latest sample carries velocity, coordinates from the first LocationFix
  // stream — never keyed on stream names.
  const hudLines = useMemo(() => {
    const lines: string[] = [];
    for (const poseFrame of poseFrames) {
      const line = speedHudLine(poseFrame?.frame.velocity);
      if (line) {
        lines.push(line);
        break;
      }
    }
    const location = locationHudLine(locationFrames[0]?.frame);
    if (location) {
      lines.push(location);
    }
    return lines;
  }, [locationFrames, poseFrames]);
  const placementStatus = useMemo<Scene3dPlacementStatus>(
    () =>
      provisionalFrameIds.length > 0
        ? "provisional"
        : transformedLayerCount > 0
          ? "transformed"
          : pointCloudLayers.length > 0 ||
              sceneAnnotationLayers.length > 0 ||
              gridLayers.length > 0 ||
              cameraFrustumLayers.length > 0
            ? "unframed"
            : "empty",
    [
      cameraFrustumLayers.length,
      gridLayers.length,
      pointCloudLayers.length,
      provisionalFrameIds.length,
      sceneAnnotationLayers.length,
      transformedLayerCount,
    ],
  );
  const placementNotices = useMemo(
    () =>
      buildScene3dPlacementNotices({
        pendingAnnotationFrameIds,
        pendingFrustumFrameIds,
        pendingGridFrameIds,
        provisionalFrameIds,
      }),
    [
      pendingAnnotationFrameIds,
      pendingFrustumFrameIds,
      pendingGridFrameIds,
      provisionalFrameIds,
    ],
  );
  const {
    cameraFollowHeldPose,
    cameraTrackingNotice,
    getDisplayedCameraPose,
    handleCameraPoseChange,
    noteRenderedCameraPose,
    poseCommand,
    rig,
    setTrackingMode,
    trackingMode,
  } = useScene3dCameraTracking({
    cameraTargetFrameId,
    cameraTargetSelectionSource,
    defaultTrackingMode,
    frameTransforms,
    placementStatus,
    playbackTimeNs,
    provisionalFrameIds,
    provisionalPlaybackFrame,
    cameraNavigationMode,
    onCameraPoseSample: publishViewpointPose,
    renderableSourceIds,
    restore: viewStateRestore,
    sceneUpAxis,
    selectedStreamsKey,
    onDefaultTrackingModeChange: setDefaultTrackingMode,
    navigationReferenceSettled,
    sourceKey,
    suspendAutoFollowAtReference:
      cameraTargetSelectionSource === "auto" &&
      cameraTargetFrameId === worldFrameId,
    worldFrameTransition: referenceTransition,
    worldFrameId,
  });
  const [cameraRigStore] = useState(() => createScene3dCameraRigStore(rig));
  // This layout effect publishes the latest playback inputs before the canvas
  // paints without turning them into React state inside the R3F tree.
  useLayoutEffect(() => {
    cameraRigStore.publish(rig);
  }, [cameraRigStore, rig]);
  const cameraRigNode = useMemo(
    () => <Scene3dCameraRigFromStore store={cameraRigStore} />,
    [cameraRigStore],
  );
  const transformNotices = useMemo(
    () =>
      buildScene3dTransformNotices({
        cameraFollowHeldPose,
        frameTransformsError: frameTransforms.error,
        sourceLabelsById,
        stalePoseUsages,
        timelineStartTimeNs,
        unresolvedPoseUsages,
        worldFrameId,
      }),
    [
      cameraFollowHeldPose,
      frameTransforms.error,
      sourceLabelsById,
      stalePoseUsages,
      timelineStartTimeNs,
      unresolvedPoseUsages,
      worldFrameId,
    ],
  );
  useScene3dViewpointRegistration({
    cameraNavigationMode,
    cameraProjection,
    handleCameraPoseChange,
    sceneUpAxis,
    setCameraNavigationMode,
    setCameraProjection,
    tileId,
    viewStateStore,
    viewpointStore,
  });
  const { applyEgoView, applyTopView } = useScene3dViewShortcuts({
    cameraTargetFrameId,
    frameIds,
    frameTransforms,
    getDisplayedCameraPose,
    isActive: Boolean(tileId && focusedTileId === tileId),
    onApplyCameraPose: handleCameraPoseChange,
    playbackTimeNs,
    sceneUpAxis,
    worldFrameId,
  });
  const producedNotices = useMemo<readonly HealthNotice[]>(
    () => [
      ...placementNotices,
      ...transformNotices,
      ...buildCapabilityNotices(cameraStreams, calibrationDiagnostics),
      ...buildReferenceFrameNotices({
        omittedFrameIds,
        omittedSourceIds,
        referenceFrameId: worldFrameId,
        source: referenceSelectionSource,
      }),
      ...(cameraTrackingNotice ? [cameraTrackingNotice] : []),
    ],
    [
      calibrationDiagnostics,
      cameraStreams,
      cameraTrackingNotice,
      omittedFrameIds,
      omittedSourceIds,
      placementNotices,
      referenceSelectionSource,
      transformNotices,
      worldFrameId,
    ],
  );
  // Scene-scoped notices are stabilized before reaching the panel:
  // per-tick condition flips around transform boundaries must not blink
  // the chip, and the returned identity is stable while content holds.
  const panelNotices = useStabilizedNotices(producedNotices);
  // Publish the same stabilized set for non-warning sidebar status. Warning
  // diagnostics remain local to the panel's bottom-left notice control.
  usePublishSceneNotices(tileId, panelNotices);
  const sceneSnapshotKey = useMemo(
    () => JSON.stringify([sourceKey, worldFrameId, smoothTrackedLabels]),
    [smoothTrackedLabels, sourceKey, worldFrameId],
  );
  const currentSceneSnapshot = useMemo<Scene3dSnapshot>(
    () => ({
      annotationLayers,
      frustumLayers,
      gridLayers: stableGridLayers,
      notices: panelNotices,
      placementStatus,
      pointCloudLayers: hoverablePointCloudLayers,
    }),
    [
      annotationLayers,
      hoverablePointCloudLayers,
      frustumLayers,
      stableGridLayers,
      panelNotices,
      placementStatus,
    ],
  );
  const hasSceneSourceData =
    frames.some(Boolean) ||
    annotationFrames.some(Boolean) ||
    gridFrames.some(Boolean) ||
    calibrationFrames.some(Boolean);
  const sceneSnapshotSelection = useScene3dSnapshot({
    current: currentSceneSnapshot,
    hasSourceData: hasSceneSourceData,
    key: sceneSnapshotKey,
    readiness: selectedSourcePending
      ? "pending"
      : placementReadiness.status === "ready" ||
          placementReadiness.status === "definitiveMissing"
        ? placementReadiness.status
        : "pending",
    selectedStreams,
  });
  const displayedScene = sceneSnapshotSelection.snapshot;
  const hoverEcho = useHoverEcho();
  const projectionCorrespondence = useMemo(
    () =>
      resolveProjectionCorrespondence({
        frustumLayers: displayedScene.frustumLayers,
        hover: hoverEcho,
        pointCloudLayers: displayedScene.pointCloudLayers,
        worldFrameId,
      }),
    [
      displayedScene.frustumLayers,
      displayedScene.pointCloudLayers,
      hoverEcho,
      worldFrameId,
    ],
  );
  const depthHover = useDepthHover();
  const depthRayResolution = useMemo(
    () =>
      depthHover
        ? resolveDepthRay({
            frustumLayers: displayedScene.frustumLayers,
            hover: depthHover,
            resolveFrameTransform: frameTransforms.resolve,
            timeNs: playbackTimeNs,
            worldFrameId,
          })
        : null,
    [
      depthHover,
      displayedScene.frustumLayers,
      frameTransforms.resolve,
      playbackTimeNs,
      worldFrameId,
    ],
  );
  const rayLayers = useMemo(() => {
    const depthRay =
      depthRayResolution?.status === "ready" ? depthRayResolution.layer : null;
    if (!depthRay && !projectionCorrespondence) {
      return EMPTY_SCENE_RAYS;
    }
    return [
      ...(depthRay ? [depthRay] : []),
      ...(projectionCorrespondence ? [projectionCorrespondence] : []),
    ];
  }, [depthRayResolution, projectionCorrespondence]);
  const sceneHasRenderableContent =
    scene3dSnapshotHasLayers(displayedScene) || rayLayers.length > 0;
  const sceneRequiresPanel =
    sceneHasRenderableContent || displayedScene.notices.length > 0;
  const shouldRenderPanel =
    selectedStreams.length > 0 &&
    (sceneRequiresPanel || panelHasCommittedRef.current);

  // This layout effect records that source-backed scene content committed so
  // later source-loading transitions keep the renderer mounted.
  useLayoutEffect(() => {
    if (sceneHasRenderableContent) {
      panelHasCommittedRef.current = true;
    }
  }, [sceneHasRenderableContent]);
  const prefetchFramePlacement = frameTransforms.prefetchPlacement;

  // This effect requests the transform window needed by a hovered camera ray.
  useEffect(() => {
    if (
      depthRayResolution?.status === "pending" &&
      playbackTimeNs !== undefined
    ) {
      prefetchFramePlacement(playbackTimeNs);
    }
  }, [depthRayResolution?.status, prefetchFramePlacement, playbackTimeNs]);

  const handlePanelRenderStats = useCallback(
    (stats: PointCloudPanelRenderStats) => {
      if (stats.cameraPose) {
        viewpointStore.publish({ pose: stats.cameraPose });
        noteRenderedCameraPose(stats.cameraPose, stats.sceneBounds);
      }
    },
    [noteRenderedCameraPose, viewpointStore],
  );

  // The settings tree is registered into the sidebar rather than rendered
  // here; the registration is memoized over grouped, stabilized props so
  // playback ticks and pose-command updates never re-register (or
  // reconcile) it. `streamStreams` lets the sidebar frame render this
  // tile's stream-status strip.
  const settingsRegistration = useMemo(
    () => ({
      content: (
        <Scene3dTileSettings
          cameraInputs={{
            diagnosticsByStream: calibrationDiagnostics,
            imageStreams: frustumImageStreams,
          }}
          frameControls={{
            cameraTargetFrameId,
            frameIds,
            updateCameraTargetFrameId,
            worldFrameId,
          }}
          pointCloudInputs={{
            colorCapabilities: pointCloudColorCapabilities,
            selectedSources: selectedPointCloudSources,
          }}
          poseControls={{
            selectedSources: selectedPoseSources,
            setTrajectoryFrameOverrides,
            trajectories,
            trajectoryFrameByStream,
          }}
          selection={{ enabled, setSourcesEnabled, toggleSource }}
          sourceGroups={{
            camera: { sources: cameraSources, streams: cameraStreams },
            mapLayer: { sources: mapLayerSources, streams: mapLayerStreams },
            pointCloud: {
              sources: pointCloudSources,
              streams: pointCloudStreams,
            },
            pose: { sources: poseSources, streams: poseStreams },
            sceneAnnotation: {
              sources: sceneAnnotationSources,
              streams: sceneAnnotationStreams,
            },
          }}
          tileId={tileId ?? null}
          trackingControls={{ mode: trackingMode, setMode: setTrackingMode }}
        />
      ),
      streamStreams: selectedStreams,
    }),
    [
      cameraSources,
      cameraTargetFrameId,
      cameraStreams,
      calibrationDiagnostics,
      frustumImageStreams,
      enabled,
      frameIds,
      mapLayerSources,
      mapLayerStreams,
      pointCloudColorCapabilities,
      pointCloudSources,
      pointCloudStreams,
      poseSources,
      poseStreams,
      sceneAnnotationSources,
      sceneAnnotationStreams,
      selectedPointCloudSources,
      selectedPoseSources,
      selectedStreams,
      setSourcesEnabled,
      setTrackingMode,
      setTrajectoryFrameOverrides,
      tileId,
      toggleSource,
      trackingMode,
      trajectories,
      trajectoryFrameByStream,
      updateCameraTargetFrameId,
      worldFrameId,
    ],
  );
  useRegisterTileSettings(tileId, settingsRegistration);

  return (
    <>
      {selectedStreams.length === 0 ? (
        <div className={styles.loading}>
          <span className={styles.emptyText}>No sources selected</span>
        </div>
      ) : shouldRenderPanel ? (
        <div className={styles.panelStack} {...hoverTooltipContainerProps}>
          <PointCloudPanel
            annotationLayers={displayedScene.annotationLayers}
            background={panelBackground}
            cameraPose={poseCommand}
            cameraProjection={cameraProjection}
            cameraRig={cameraRigNode}
            canvasSurface="modal-3d"
            controls={
              <Scene3dViewControls
                onEgoView={applyEgoView}
                onTopView={applyTopView}
              />
            }
            fitResetKey={`${worldFrameId}:${sceneUpAxis}`}
            frustumLayers={displayedScene.frustumLayers}
            hudLines={hudLines}
            gridLayers={displayedScene.gridLayers}
            layers={displayedScene.pointCloudLayers}
            className={styles.panel}
            notices={displayedScene.notices}
            onCameraPoseChange={handleCameraPoseChange}
            onRenderStats={handlePanelRenderStats}
            pointSize={pointCloudPointSize}
            rayLayers={rayLayers}
            sceneUp={sceneUpAxis}
            showColorLegend={showPointCloudColorLegend}
            worldGrid={worldGrid}
          />
          {sceneSnapshotSelection.heldReason ? (
            <HeldSceneStatusBadge reason={sceneSnapshotSelection.heldReason} />
          ) : (
            <TileStatusBadge showWarnings={false} streams={selectedStreams} />
          )}
          {hoverTooltip ? <Scene3dHoverTooltip tooltip={hoverTooltip} /> : null}
        </div>
      ) : (
        <TileEmptyState streams={selectedStreams} />
      )}
    </>
  );
};

const HeldSceneStatusBadge: React.FC<{
  readonly reason: Scene3dHeldSceneReason;
}> = ({ reason }) => (
  <span
    className={styles.statusBadge}
    data-status="loading"
    data-testid="episode-3d-held-scene-status"
    role="status"
  >
    {reason === "pending" ? "Loading target" : "Waiting for transforms"}
    {" · showing previous scene"}
  </span>
);

export default Scene3dTile;
