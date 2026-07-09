import { useTileId, useTiling } from "@fiftyone/tiling";
import { useSeekEvent } from "@fiftyone/playback/src/lib/playback/use-playback-state";
import React, {
  type SetStateAction,
  useCallback,
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
import {
  type CameraFrustumPanelLayer,
  type GridPanelLayer,
  PointCloudPanel,
  type PointCloudPanelLayer,
  type PointCloudPanelRenderStats,
  type PointCloudPointPick,
  type SceneAnnotationPanelLayer,
  type ThreeSceneBackground,
} from "../../../visualization/panels/point-cloud";
import Mcap3dTileSettings from "./Mcap3dTileSettings";
import { build3dLayers } from "./mcap-3d-layers";
import { useMcap3dViewSettings } from "./mcap-3d-view-settings-context";
import {
  buildMcap3dPlacementNotices,
  buildMcap3dTransformNotices,
  useStabilizedMcapNotices,
  type McapHealthNotice,
} from "./mcap-health";
import { getMcap3dViewStateSnapshot } from "./mcap-3d-view-state";
import { type PrimitiveAtom, useStore } from "jotai";
import { useMcapDataStream } from "./mcap-data-stream-context";
import {
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
import { mcapHoverEchoAtom, useMcapHoverEcho } from "./mcap-hover-echo";
import { useMcapFrameTransformsContext } from "./mcap-frame-transforms-context";
import {
  defaultMcapPointCloudColorForSource,
  useMcapPinholeCameraSettings,
  useMcapPlaybackSettings,
  useMcapPointCloudStyleSettings,
  useMcapReferenceGridSettings,
  useMcapSceneBackgroundSettings,
  useMcapTemporalPolicySettings,
} from "./mcap-modal-settings";
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
  // The previous mount's view state, read once before any write-through can
  // overwrite it. The tile remounts per sample, so this snapshot is exactly
  // the state the user left the previous sample's 3D tile in.
  const [viewStateRestore] = useState(() => getMcap3dViewStateSnapshot());
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
    restoredSourceShapeMatches,
    sceneAnnotationSources,
    sceneAnnotationTopics,
    selectedPointCloudSources,
    selectedPoseSources,
    selectedTopics,
    selectedTopicsKey,
    setSourcesEnabled,
    toggleSource,
  } = useMcap3dSelection({ restore: viewStateRestore });
  const frameTransforms = useMcapFrameTransformsContext();
  const { fidelityMode } = useMcapPlaybackSettings();
  const { temporalPolicy } = useMcapTemporalPolicySettings();
  const { pinholeCamera } = useMcapPinholeCameraSettings();
  const { pointCloudColors, pointCloudPointSize, showPointCloudColorLegend } =
    useMcapPointCloudStyleSettings();
  const { referenceGrid } = useMcapReferenceGridSettings();
  const { sceneBackground } = useMcapSceneBackgroundSettings();
  const { sceneUpAxis, setSceneUpAxis } = useMcap3dViewSettings();
  const tileId = useTileId();
  const { focusedTileId } = useTiling();
  const seekEvent = useSeekEvent();
  const sceneSnapshotRef = useRef<HeldMcap3dSceneSnapshot | null>(null);
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
  const poseFrames = useMcapTopicPlaybackFrames<PoseVisualization>(poseTopics);
  const locationFrames =
    useMcapTopicPlaybackFrames<LocationVisualization>(locationTopics);
  const playbackTimeNs = useMcapPlaybackTimeNs();
  const {
    cameraTargetFrameId,
    frameIds,
    updateCameraTargetFrameId,
    updateWorldFrameId,
    worldFrameId,
  } = useMcap3dFrameSelection({
    annotationFrames,
    calibrationFrames,
    frames,
    frameTransforms,
    gridFrames,
    restore: viewStateRestore,
  });

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
  const sourceKey = useMcapDataStream()?.sourceKey ?? "";
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
  // layer builder stays color-agnostic; layer id = topic.
  const coloredPointCloudLayers = useMemo(
    () =>
      pointCloudLayers.map((layer) => {
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
      }),
    [
      pointCloudColors,
      pointCloudLayers,
      pointCloudSourceById,
      pointCloudSources,
    ],
  );
  // Attach each camera's current image to its frustum layer. Done outside
  // build3dLayers so the pure layer builder stays image-agnostic; index
  // alignment with cameraTopics mirrors the playback-frames arrays. The
  // texture key matches the one the 2D image tile forms for the same
  // (recording, image topic, frame), so both surfaces share one decoded
  // texture through the image-texture cache.
  const openImageTile = useOpenMcapImageTile();
  const hoveredImageTopic = useMcapHoveredImageTopic();
  const imageTileBindings = useMcapImageTileBindings();
  // The stream shown by the focused (active) tile, if it's an image tile.
  const focusedImageTopic = focusedTileId
    ? (imageTileBindings[focusedTileId] ?? null)
    : null;
  const pinholeImagePlaneDepthM = pinholeCamera.imagePlaneDepthM;
  const pinholeOpacity = pinholeCamera.opacityPercent / 100;
  const frustumLayers = useMemo(
    () =>
      cameraFrustumLayers.map((layer) => {
        const index = cameraTopics.indexOf(layer.id);
        const imageFrame = index >= 0 ? frustumImageFrames[index] : null;
        const imageTopic = index >= 0 ? (frustumImageTopics[index] ?? "") : "";
        // Frustum ↔ tile link: Cmd-clicking the frustum opens/focuses its
        // camera's tile; hovering that tile lights the frustum up.
        const linked = imageTopic
          ? {
              highlighted: hoveredImageTopic === imageTopic,
              selected: focusedImageTopic === imageTopic,
              imageTopic,
              onSelect: ({ metaKey }: { readonly metaKey: boolean }) => {
                if (metaKey) {
                  openImageTile(imageTopic);
                }
              },
            }
          : {};
        if (!imageFrame) {
          return {
            ...layer,
            ...linked,
            imagePlaneDepthM: pinholeImagePlaneDepthM,
            opacity: pinholeOpacity,
          };
        }
        return {
          ...layer,
          ...linked,
          image: imageFrame.frame,
          imageContentTimeNs: imageFrame.contentTimeNs,
          imagePlaneDepthM: pinholeImagePlaneDepthM,
          imageTextureKey:
            sourceKey && imageTopic
              ? imageTextureCacheKey(
                  sourceKey,
                  imageTopic,
                  imageFrame.contentTimeNs,
                )
              : undefined,
          opacity: pinholeOpacity,
        };
      }),
    [
      cameraFrustumLayers,
      cameraTopics,
      frustumImageFrames,
      focusedImageTopic,
      frustumImageTopics,
      hoveredImageTopic,
      openImageTile,
      pinholeImagePlaneDepthM,
      pinholeOpacity,
      sourceKey,
    ],
  );
  // Wire the scene annotations into the cross-tile selection: each layer
  // (one entity each) learns whether it's the selected object (or a
  // label-match echo of one) and how to toggle itself selected. Kept out
  // of build3dLayers so the pure layer builder stays selection-agnostic.
  const selectedObject = useMcapSelectedObject();
  const jotaiStore = useStore();
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
  const {
    containerProps: hoverTooltipContainerProps,
    onHoverEntity,
    onHoverPoint,
    tooltip: hoverTooltip,
  } = useMcap3dHoverTooltip();
  const annotationLayers = useMemo(
    () =>
      sceneAnnotationLayers.map((layer) => {
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
      }),
    [onHoverEntity, sceneAnnotationLayers, selectedObject, setSelectedObject],
  );
  // Wire the point clouds into the hover tooltip: once the pointer rests
  // over a bare point (entities and frustums keep picking precedence),
  // that point's decoded fields show in a tooltip at the cursor, the
  // point itself gets in-scene emphasis, and the modal-wide hover-echo
  // atom carries the point to every other pane displaying it — including
  // hovers that originate in a 2D projection overlay, which light up the
  // point here. The payload closes over the exact frame being displayed.
  const hoverEcho = useMcapHoverEcho();
  const hoverablePointCloudLayers = useMemo(
    () =>
      coloredPointCloudLayers.map((layer) => {
        const topic = layer.id;
        const frame = layer.frame;
        return {
          ...layer,
          hoveredPoint:
            hoverEcho?.kind === "point" && hoverEcho.topic === topic
              ? { color: hoverEcho.color, position: hoverEcho.position }
              : null,
          onHoverPoint: (pick: PointCloudPointPick | null) => {
            const payload = pick
              ? mcapHoveredPointForFrame(topic, frame, pick.pointIndex)
              : null;
            onHoverPoint(payload);
            jotaiStore.set(
              mcapHoverEchoAtom,
              payload && pick
                ? {
                    color: pick.color,
                    kind: "point",
                    pointIndex: payload.pointIndex,
                    position: payload.position,
                    topic,
                  }
                : null,
            );
          },
        };
      }),
    [coloredPointCloudLayers, hoverEcho, jotaiStore, onHoverPoint],
  );
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
    panelCameraPose,
    setTrackingMode,
    trackingMode,
  } = useMcap3dCameraTracking({
    cameraTargetFrameId,
    frameTransforms,
    placementStatus,
    playbackTimeNs,
    provisionalFrameIds,
    provisionalPlaybackFrame,
    restore: viewStateRestore,
    sceneUpAxis,
    selectedTopicsKey,
    worldFrameId,
  });
  useMcap3dViewShortcuts({
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
      ...(cameraTrackingNotice ? [cameraTrackingNotice] : []),
    ],
    [cameraTrackingNotice, placementNotices, transformNotices],
  );
  // Scene-scoped notices are stabilized before reaching the panel:
  // per-tick condition flips around transform boundaries must not blink
  // the chip, and the returned identity is stable while content holds.
  const panelNotices = useStabilizedMcapNotices(producedNotices);
  const sceneSnapshotKey = useMemo(
    () =>
      JSON.stringify([
        sourceKey,
        selectedTopicsKey,
        worldFrameId,
        fidelityMode,
        seekEvent?.seq ?? 0,
      ]),
    [fidelityMode, seekEvent?.seq, selectedTopicsKey, sourceKey, worldFrameId],
  );
  const currentSceneSnapshot = useMemo<Mcap3dSceneSnapshot>(
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
  const sceneSnapshotSelection = selectMcap3dSceneSnapshot({
    current: currentSceneSnapshot,
    held: sceneSnapshotRef.current,
    key: sceneSnapshotKey,
    shouldCommit:
      placementReadiness.status === "ready" ||
      placementReadiness.status === "definitiveMissing",
  });
  sceneSnapshotRef.current = sceneSnapshotSelection.nextHeld;
  const displayedScene = sceneSnapshotSelection.snapshot;

  const handlePanelRenderStats = useCallback(
    (stats: PointCloudPanelRenderStats) => {
      if (stats.cameraPose) {
        noteRenderedCameraPose(stats.cameraPose);
      }
    },
    [noteRenderedCameraPose],
  );

  return (
    <>
      <Mcap3dTileSettings
        frameControls={{
          cameraTargetFrameId,
          frameIds,
          updateCameraTargetFrameId,
          updateWorldFrameId,
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
        sceneControls={{
          sceneUpAxis,
          setSceneUpAxis,
        }}
        selection={{
          enabled,
          setSourcesEnabled,
          toggleSource,
        }}
        sourceGroups={{
          camera: { sources: cameraSources, topics: cameraTopics },
          mapLayer: { sources: mapLayerSources, topics: mapLayerTopics },
          pointCloud: { sources: pointCloudSources, topics: pointCloudTopics },
          pose: { sources: poseSources, topics: poseTopics },
          sceneAnnotation: {
            sources: sceneAnnotationSources,
            topics: sceneAnnotationTopics,
          },
        }}
        trackingControls={{
          mode: trackingMode,
          setMode: setTrackingMode,
        }}
      />
      {selectedTopics.length === 0 ? (
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
        producedNotices.length > 0 ? (
        <div className={styles.panelStack} {...hoverTooltipContainerProps}>
          <PointCloudPanel
            annotationLayers={displayedScene.annotationLayers}
            background={panelBackground}
            cameraPose={panelCameraPose}
            canvasSurface="modal-3d"
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
            sceneUp={sceneUpAxis}
            showColorLegend={showPointCloudColorLegend}
            worldGrid={worldGrid}
          />
          <McapTileStatusBadge topics={selectedTopics} />
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

interface Mcap3dSceneSnapshot {
  readonly annotationLayers: readonly SceneAnnotationPanelLayer[];
  readonly frustumLayers: readonly CameraFrustumPanelLayer[];
  readonly gridLayers: readonly GridPanelLayer[];
  readonly notices: readonly McapHealthNotice[];
  readonly placementStatus: Mcap3dPlacementStatus;
  readonly pointCloudLayers: readonly PointCloudPanelLayer[];
}

interface HeldMcap3dSceneSnapshot {
  readonly key: string;
  readonly snapshot: Mcap3dSceneSnapshot;
}

function selectMcap3dSceneSnapshot({
  current,
  held,
  key,
  shouldCommit,
}: {
  readonly current: Mcap3dSceneSnapshot;
  readonly held: HeldMcap3dSceneSnapshot | null;
  readonly key: string;
  readonly shouldCommit: boolean;
}): {
  readonly nextHeld: HeldMcap3dSceneSnapshot | null;
  readonly snapshot: Mcap3dSceneSnapshot;
} {
  if (shouldCommit) {
    return {
      nextHeld: { key, snapshot: current },
      snapshot: current,
    };
  }
  if (held?.key === key) {
    return {
      nextHeld: held,
      snapshot: held.snapshot,
    };
  }
  return {
    nextHeld: null,
    snapshot: emptyMcap3dSceneSnapshot(current.placementStatus),
  };
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

export default Mcap3dTile;
