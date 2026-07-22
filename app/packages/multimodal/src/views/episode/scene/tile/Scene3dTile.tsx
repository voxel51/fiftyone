import { useTileId, useTiling } from "@fiftyone/tiling";
import React, {
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePublishAnnotationStreams } from "../../../../extensions/timeline/index";
import type {
  CameraCalibrationVisualization,
  GridVisualization,
  ImageVisualization,
  LocationVisualization,
  PointCloudVisualization,
  PoseVisualization,
  SceneUpdateVisualization,
} from "../../../../ir/index";
import { imageTextureCacheKey } from "../../../../visualization/media-2d/image-texture-cache";
import { useKeyedIdentityMap } from "../../../../visualization/panel-ui/use-keyed-identity-map";
import type { ThreeSceneBackground } from "../../../../visualization/scene-3d/Base3dScene";
import { DEFAULT_POINT_CLOUD_CAMERA_PROJECTION } from "../../../../visualization/scene-3d/camera-fit-bounds";
import { PointCloudPanel } from "../../../../visualization/composition/index";
import {
  type CameraFrustumPanelLayer,
  type GridPanelLayer,
  type PointCloudCameraPose,
  type PointCloudCameraProjection,
  type PointCloudPanelLayer,
  type PointCloudPanelRenderStats,
  type PointCloudPointPick,
  type SceneAnnotationPanelLayer,
  type SceneRayPanelLayer,
} from "../../../../visualization/scene-3d/types";
import { Scene3dCameraRig } from "../camera/Scene3dCameraRig";
import Scene3dTileSettings from "./Scene3dTileSettings";
import { Scene3dViewControls } from "../camera/Scene3dViewControls";
import { build3dLayers } from "../entities/scene-3d-layers";
import {
  selectScene3dSnapshot,
  type HeldScene3dSnapshot,
  type Scene3dHeldSceneReason,
} from "../entities/scene-3d-scene-snapshot";
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
  type Scene3dViewpointController,
  useRegisterScene3dViewpoint,
} from "../camera/scene-3d-viewpoint-context";
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
import { type PrimitiveAtom, useStore } from "jotai";
import { useDataStream } from "../../playback/data-stream-context";
import {
  useFrustumImageHover,
  useHoveredImageStream,
  useImageTileBindings,
} from "../../tiles/tile-source-bindings";
import {
  Scene3dHoverTooltip,
  useScene3dHoverTooltip,
} from "../../interaction/point-hover/use-hover-tooltip";
import { useOpenImageTile } from "../../tiles/use-open-image-tile";
import {
  isLabelEcho,
  isSceneEntitySelected,
  entityLabel,
  selectedObjectAtom,
  useSelectedObject,
} from "../../interaction/selection/selected-object";
import { hoveredPointForFrame } from "../../interaction/point-hover/point-hover";
import {
  hoverEchoAtom,
  useHoverEcho,
  type HoverEcho,
} from "../../interaction/point-hover/hover-echo";
import { useDepthHover } from "../../spatial/depth-sampling";
import { resolveDepthRay } from "../../spatial/depth-projection";
import { useFrameTransformsContext } from "../../spatial/frame-transforms/context";
import {
  DEFAULT_IMAGE_PROJECTION,
  defaultPointCloudColorForSource,
  useImageProjectionSettingsByStream,
  usePinholeCameraSettings,
  usePlaybackSettings,
  usePointCloudStyleSettings,
  useReferenceGridSettings,
  useSceneBackgroundSettings,
  useTemporalPolicySettings,
} from "../../settings/modal/state";
import { resolveCameraModel } from "../../spatial/camera-geometry/camera-model";
import { cameraRayModel } from "../../spatial/camera-geometry/camera-ray-model";
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
import { useScene3dPlacementStream } from "../placement/use-scene-3d-placement-stream";
import { useScene3dViewShortcuts } from "../camera/use-scene-3d-view-shortcuts";
import {
  playbackFrameForStream,
  selectProvisionalPointCloudStream,
  useScene3dSelection,
} from "../picking/use-scene-3d-selection";
import { useInterpolatedSceneUpdateFrames } from "../entities/use-interpolated-scene-updates";
import { usePlaybackTimeNs } from "../../playback/use-playback-time-ns";
import { useStreamPlaybackFrames } from "../../playback/use-stream-values";
import { useVideoDecodeRunways } from "../../playback/video-decode-runway/use-video-decode-runways";

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
const DEFINITIVE_MISSING_SCENE_GRACE_MS = 2_000;
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
  const sourceKey = useDataStream()?.sourceKey ?? "";
  const jotaiStore = useStore();
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
  const selectedStreamStatuses = useStreamStatuses(selectedStreams);
  const selectedSourcePending = selectedStreamStatuses.some(
    (status) => status === "loading",
  );
  const frameTransforms = useFrameTransformsContext();
  const { fidelityMode } = usePlaybackSettings();
  const { temporalPolicy } = useTemporalPolicySettings();
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
  const sceneSnapshotRef = useRef<HeldScene3dSnapshot<Scene3dSnapshot> | null>(
    null,
  );
  const [, refreshSceneSnapshot] = useState(0);
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
  const frames =
    useStreamPlaybackFrames<PointCloudVisualization>(pointCloudStreams);
  const pointCloudColorCapabilities = usePointCloudColorCapabilities(
    pointCloudStreams,
    frames,
  );
  const heldAnnotationFrames =
    useStreamPlaybackFrames<SceneUpdateVisualization>(sceneAnnotationStreams);
  const annotationFrames = useInterpolatedSceneUpdateFrames({
    frames: heldAnnotationFrames,
    interpolate: fidelityMode === "smooth",
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
    clampedFrameIds,
    gridLayers,
    largeInterpolationGaps,
    pendingAnnotationFrameIds,
    pendingFrustumFrameIds,
    pendingGridFrameIds,
    pointCloudLayers,
    provisionalFrameIds,
    sceneAnnotationLayers,
    transformedLayerCount,
    unresolvedFrameIds,
  } = useMemo(() => {
    return build3dLayers({
      annotationFrames: combinedAnnotationFrames,
      calibrationFrames,
      frameTransforms,
      frames,
      gridFrames,
      largeInterpolationGapWarningNs: msToNs(
        temporalPolicy.transformGapWarningMs,
      ),
      provisionalStreamId,
      selectedAnnotationStreams: combinedAnnotationStreams,
      selectedCalibrationStreams: cameraStreams,
      selectedGridStreams: mapLayerStreams,
      selectedStreams: pointCloudStreams,
      worldFrameId,
    });
  }, [
    calibrationFrames,
    cameraStreams,
    combinedAnnotationFrames,
    combinedAnnotationStreams,
    frameTransforms,
    frames,
    gridFrames,
    mapLayerStreams,
    pointCloudStreams,
    provisionalStreamId,
    temporalPolicy.transformGapWarningMs,
    worldFrameId,
  ]);
  const pointCloudPlacementFrameIds = useMemo(
    () =>
      frames
        .map((frame) => frame?.frame.coordinateFrameId)
        .filter((frameId): frameId is string => Boolean(frameId)),
    [frames],
  );
  const placementReadiness = useScene3dPlacementStream({
    active: pointCloudStreams.length > 0,
    frameIds: pointCloudPlacementFrameIds,
    frameTransforms,
    playbackTimeNs,
    streamId: `episode-3d-placement:${tileId ?? "default"}`,
    worldFrameId,
  });
  const pointCloudSourceById = useMemo(
    () =>
      new Map(pointCloudSources.map((source) => [source.id, source] as const)),
    [pointCloudSources],
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
      layer,
      pointCloudColors[layer.id],
      pointCloudSourceById.get(layer.id),
      pointCloudSources,
    ],
    key: (layer) => layer.id,
  });
  // Attach each camera's current image to its frustum layer. Done outside
  // build3dLayers so the pure layer builder stays image-agnostic; index
  // alignment with cameraStreams mirrors the playback-frames arrays. The
  // texture key matches the one the 2D image tile forms for the same
  // (recording, image stream, frame), so both surfaces share one decoded
  // texture through the image-texture cache.
  const openImageTile = useOpenImageTile();
  const frustumImageHover = useFrustumImageHover();
  const hoveredImageStream = useHoveredImageStream();
  const imageTileBindings = useImageTileBindings();
  const {
    containerProps: hoverTooltipContainerProps,
    onHoverCamera,
    onHoverEntity,
    onHoverPoint,
    tooltip: hoverTooltip,
  } = useScene3dHoverTooltip();
  // The stream shown by the focused (active) tile, if it's an image tile.
  const focusedImageStream = focusedTileId
    ? (imageTileBindings[focusedTileId] ?? null)
    : null;
  const pinholeImagePlaneDepthM = pinholeCamera.imagePlaneDepthM;
  const pinholeOpacity = pinholeCamera.opacityPercent / 100;
  const frustumLayerCandidates = useKeyedIdentityMap(cameraFrustumLayers, {
    build: (layer) => {
      const index = cameraStreams.indexOf(layer.id);
      const imageFrame = index >= 0 ? frustumImageFrames[index] : null;
      const imageDecodeRunway =
        index >= 0 ? frustumImageDecodeRunways[index] : undefined;
      const imageStream = index >= 0 ? (frustumImageStreams[index] ?? "") : "";
      const geometry = imageStream
        ? (imageProjectionSettings[imageStream] ?? DEFAULT_IMAGE_PROJECTION)
            .geometry
        : "original";
      const cameraModelResolution = resolveCameraModel({
        calibration: layer.frame,
        geometry,
        imageStream,
      });
      const rayCameraModelResolution =
        cameraModelResolution.status === "ready"
          ? cameraModelResolution
          : resolveCameraModel({
              calibration: layer.frame,
              geometry: "original",
              imageStream,
            });
      const resolvedCameraRayModel =
        rayCameraModelResolution.status === "ready"
          ? cameraRayModel(rayCameraModelResolution.model)
          : undefined;
      // Cmd-clicking a frustum opens its image tile; hovering or focusing
      // the tile highlights the frustum.
      const linked = imageStream
        ? {
            highlighted: hoveredImageStream === imageStream,
            selected: focusedImageStream === imageStream,
            imageStream,
            onHover: (hovered: boolean) => {
              if (hovered) {
                frustumImageHover.setHovered(imageStream);
                onHoverCamera({
                  calibrationStream: layer.id,
                  distortionModel: layer.frame.distortionModel,
                  frameId: layer.frame.coordinateFrameId,
                  imageStream,
                  kind: "camera",
                  resolution: [layer.frame.width, layer.frame.height],
                });
                return;
              }
              if (frustumImageHover.clearIfCurrent(imageStream)) {
                onHoverCamera(null);
              }
            },
            onSelect: ({ metaKey }: { readonly metaKey: boolean }) => {
              if (metaKey) {
                openImageTile(imageStream);
              }
            },
          }
        : {};
      let imageProps: Partial<CameraFrustumPanelLayer> = {};
      if (imageFrame) {
        imageProps =
          cameraModelResolution.status === "ready"
            ? {
                image: imageFrame.frame,
                imageContentTimeNs: imageFrame.contentTimeNs,
                ...(imageDecodeRunway?.length ? { imageDecodeRunway } : {}),
                imageTextureKey:
                  sourceKey && imageStream
                    ? imageTextureCacheKey(
                        sourceKey,
                        imageStream,
                        imageFrame.contentTimeNs,
                      )
                    : undefined,
              }
            : { imageUnavailableReason: cameraModelResolution.message };
      }
      return {
        ...layer,
        ...linked,
        ...imageProps,
        cameraRayModel: resolvedCameraRayModel,
        imagePlaneDepthM: pinholeImagePlaneDepthM,
        opacity: pinholeOpacity,
        requireCameraRayModel: true,
      };
    },
    // Hover/focus enter as per-layer booleans, not the global stream values:
    // moving the hover from one camera to another rebuilds exactly those two
    // frustums.
    inputs: (layer) => {
      const index = cameraStreams.indexOf(layer.id);
      const imageStream = index >= 0 ? (frustumImageStreams[index] ?? "") : "";
      return [
        layer,
        index >= 0 ? frustumImageFrames[index] : null,
        index >= 0 ? frustumImageDecodeRunways[index] : null,
        imageStream,
        imageStream ? imageProjectionSettings[imageStream] : null,
        imageStream !== "" && hoveredImageStream === imageStream,
        imageStream !== "" && focusedImageStream === imageStream,
        frustumImageHover,
        openImageTile,
        onHoverCamera,
        pinholeImagePlaneDepthM,
        pinholeOpacity,
        sourceKey,
      ];
    },
    key: (layer) => layer.id,
  });
  const frustumLayers = useMemo(
    () =>
      frustumLayerCandidates.filter(
        (layer): layer is NonNullable<typeof layer> => layer !== null,
      ),
    [frustumLayerCandidates],
  );
  // Wire the scene annotations into the cross-tile selection: each layer
  // (one entity each) learns whether it's the selected object (or a
  // label-match echo of one) and how to toggle itself selected. Kept out
  // of build3dLayers so the pure layer builder stays selection-agnostic.
  const selectedObject = useSelectedObject();
  type SelectedObjectState = ReturnType<typeof useSelectedObject>;
  const setSelectedObject = useCallback(
    (update: SetStateAction<SelectedObjectState>) => {
      jotaiStore.set(
        selectedObjectAtom as PrimitiveAtom<SelectedObjectState>,
        update,
      );
    },
    [jotaiStore],
  );
  const annotationLayers = useKeyedIdentityMap(sceneAnnotationLayers, {
    build: (layer) => {
      const entity = layer.frame.entities[0];
      if (!entity) return layer;
      const stream = layer.sourceId ?? "";
      const entityId = entity.id || layer.id;
      const label = entityLabel(entity);
      const isSelected = isSceneEntitySelected(
        selectedObject,
        stream,
        entityId,
      );
      return {
        ...layer,
        highlighted: isSelected || isLabelEcho(selectedObject, label),
        onHoverEntity: (hoveredId: string | null) =>
          onHoverEntity(
            hoveredId ? { entityId, kind: "entity", label, stream } : null,
          ),
        onSelectEntity: (
          _entityId: string,
          modifiers: { readonly shiftKey: boolean },
        ) => {
          // Plain click = this instance only; shift-click widens to
          // every object sharing the label. Re-clicking with the same
          // scope toggles off; changing the modifier switches scope.
          const scope = modifiers.shiftKey ? "label" : "instance";
          setSelectedObject((current) =>
            isSceneEntitySelected(current, stream, entityId) &&
            current?.scope === scope
              ? null
              : {
                  entityId,
                  frameId: entity.frameId,
                  kind: "scene-annotation",
                  label,
                  metadata: entity.metadata,
                  scope,
                  stream,
                },
          );
        },
      };
    },
    // Selection enters as this entity's derived booleans, so a selection
    // change rebuilds the entity gaining and the entity losing emphasis —
    // not every annotation in the scene.
    inputs: (layer) => {
      const entity = layer.frame.entities[0];
      if (!entity) return [layer];
      const stream = layer.sourceId ?? "";
      const entityId = entity.id || layer.id;
      return [
        layer,
        isSceneEntitySelected(selectedObject, stream, entityId),
        isLabelEcho(selectedObject, entityLabel(entity)),
        onHoverEntity,
        setSelectedObject,
      ];
    },
    key: (layer) => layer.id,
  });
  // Share point hovers between the 3D scene and image projections.
  const hoverEcho = useHoverEcho();
  const publishedPointHoverRefs = useRef(new Map<string, HoverEcho>());
  const hoverablePointCloudLayers = useKeyedIdentityMap(
    coloredPointCloudLayers,
    {
      build: (layer) => {
        const stream = layer.id;
        const frame = layer.frame;
        return {
          ...layer,
          hoveredPoint:
            hoverEcho?.kind === "point" && hoverEcho.stream === stream
              ? { color: hoverEcho.color, position: hoverEcho.position }
              : null,
          onHoverPoint: (pick: PointCloudPointPick | null) => {
            const hoveredPoint = pick
              ? hoveredPointForFrame(stream, frame, pick.pointIndex)
              : null;
            const payload = hoveredPoint
              ? { ...hoveredPoint, color: pick?.color ?? null }
              : null;
            onHoverPoint(payload);
            if (payload && pick) {
              const hover: HoverEcho = {
                color: pick.color,
                kind: "point",
                pointIndex: payload.pointIndex,
                position: payload.position,
                stream,
              };
              publishedPointHoverRefs.current.set(stream, hover);
              jotaiStore.set(hoverEchoAtom, hover);
              return;
            }

            const published = publishedPointHoverRefs.current.get(stream);
            publishedPointHoverRefs.current.delete(stream);
            if (published) {
              jotaiStore.set(hoverEchoAtom, (current) =>
                current === published ? null : current,
              );
            }
          },
        };
      },
      // The hover echo enters as this stream's slice (null for everyone
      // else), so pointer movement over one cloud never rebuilds the others.
      inputs: (layer) => [
        layer,
        hoverEcho?.kind === "point" && hoverEcho.stream === layer.id
          ? hoverEcho
          : null,
        jotaiStore,
        onHoverPoint,
      ],
      key: (layer) => layer.id,
    },
  );
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
  const transformNotices = useMemo(
    () =>
      buildScene3dTransformNotices({
        clampedFrameIds,
        frameTransformsError: frameTransforms.error,
        largeInterpolationGaps,
        unresolvedFrameIds,
        worldFrameId,
      }),
    [
      clampedFrameIds,
      frameTransforms.error,
      largeInterpolationGaps,
      unresolvedFrameIds,
      worldFrameId,
    ],
  );
  const {
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
  const updateCameraProjection = useCallback(
    (projection: PointCloudCameraProjection) => {
      const normalized = normalizeScene3dCameraProjection(projection);
      setCameraProjection(normalized);
      viewpointStore.publish({ projection: normalized });
      viewStateStore.recordCameraProjection(normalized);
    },
    [viewStateStore, viewpointStore],
  );
  const viewpointActionsRef = useRef<{
    setCameraNavigationMode: (mode: Scene3dCameraNavigationMode) => void;
    setPose: (pose: PointCloudCameraPose) => void;
    setProjection: (projection: PointCloudCameraProjection) => void;
  }>({
    setCameraNavigationMode: () => undefined,
    setPose: () => undefined,
    setProjection: () => undefined,
  });
  viewpointActionsRef.current = {
    setCameraNavigationMode: (mode) => {
      setCameraNavigationMode(mode);
      viewpointStore.publish({ cameraNavigationMode: mode });
      viewStateStore.recordCameraNavigationMode(mode);
    },
    setPose: (pose) => {
      viewpointStore.publish({ pose });
      handleCameraPoseChange(pose, "focus");
    },
    setProjection: updateCameraProjection,
  };
  const [viewpointController] = useState<Scene3dViewpointController>(() => ({
    ...viewpointStore,
    setCameraNavigationMode: (mode) =>
      viewpointActionsRef.current.setCameraNavigationMode(mode),
    setPose: (pose) => viewpointActionsRef.current.setPose(pose),
    setProjection: (projection) =>
      viewpointActionsRef.current.setProjection(projection),
  }));
  useRegisterScene3dViewpoint(tileId, viewpointController);
  // This effect publishes infrequent camera settings to the sidebar store.
  useEffect(() => {
    viewpointStore.publish({
      cameraNavigationMode,
      projection: cameraProjection,
      sceneUpAxis,
    });
  }, [cameraNavigationMode, cameraProjection, sceneUpAxis, viewpointStore]);
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
  // The same stabilized set feeds the sidebar's Scene status strip, so
  // scene health reads identically in the canvas chip and the sidebar.
  usePublishSceneNotices(tileId, panelNotices);
  const sceneSnapshotKey = useMemo(
    () =>
      JSON.stringify([
        sourceKey,
        selectedStreamsKey,
        worldFrameId,
        fidelityMode,
      ]),
    [fidelityMode, selectedStreamsKey, sourceKey, worldFrameId],
  );
  const currentSceneSnapshot = useMemo<Scene3dSnapshot>(
    () => ({
      annotationLayers,
      frustumLayers,
      gridLayers,
      notices: panelNotices,
      placementStatus,
      pointCloudLayers: hoverablePointCloudLayers,
    }),
    [
      annotationLayers,
      hoverablePointCloudLayers,
      frustumLayers,
      gridLayers,
      panelNotices,
      placementStatus,
    ],
  );
  const hasSceneSourceData =
    frames.some(Boolean) ||
    annotationFrames.some(Boolean) ||
    gridFrames.some(Boolean) ||
    calibrationFrames.some(Boolean);
  const currentSceneRetainable =
    currentSceneSnapshot.pointCloudLayers.length > 0 ||
    currentSceneSnapshot.annotationLayers.length > 0 ||
    currentSceneSnapshot.gridLayers.length > 0 ||
    currentSceneSnapshot.frustumLayers.length > 0;
  const sceneSnapshotSelection = selectScene3dSnapshot({
    current: currentSceneSnapshot,
    currentRetainable: currentSceneRetainable,
    definitiveMissingGraceMs: DEFINITIVE_MISSING_SCENE_GRACE_MS,
    empty: emptyScene3dSnapshot(currentSceneSnapshot.placementStatus),
    hasSourceData: hasSceneSourceData,
    held: sceneSnapshotRef.current,
    key: sceneSnapshotKey,
    nowMs: Date.now(),
    readiness: selectedSourcePending
      ? "pending"
      : placementReadiness.status === "ready" ||
          placementReadiness.status === "definitiveMissing"
        ? placementReadiness.status
        : "pending",
  });
  // This layout effect commits held-scene state only after React commits the
  // scene selected by the same render.
  useLayoutEffect(() => {
    sceneSnapshotRef.current = sceneSnapshotSelection.nextHeld;
  }, [sceneSnapshotSelection.nextHeld]);
  const displayedScene = sceneSnapshotSelection.snapshot;
  // This effect expires a transform-only scene hold even when no new stream
  // event arrives to trigger another render.
  useEffect(() => {
    if (sceneSnapshotSelection.graceRemainingMs === null) return undefined;
    const timer = setTimeout(
      () => refreshSceneSnapshot((version) => version + 1),
      sceneSnapshotSelection.graceRemainingMs,
    );
    return () => clearTimeout(timer);
  }, [sceneSnapshotSelection.graceRemainingMs]);
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
  const depthRayLayers =
    depthRayResolution?.status === "ready"
      ? [depthRayResolution.layer]
      : EMPTY_SCENE_RAYS;
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
      ) : // Gate on the UNSTABILIZED notices: a live notice condition must keep
      // the panel (and its GL canvas) mounted even while the stabilizer's
      // appearance floor still hides it from the chip — otherwise short
      // transform dropouts would flash the empty state and churn the canvas.
      displayedScene.pointCloudLayers.length > 0 ||
        displayedScene.annotationLayers.length > 0 ||
        displayedScene.gridLayers.length > 0 ||
        displayedScene.frustumLayers.length > 0 ||
        depthRayLayers.length > 0 ||
        producedNotices.length > 0 ? (
        <div className={styles.panelStack} {...hoverTooltipContainerProps}>
          <PointCloudPanel
            annotationLayers={displayedScene.annotationLayers}
            background={panelBackground}
            cameraPose={poseCommand}
            cameraProjection={cameraProjection}
            cameraRig={<Scene3dCameraRig {...rig} />}
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
            rayLayers={depthRayLayers}
            sceneUp={sceneUpAxis}
            showColorLegend={showPointCloudColorLegend}
            worldGrid={worldGrid}
          />
          {sceneSnapshotSelection.heldReason ? (
            <HeldSceneStatusBadge reason={sceneSnapshotSelection.heldReason} />
          ) : (
            <TileStatusBadge streams={selectedStreams} />
          )}
          {hoverTooltip ? <Scene3dHoverTooltip tooltip={hoverTooltip} /> : null}
        </div>
      ) : (
        <TileEmptyState streams={selectedStreams} />
      )}
    </>
  );
};

function msToNs(value: number): bigint {
  return BigInt(Math.max(0, Math.round(value))) * 1_000_000n;
}

interface Scene3dSnapshot {
  readonly annotationLayers: readonly SceneAnnotationPanelLayer[];
  readonly frustumLayers: readonly CameraFrustumPanelLayer[];
  readonly gridLayers: readonly GridPanelLayer[];
  readonly notices: readonly HealthNotice[];
  readonly placementStatus: Scene3dPlacementStatus;
  readonly pointCloudLayers: readonly PointCloudPanelLayer[];
}

function emptyScene3dSnapshot(
  placementStatus: Scene3dPlacementStatus,
): Scene3dSnapshot {
  return {
    annotationLayers: [],
    frustumLayers: [],
    gridLayers: [],
    notices: [],
    placementStatus,
    pointCloudLayers: [],
  };
}

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
