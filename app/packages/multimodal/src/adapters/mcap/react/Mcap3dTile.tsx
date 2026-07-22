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
import type {
  CameraCalibrationVisualization,
  GridVisualization,
  ImageVisualization,
  LocationVisualization,
  PointCloudVisualization,
  PoseVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import { imageTextureCacheKey } from "../../../visualization/panels/image-texture-cache";
import { useKeyedIdentityMap } from "../../../visualization/panels/use-keyed-identity-map";
import type { ThreeSceneBackground } from "../../../visualization/panels/base-3d-scene";
import { DEFAULT_POINT_CLOUD_CAMERA_PROJECTION } from "../../../visualization/panels/point-cloud/camera-fit-bounds";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud/PointCloudPanel";
import {
  type CameraFrustumPanelLayer,
  type PointCloudCameraPose,
  type PointCloudCameraProjection,
  type PointCloudPanelLayer,
  type PointCloudPanelRenderStats,
  type PointCloudPointPick,
  type SceneRayPanelLayer,
} from "../../../visualization/panels/point-cloud/types";
import { Mcap3dCameraRig } from "./Mcap3dCameraRig";
import Mcap3dTileSettings from "./Mcap3dTileSettings";
import { Mcap3dViewControls } from "./Mcap3dViewControls";
import { build3dLayers } from "./mcap-3d-layers";
import {
  mcap3dSceneSnapshotHasLayers,
  restrictHeldMcap3dSceneSnapshotToTopics,
  selectMcap3dSceneSnapshot,
  type HeldMcap3dSceneSnapshot,
  type Mcap3dHeldSceneReason,
  type Mcap3dSceneSnapshot,
} from "./mcap-3d-scene-snapshot";
import { useMcap3dViewSettings } from "./mcap-3d-view-settings-context";
import {
  buildMcap3dPlacementNotices,
  buildMcap3dTransformNotices,
  buildMcapCapabilityNotices,
  buildMcapReferenceFrameNotices,
  useStabilizedMcapNotices,
  type McapHealthNotice,
} from "./mcap-health";
import {
  useMcapTopicDiagnostics,
  useMcapTopicStatuses,
} from "./mcap-stream-status-state";
import { useMcap3dViewStateStore } from "./mcap-3d-view-state-context";
import {
  type Mcap3dViewpointController,
  useRegisterMcap3dViewpoint,
} from "./mcap-3d-viewpoint-context";
import {
  useRegisterMcapSceneFrameControls,
  useMcapSceneFrameControls,
  type McapSceneFrameControls,
} from "./mcap-scene-frames-context";
import { usePublishMcapSceneNotices } from "./mcap-scene-notices-context";
import { useRegisterMcapTileSettings } from "./mcap-tile-settings-context";
import {
  createMcap3dViewpointStore,
  normalizeMcap3dCameraProjection,
} from "./mcap-3d-viewpoint";
import type { Mcap3dCameraNavigationMode } from "./mcap-3d-view-state";
import { type PrimitiveAtom, useStore } from "jotai";
import { useMcapDataStream } from "./mcap-data-stream-context";
import {
  useMcapFrustumImageHover,
  useMcapHoveredImageTopic,
  useMcapImageTileBindings,
} from "./mcap-tile-source-bindings";
import {
  Mcap3dHoverTooltip,
  useMcap3dHoverTooltip,
} from "./use-mcap-3d-hover-tooltip";
import { useOpenMcapImageTile } from "./use-open-mcap-image-tile";
import {
  isMcapLabelEcho,
  isMcapSceneEntitySelected,
  mcapEntityLabel,
  mcapSelectedObjectAtom,
  useMcapSelectedObject,
} from "./mcap-selected-object";
import { mcapHoveredPointForFrame } from "./mcap-point-hover";
import {
  mcapHoverEchoAtom,
  useMcapHoverEcho,
  type McapHoverEcho,
} from "./mcap-hover-echo";
import { useMcapDepthHover } from "./mcap-depth-hover";
import { resolveMcapDepthRay } from "./mcap-depth-ray";
import { useMcapFrameTransformsContext } from "./mcap-frame-transforms-context";
import {
  DEFAULT_MCAP_IMAGE_PROJECTION,
  defaultMcapPointCloudColorForSource,
  useMcapImageProjectionSettingsByTopic,
  useMcapPinholeCameraSettings,
  useMcapPlaybackSettings,
  useMcapPointCloudStyleSettings,
  useMcapReferenceGridSettings,
  useMcapSceneBackgroundSettings,
  useMcapTemporalPolicySettings,
} from "./mcap-modal-settings";
import { resolveMcapCameraModel } from "./camera-geometry/mcap-camera-model";
import { mcapCameraRayModel } from "./camera-geometry/mcap-camera-ray-model";
import { usePointCloudColorCapabilities } from "./use-point-cloud-color-capabilities";
import type { McapTileProps } from "./mcap-tile-types";
import styles from "./McapTile.module.css";
import { McapTileEmptyState, McapTileStatusBadge } from "./McapTileStreamState";
import { locationHudLine, speedHudLine } from "./pose-trajectory";
import {
  useMcap3dCameraTracking,
  type Mcap3dPlacementStatus,
} from "./use-mcap-3d-camera-tracking";
import { useMcap3dFrameSelection } from "./use-mcap-3d-frame-selection";
import { useMcap3dPoseTrajectories } from "./use-mcap-3d-pose-trajectories";
import { useMcap3dPlacementStream } from "./use-mcap-3d-placement-stream";
import { useMcap3dViewShortcuts } from "./use-mcap-3d-view-shortcuts";
import {
  playbackFrameForTopic,
  selectProvisionalPointCloudTopic,
  useMcap3dSelection,
} from "./use-mcap-3d-selection";
import { useInterpolatedSceneUpdateFrames } from "./use-interpolated-scene-updates";
import { useMcapPlaybackTimeNs } from "./use-mcap-playback-time-ns";
import { useMcapTopicPlaybackFrames } from "./use-mcap-topic-stream";
import { useMcapVideoDecodeRunways } from "./use-mcap-video-decode-runways";

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
const Mcap3dTile: React.FC<McapTileProps> = () => {
  const viewStateStore = useMcap3dViewStateStore();
  const sourceKey = useMcapDataStream()?.sourceKey ?? "";
  const jotaiStore = useStore();
  // The previous mount's view state, read once before any write-through can
  // overwrite it. The tile remounts per sample, so this snapshot is exactly
  // the state the user left the previous sample's 3D tile in.
  const [viewStateRestore] = useState(() => viewStateStore.getSnapshot());
  const [cameraProjection, setCameraProjection] = useState(() =>
    normalizeMcap3dCameraProjection(
      viewStateRestore.cameraProjection ??
        DEFAULT_POINT_CLOUD_CAMERA_PROJECTION,
    ),
  );
  const [cameraNavigationMode, setCameraNavigationMode] =
    useState<Mcap3dCameraNavigationMode>(viewStateRestore.cameraNavigationMode);
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
    cameraTopics,
    enabled,
    frustumImageTopics,
    locationTopics,
    mapLayerSources,
    mapLayerTopics,
    pointCloudSources,
    pointCloudTopics,
    poseSources,
    poseTopics,
    primarySourceId,
    renderableSourceIds,
    restoredSourceShapeMatches,
    sceneAnnotationSources,
    sceneAnnotationTopics,
    selectedPointCloudSources,
    selectedPoseSources,
    selectedTopics,
    selectedTopicsKey,
    setSourcesEnabled,
    toggleSource,
  } = useMcap3dSelection({ restore: viewStateRestore, sourceKey });
  const selectedTopicStatuses = useMcapTopicStatuses(selectedTopics);
  const selectedSourcePending = selectedTopicStatuses.some(
    (status) => status === "loading",
  );
  const frameTransforms = useMcapFrameTransformsContext();
  const { fidelityMode } = useMcapPlaybackSettings();
  const { temporalPolicy } = useMcapTemporalPolicySettings();
  const { pinholeCamera } = useMcapPinholeCameraSettings();
  const imageProjectionSettings = useMcapImageProjectionSettingsByTopic();
  const { pointCloudColors, pointCloudPointSize, showPointCloudColorLegend } =
    useMcapPointCloudStyleSettings();
  const { referenceGrid } = useMcapReferenceGridSettings();
  const { sceneBackground } = useMcapSceneBackgroundSettings();
  const {
    defaultTrackingMode,
    preferredCameraTargetFrameId,
    preferredWorldFrameId,
    sceneUpAxis,
    setDefaultTrackingMode,
    setPreferredCameraTargetFrameId,
    setPreferredWorldFrameId,
  } = useMcap3dViewSettings();
  const [viewpointStore] = useState(() =>
    createMcap3dViewpointStore({
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
  const sceneSnapshotRef =
    useRef<HeldMcap3dSceneSnapshot<Mcap3dSceneSnapshot> | null>(null);
  const panelHasCommittedRef = useRef(false);
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
    useMcapTopicPlaybackFrames<ImageVisualization>(frustumImageTopics);
  const frustumImageDecodeRunways = useMcapVideoDecodeRunways(
    frustumImageTopics,
    frustumImageFrames,
  );
  const frames =
    useMcapTopicPlaybackFrames<PointCloudVisualization>(pointCloudTopics);
  const pointCloudColorCapabilities = usePointCloudColorCapabilities(
    pointCloudTopics,
    frames,
  );
  const heldAnnotationFrames =
    useMcapTopicPlaybackFrames<SceneUpdateVisualization>(sceneAnnotationTopics);
  const annotationFrames = useInterpolatedSceneUpdateFrames({
    frames: heldAnnotationFrames,
    interpolate: fidelityMode === "smooth",
    topics: sceneAnnotationTopics,
  });
  const gridFrames =
    useMcapTopicPlaybackFrames<GridVisualization>(mapLayerTopics);
  const calibrationFrames =
    useMcapTopicPlaybackFrames<CameraCalibrationVisualization>(cameraTopics);
  const calibrationDiagnostics = useMcapTopicDiagnostics(cameraTopics);
  const poseFrames = useMcapTopicPlaybackFrames<PoseVisualization>(poseTopics);
  const locationFrames =
    useMcapTopicPlaybackFrames<LocationVisualization>(locationTopics);
  const playbackTimeNs = useMcapPlaybackTimeNs();
  const registeredSceneFrameControls = useMcapSceneFrameControls();
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
  } = useMcap3dFrameSelection({
    annotationFrames,
    annotationTopics: sceneAnnotationTopics,
    calibrationFrames,
    calibrationTopics: cameraTopics,
    frames,
    frameTransforms,
    gridFrames,
    gridTopics: mapLayerTopics,
    onPreferredCameraTargetFrameIdChange: setPreferredCameraTargetFrameId,
    onPreferredWorldFrameIdChange: setPreferredWorldFrameId,
    carriedCameraTargetFrameId,
    playbackTimeNs,
    pointCloudTopics,
    poseFrames,
    poseTopics,
    preferredCameraTargetFrameId,
    preferredWorldFrameId,
    primarySourceId,
    referenceAuthority,
    restore: viewStateRestore,
  });
  // The reference frame is scene-scoped: publish this tile's controls so
  // the sidebar's Scene tab can edit them. Selections write through the
  // modal-wide preference, so concurrent 3D tiles converge on one choice.
  const sceneFrameControls = useMemo<McapSceneFrameControls>(
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
  useRegisterMcapSceneFrameControls(tileId, sceneFrameControls);

  const provisionalTopicId = useMemo(
    () => selectProvisionalPointCloudTopic(selectedPointCloudSources, frames),
    [frames, selectedPointCloudSources],
  );
  const provisionalPlaybackFrame = useMemo(
    () => playbackFrameForTopic(pointCloudTopics, frames, provisionalTopicId),
    [frames, pointCloudTopics, provisionalTopicId],
  );
  const {
    combinedAnnotationFrames,
    combinedAnnotationTopics,
    setTrajectoryFrameOverrides,
    trajectories,
    trajectoryFrameByTopic,
  } = useMcap3dPoseTrajectories({
    annotationFrames,
    frameIds,
    playbackTimeNs,
    poseFrames,
    poseTopics,
    // Trajectory overrides share the enabled-set's strict shape gate: they
    // only carry over onto a same-shaped recording.
    restore: restoredSourceShapeMatches
      ? viewStateRestore.trajectoryFrameOverrides
      : null,
    sceneAnnotationTopics,
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
      provisionalTopicId,
      selectedAnnotationTopics: combinedAnnotationTopics,
      selectedCalibrationTopics: cameraTopics,
      selectedGridTopics: mapLayerTopics,
      selectedTopics: pointCloudTopics,
      worldFrameId,
    });
  }, [
    calibrationFrames,
    cameraTopics,
    combinedAnnotationFrames,
    combinedAnnotationTopics,
    frameTransforms,
    frames,
    gridFrames,
    mapLayerTopics,
    pointCloudTopics,
    provisionalTopicId,
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
  const placementReadiness = useMcap3dPlacementStream({
    active: pointCloudTopics.length > 0,
    frameIds: pointCloudPlacementFrameIds,
    frameTransforms,
    playbackTimeNs,
    streamId: `mcap-3d-placement:${tileId ?? "default"}`,
    worldFrameId,
  });
  const pointCloudSourceById = useMemo(
    () =>
      new Map(pointCloudSources.map((source) => [source.id, source] as const)),
    [pointCloudSources],
  );

  // Attach each cloud's color settings outside build3dLayers so the pure
  // layer builder stays color-agnostic; layer id = topic. Keyed identity:
  // wrappers survive renders their own inputs didn't cause, so memoized
  // scene layers skip reconciliation for untouched siblings.
  const coloredPointCloudLayers = useKeyedIdentityMap(pointCloudLayers, {
    build: (layer) => {
      const source = pointCloudSourceById.get(layer.id) ?? {
        id: layer.id,
        label: layer.id,
      };
      const settings = {
        ...defaultMcapPointCloudColorForSource(source, pointCloudSources),
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
      ...mcap3dFrameTransformIdentityInputs(layer.frameTransform),
      pointCloudColors[layer.id],
      pointCloudSourceById.get(layer.id),
      pointCloudSources,
    ],
    key: (layer) => layer.id,
  });
  // Attach each camera's current image to its frustum layer. Done outside
  // build3dLayers so the pure layer builder stays image-agnostic; index
  // alignment with cameraTopics mirrors the playback-frames arrays. The
  // texture key matches the one the 2D image tile forms for the same
  // (recording, image topic, frame), so both surfaces share one decoded
  // texture through the image-texture cache.
  const openImageTile = useOpenMcapImageTile();
  const frustumImageHover = useMcapFrustumImageHover();
  const hoveredImageTopic = useMcapHoveredImageTopic();
  const imageTileBindings = useMcapImageTileBindings();
  const {
    containerProps: hoverTooltipContainerProps,
    onHoverCamera,
    onHoverEntity,
    onHoverPoint,
    tooltip: hoverTooltip,
  } = useMcap3dHoverTooltip();
  // The stream shown by the focused (active) tile, if it's an image tile.
  const focusedImageTopic = focusedTileId
    ? (imageTileBindings[focusedTileId] ?? null)
    : null;
  const pinholeImagePlaneDepthM = pinholeCamera.imagePlaneDepthM;
  const pinholeOpacity = pinholeCamera.opacityPercent / 100;
  const frustumLayerCandidates = useKeyedIdentityMap(cameraFrustumLayers, {
    build: (layer) => {
      const index = cameraTopics.indexOf(layer.id);
      const imageFrame = index >= 0 ? frustumImageFrames[index] : null;
      const imageDecodeRunway =
        index >= 0 ? frustumImageDecodeRunways[index] : undefined;
      const imageTopic = index >= 0 ? (frustumImageTopics[index] ?? "") : "";
      const geometry = imageTopic
        ? (imageProjectionSettings[imageTopic] ?? DEFAULT_MCAP_IMAGE_PROJECTION)
            .geometry
        : "original";
      const cameraModelResolution = resolveMcapCameraModel({
        calibration: layer.frame,
        geometry,
        imageTopic,
      });
      const rayCameraModelResolution =
        cameraModelResolution.status === "ready"
          ? cameraModelResolution
          : resolveMcapCameraModel({
              calibration: layer.frame,
              geometry: "original",
              imageTopic,
            });
      const cameraRayModel =
        rayCameraModelResolution.status === "ready"
          ? mcapCameraRayModel(rayCameraModelResolution.model)
          : undefined;
      // Cmd-clicking a frustum opens its image tile; hovering or focusing
      // the tile highlights the frustum.
      const linked = imageTopic
        ? {
            highlighted: hoveredImageTopic === imageTopic,
            selected: focusedImageTopic === imageTopic,
            imageTopic,
            onHover: (hovered: boolean) => {
              if (hovered) {
                frustumImageHover.setHovered(imageTopic);
                onHoverCamera({
                  calibrationTopic: layer.id,
                  distortionModel: layer.frame.distortionModel,
                  frameId: layer.frame.coordinateFrameId,
                  imageTopic,
                  kind: "camera",
                  resolution: [layer.frame.width, layer.frame.height],
                });
                return;
              }
              if (frustumImageHover.clearIfCurrent(imageTopic)) {
                onHoverCamera(null);
              }
            },
            onSelect: ({ metaKey }: { readonly metaKey: boolean }) => {
              if (metaKey) {
                openImageTile(imageTopic);
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
                  sourceKey && imageTopic
                    ? imageTextureCacheKey(
                        sourceKey,
                        imageTopic,
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
        cameraRayModel,
        imagePlaneDepthM: pinholeImagePlaneDepthM,
        opacity: pinholeOpacity,
        requireCameraRayModel: true,
      };
    },
    // Hover/focus enter as per-layer booleans, not the global topic values:
    // moving the hover from one camera to another rebuilds exactly those two
    // frustums.
    inputs: (layer) => {
      const index = cameraTopics.indexOf(layer.id);
      const imageTopic = index >= 0 ? (frustumImageTopics[index] ?? "") : "";
      return [
        layer.frame,
        layer.contentTimeNs,
        ...mcap3dFrameTransformIdentityInputs(layer.frameTransform),
        index >= 0 ? frustumImageFrames[index] : null,
        index >= 0 ? frustumImageDecodeRunways[index] : null,
        imageTopic,
        imageTopic ? imageProjectionSettings[imageTopic] : null,
        imageTopic !== "" && hoveredImageTopic === imageTopic,
        imageTopic !== "" && focusedImageTopic === imageTopic,
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
  const selectedObject = useMcapSelectedObject();
  type SelectedObjectState = ReturnType<typeof useMcapSelectedObject>;
  const setSelectedObject = useCallback(
    (update: SetStateAction<SelectedObjectState>) => {
      jotaiStore.set(
        mcapSelectedObjectAtom as PrimitiveAtom<SelectedObjectState>,
        update,
      );
    },
    [jotaiStore],
  );
  const annotationLayers = useKeyedIdentityMap(sceneAnnotationLayers, {
    build: (layer) => {
      const entity = layer.frame.entities[0];
      if (!entity) return layer;
      const topic = layer.sourceId ?? "";
      const entityId = entity.id || layer.id;
      const label = mcapEntityLabel(entity);
      const isSelected = isMcapSceneEntitySelected(
        selectedObject,
        topic,
        entityId,
      );
      return {
        ...layer,
        highlighted: isSelected || isMcapLabelEcho(selectedObject, label),
        onHoverEntity: (hoveredId: string | null) =>
          onHoverEntity(
            hoveredId ? { entityId, kind: "entity", label, topic } : null,
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
            isMcapSceneEntitySelected(current, topic, entityId) &&
            current?.scope === scope
              ? null
              : {
                  entityId,
                  frameId: entity.frameId,
                  kind: "scene-annotation",
                  label,
                  metadata: entity.metadata,
                  scope,
                  topic,
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
      if (!entity) {
        return [
          layer.frame,
          layer.sourceId,
          ...mcap3dFrameTransformIdentityInputs(layer.frameTransform),
        ];
      }
      const topic = layer.sourceId ?? "";
      const entityId = entity.id || layer.id;
      return [
        entity,
        layer.sourceId,
        ...mcap3dFrameTransformIdentityInputs(layer.frameTransform),
        isMcapSceneEntitySelected(selectedObject, topic, entityId),
        isMcapLabelEcho(selectedObject, mcapEntityLabel(entity)),
        onHoverEntity,
        setSelectedObject,
      ];
    },
    key: (layer) => layer.id,
  });
  // Share point hovers between the 3D scene and image projections.
  const hoverEcho = useMcapHoverEcho();
  const publishedPointHoverRefs = useRef(new Map<string, McapHoverEcho>());
  const hoverablePointCloudLayers = useKeyedIdentityMap(
    coloredPointCloudLayers,
    {
      build: (layer) => {
        const topic = layer.id;
        const frame = layer.frame;
        return {
          ...layer,
          hoveredPoint:
            hoverEcho?.kind === "point" && hoverEcho.topic === topic
              ? { color: hoverEcho.color, position: hoverEcho.position }
              : null,
          onHoverPoint: (pick: PointCloudPointPick | null) => {
            const hoveredPoint = pick
              ? mcapHoveredPointForFrame(topic, frame, pick.pointIndex)
              : null;
            const payload = hoveredPoint
              ? { ...hoveredPoint, color: pick?.color ?? null }
              : null;
            onHoverPoint(payload);
            if (payload && pick) {
              const hover: McapHoverEcho = {
                color: pick.color,
                kind: "point",
                pointIndex: payload.pointIndex,
                position: payload.position,
                topic,
              };
              publishedPointHoverRefs.current.set(topic, hover);
              jotaiStore.set(mcapHoverEchoAtom, hover);
              return;
            }

            const published = publishedPointHoverRefs.current.get(topic);
            publishedPointHoverRefs.current.delete(topic);
            if (published) {
              jotaiStore.set(mcapHoverEchoAtom, (current) =>
                current === published ? null : current,
              );
            }
          },
        };
      },
      // The hover echo enters as this topic's slice (null for everyone
      // else), so pointer movement over one cloud never rebuilds the others.
      inputs: (layer) => [
        layer,
        hoverEcho?.kind === "point" && hoverEcho.topic === layer.id
          ? hoverEcho
          : null,
        jotaiStore,
        onHoverPoint,
      ],
      key: (layer) => layer.id,
    },
  );
  const stableGridLayers = useKeyedIdentityMap(gridLayers, {
    build: (layer) => layer,
    inputs: (layer) => [
      layer.frame,
      layer.contentTimeNs,
      ...mcap3dFrameTransformIdentityInputs(layer.frameTransform),
    ],
    key: (layer) => layer.id,
  });
  // Schema-driven telemetry: speed from the first enabled pose stream whose
  // latest sample carries velocity, coordinates from the first LocationFix
  // stream — never keyed on topic names.
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
  const placementStatus = useMemo<Mcap3dPlacementStatus>(
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
      buildMcap3dPlacementNotices({
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
      buildMcap3dTransformNotices({
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
  } = useMcap3dCameraTracking({
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
    selectedTopicsKey,
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
      const normalized = normalizeMcap3dCameraProjection(projection);
      setCameraProjection(normalized);
      viewpointStore.publish({ projection: normalized });
      viewStateStore.recordCameraProjection(normalized);
    },
    [viewStateStore, viewpointStore],
  );
  const viewpointActionsRef = useRef<{
    setCameraNavigationMode: (mode: Mcap3dCameraNavigationMode) => void;
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
  const [viewpointController] = useState<Mcap3dViewpointController>(() => ({
    ...viewpointStore,
    setCameraNavigationMode: (mode) =>
      viewpointActionsRef.current.setCameraNavigationMode(mode),
    setPose: (pose) => viewpointActionsRef.current.setPose(pose),
    setProjection: (projection) =>
      viewpointActionsRef.current.setProjection(projection),
  }));
  useRegisterMcap3dViewpoint(tileId, viewpointController);
  // This effect publishes infrequent camera settings to the sidebar store.
  useEffect(() => {
    viewpointStore.publish({
      cameraNavigationMode,
      projection: cameraProjection,
      sceneUpAxis,
    });
  }, [cameraNavigationMode, cameraProjection, sceneUpAxis, viewpointStore]);
  const { applyEgoView, applyTopView } = useMcap3dViewShortcuts({
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
  const producedNotices = useMemo<readonly McapHealthNotice[]>(
    () => [
      ...placementNotices,
      ...transformNotices,
      ...buildMcapCapabilityNotices(cameraTopics, calibrationDiagnostics),
      ...buildMcapReferenceFrameNotices({
        omittedFrameIds,
        omittedSourceIds,
        referenceFrameId: worldFrameId,
        source: referenceSelectionSource,
      }),
      ...(cameraTrackingNotice ? [cameraTrackingNotice] : []),
    ],
    [
      calibrationDiagnostics,
      cameraTopics,
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
  const panelNotices = useStabilizedMcapNotices(producedNotices);
  // The same stabilized set feeds the sidebar's Scene status strip, so
  // scene health reads identically in the canvas chip and the sidebar.
  usePublishMcapSceneNotices(tileId, panelNotices);
  const sceneSnapshotKey = useMemo(
    () => JSON.stringify([sourceKey, worldFrameId, fidelityMode]),
    [fidelityMode, sourceKey, worldFrameId],
  );
  const currentSceneSnapshot = useMemo<Mcap3dSceneSnapshot>(
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
  const currentSceneRetainable =
    mcap3dSceneSnapshotHasLayers(currentSceneSnapshot);
  const selectedTopicSet = useMemo(
    () => new Set(selectedTopics),
    [selectedTopics],
  );
  const sceneSnapshotSelection = selectMcap3dSceneSnapshot({
    current: currentSceneSnapshot,
    currentRetainable: currentSceneRetainable,
    definitiveMissingGraceMs: DEFINITIVE_MISSING_SCENE_GRACE_MS,
    empty: emptyMcap3dSceneSnapshot(currentSceneSnapshot.placementStatus),
    hasSourceData: hasSceneSourceData,
    held: restrictHeldMcap3dSceneSnapshotToTopics(
      sceneSnapshotRef.current,
      selectedTopicSet,
    ),
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
  const depthHover = useMcapDepthHover();
  const depthRayResolution = useMemo(
    () =>
      depthHover
        ? resolveMcapDepthRay({
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
  const sceneHasRenderableContent =
    mcap3dSceneSnapshotHasLayers(displayedScene) || depthRayLayers.length > 0;
  const sceneRequiresPanel =
    sceneHasRenderableContent || producedNotices.length > 0;
  const shouldRenderPanel =
    selectedTopics.length > 0 &&
    (sceneRequiresPanel || panelHasCommittedRef.current);

  // This layout effect records that source-backed scene content committed,
  // allowing later source-loading transitions to keep WebGPU mounted.
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
  // reconcile) it. `streamTopics` lets the sidebar frame render this
  // tile's stream-status strip.
  const settingsRegistration = useMemo(
    () => ({
      content: (
        <Mcap3dTileSettings
          cameraInputs={{
            diagnosticsByTopic: calibrationDiagnostics,
            imageTopics: frustumImageTopics,
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
            trajectoryFrameByTopic,
          }}
          selection={{ enabled, setSourcesEnabled, toggleSource }}
          sourceGroups={{
            camera: { sources: cameraSources, topics: cameraTopics },
            mapLayer: { sources: mapLayerSources, topics: mapLayerTopics },
            pointCloud: {
              sources: pointCloudSources,
              topics: pointCloudTopics,
            },
            pose: { sources: poseSources, topics: poseTopics },
            sceneAnnotation: {
              sources: sceneAnnotationSources,
              topics: sceneAnnotationTopics,
            },
          }}
          tileId={tileId ?? null}
          trackingControls={{ mode: trackingMode, setMode: setTrackingMode }}
        />
      ),
      streamTopics: selectedTopics,
    }),
    [
      cameraSources,
      cameraTargetFrameId,
      cameraTopics,
      calibrationDiagnostics,
      frustumImageTopics,
      enabled,
      frameIds,
      mapLayerSources,
      mapLayerTopics,
      pointCloudColorCapabilities,
      pointCloudSources,
      pointCloudTopics,
      poseSources,
      poseTopics,
      sceneAnnotationSources,
      sceneAnnotationTopics,
      selectedPointCloudSources,
      selectedPoseSources,
      selectedTopics,
      setSourcesEnabled,
      setTrackingMode,
      setTrajectoryFrameOverrides,
      tileId,
      toggleSource,
      trackingMode,
      trajectories,
      trajectoryFrameByTopic,
      updateCameraTargetFrameId,
      worldFrameId,
    ],
  );
  useRegisterMcapTileSettings(tileId, settingsRegistration);

  return (
    <>
      {selectedTopics.length === 0 ? (
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
            cameraRig={<Mcap3dCameraRig {...rig} />}
            canvasSurface="modal-3d"
            controls={
              <Mcap3dViewControls
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
            <McapHeldSceneStatusBadge
              reason={sceneSnapshotSelection.heldReason}
            />
          ) : (
            <McapTileStatusBadge topics={selectedTopics} />
          )}
          {hoverTooltip ? <Mcap3dHoverTooltip tooltip={hoverTooltip} /> : null}
        </div>
      ) : (
        <McapTileEmptyState topics={selectedTopics} />
      )}
    </>
  );
};

function msToNs(value: number): bigint {
  return BigInt(Math.max(0, Math.round(value))) * 1_000_000n;
}

function emptyMcap3dSceneSnapshot(
  placementStatus: Mcap3dPlacementStatus,
): Mcap3dSceneSnapshot {
  return {
    annotationLayers: [],
    frustumLayers: [],
    gridLayers: [],
    notices: [],
    placementStatus,
    pointCloudLayers: [],
  };
}

function mcap3dFrameTransformIdentityInputs(
  transform: PointCloudPanelLayer["frameTransform"],
): readonly unknown[] {
  return transform
    ? [
        transform.resolutionKind,
        transform.sourceFrameId,
        transform.targetFrameId,
        transform.translation.x,
        transform.translation.y,
        transform.translation.z,
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w,
      ]
    : [null];
}

const McapHeldSceneStatusBadge: React.FC<{
  readonly reason: Mcap3dHeldSceneReason;
}> = ({ reason }) => (
  <span
    className={styles.statusBadge}
    data-status="loading"
    data-testid="mcap-3d-held-scene-status"
    role="status"
  >
    {reason === "pending" ? "Loading target" : "Waiting for transforms"}
    {" · showing previous scene"}
  </span>
);

export default Mcap3dTile;
