import { useTileId, useTiling } from "@fiftyone/tiling";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CameraCalibrationVisualization,
  EncodedImageVisualization,
  GridVisualization,
  LocationVisualization,
  PointCloudVisualization,
  PoseVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import { imageTextureCacheKey } from "../../../visualization/panels/image-texture-cache";
import {
  PointCloudPanel,
  type PointCloudPanelRenderStats,
  type ThreeSceneBackground,
} from "../../../visualization/panels/point-cloud";
import {
  isMcapLatencyDebugEnabled,
  markMcapLatencyEvent,
} from "../mcap-latency-debug";
import Mcap3dTileSettings from "./Mcap3dTileSettings";
import { build3dLayers } from "./mcap-3d-layers";
import {
  buildMcap3dPlacementNotices,
  buildMcap3dTransformNotices,
  useStabilizedMcapNotices,
  type McapHealthNotice,
} from "./mcap-health";
import {
  getMcap3dViewStateSnapshot,
  nextMcap3dViewStateRestoreOnceKey,
} from "./mcap-3d-view-state";
import { useSetAtom } from "jotai";
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
import { useMcapFrameTransformsContext } from "./mcap-frame-transforms-context";
import { useMcapModalSettings } from "./mcap-modal-settings";
import type { McapTileProps } from "./mcap-tile-types";
import styles from "./McapTile.module.css";
import { McapTileEmptyState, McapTileStatusBadge } from "./McapTileStreamState";
import { locationHudLine, speedHudLine } from "./pose-trajectory";
import {
  cameraPoseDebugDetail,
  useMcap3dCameraTracking,
  type Mcap3dPlacementStatus,
} from "./use-mcap-3d-camera-tracking";
import { useMcap3dFrameSelection } from "./use-mcap-3d-frame-selection";
import { useMcap3dPoseTrajectories } from "./use-mcap-3d-pose-trajectories";
import { useMcap3dViewShortcuts } from "./use-mcap-3d-view-shortcuts";
import {
  playbackFrameForTopic,
  selectProvisionalPointCloudTopic,
  useMcap3dSelection,
} from "./use-mcap-3d-selection";
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
    setCameraSourcesEnabled,
    toggleSource,
  } = useMcap3dSelection({ restore: viewStateRestore });
  const frameTransforms = useMcapFrameTransformsContext();
  const {
    referenceGrid,
    sceneBackground,
    setReferenceGrid,
    setSceneBackground,
    temporalPolicy,
  } = useMcapModalSettings();
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
          }
        : null,
    [referenceGrid],
  );
  const latencyDebugEnabled = useMemo(() => isMcapLatencyDebugEnabled(), []);
  const lastDebugPlacementStateRef = useRef<string | null>(null);
  const frustumImageFrames =
    useMcapTopicPlaybackFrames<EncodedImageVisualization>(frustumImageTopics);
  const frames =
    useMcapTopicPlaybackFrames<PointCloudVisualization>(pointCloudTopics);
  const annotationFrames = useMcapTopicPlaybackFrames<SceneUpdateVisualization>(
    sceneAnnotationTopics,
  );
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
  // Attach each camera's current image to its frustum layer. Done outside
  // build3dLayers so the pure layer builder stays image-agnostic; index
  // alignment with cameraTopics mirrors the playback-frames arrays. The
  // texture key matches the one the 2D image tile forms for the same
  // (recording, image topic, frame), so both surfaces share one decoded
  // texture through the image-texture cache.
  const openImageTile = useOpenMcapImageTile();
  const hoveredImageTopic = useMcapHoveredImageTopic();
  const tileId = useTileId();
  const { focusedTileId } = useTiling();
  const imageTileBindings = useMcapImageTileBindings();
  // The stream shown by the focused (active) tile, if it's an image tile.
  const focusedImageTopic = focusedTileId
    ? (imageTileBindings[focusedTileId] ?? null)
    : null;
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
              highlighted:
                hoveredImageTopic === imageTopic ||
                focusedImageTopic === imageTopic,
              imageTopic,
              onSelect: ({ metaKey }: { readonly metaKey: boolean }) => {
                if (metaKey) {
                  openImageTile(imageTopic);
                }
              },
            }
          : {};
        if (!imageFrame) {
          return { ...layer, ...linked };
        }
        return {
          ...layer,
          ...linked,
          image: imageFrame.frame,
          imageContentTimeNs: imageFrame.contentTimeNs,
          imageTextureKey:
            sourceKey && imageTopic
              ? imageTextureCacheKey(
                  sourceKey,
                  imageTopic,
                  imageFrame.contentTimeNs,
                )
              : undefined,
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
      sourceKey,
    ],
  );
  // Wire the scene annotations into the cross-tile selection: each layer
  // (one entity each) learns whether it's the selected object (or a
  // label-match echo of one) and how to toggle itself selected. Kept out
  // of build3dLayers so the pure layer builder stays selection-agnostic.
  const selectedObject = useMcapSelectedObject();
  const setSelectedObject = useSetAtom(mcapSelectedObjectAtom);
  const {
    containerProps: hoverTooltipContainerProps,
    onHoverEntity,
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
            onHoverEntity(hoveredId ? { entityId, label, topic } : null),
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
    cameraTargetResolution,
    cameraTrackingNotice,
    controlledCameraPose,
    getDisplayedCameraPose,
    handleCameraPoseChange,
    noteRenderedCameraPose,
    panelCameraPose,
    setTrackingMode,
    trackingMode,
  } = useMcap3dCameraTracking({
    cameraTargetFrameId,
    frameTransforms,
    latencyDebugEnabled,
    placementStatus,
    playbackTimeNs,
    provisionalFrameIds,
    provisionalPlaybackFrame,
    restore: viewStateRestore,
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

  const [restoreMarkOnceKey] = useState(() =>
    nextMcap3dViewStateRestoreOnceKey(),
  );
  // This effect emits a latency-debug mark for the carried-over view state
  // fields that restored synchronously at mount. Async restores (user frames,
  // camera pose, tracking anchor) mark themselves as they apply.
  useEffect(() => {
    if (!latencyDebugEnabled) {
      return;
    }

    const fields: string[] = [];
    if (restoredSourceShapeMatches) {
      if (viewStateRestore.enabledSourceIds) {
        fields.push("enabledSources");
      }
      if (
        viewStateRestore.trajectoryFrameOverrides &&
        Object.keys(viewStateRestore.trajectoryFrameOverrides).length > 0
      ) {
        fields.push("trajectoryFrameOverrides");
      }
    }
    if (viewStateRestore.trackingMode !== null) {
      fields.push("trackingMode");
    }
    if (fields.length === 0) {
      return;
    }

    markMcapLatencyEvent(
      "3d view state restored",
      { fields },
      { onceKey: `${restoreMarkOnceKey}:mount` },
    );
  }, [
    latencyDebugEnabled,
    restoredSourceShapeMatches,
    restoreMarkOnceKey,
    viewStateRestore,
  ]);

  const handlePanelRenderStats = useCallback(
    (stats: PointCloudPanelRenderStats) => {
      if (stats.cameraPose) {
        noteRenderedCameraPose(stats.cameraPose);
      }
      if (!latencyDebugEnabled) {
        return;
      }
      const detail = {
        ...stats,
        ...(stats.cameraPose
          ? { cameraPose: cameraPoseDebugDetail(stats.cameraPose) }
          : {}),
        placementStatus,
        provisionalFrameIds,
        transformedLayerCount,
        worldFrameId,
      };
      markMcapLatencyEvent("point cloud panel painted", detail, {
        onceKey: "first-point-cloud-panel-painted",
      });
      if (placementStatus === "provisional") {
        markMcapLatencyEvent("provisional point cloud panel painted", detail, {
          onceKey: "first-provisional-point-cloud-panel-painted",
        });
      }
      if (placementStatus === "transformed") {
        markMcapLatencyEvent("transformed point cloud panel painted", detail, {
          onceKey: "first-transformed-point-cloud-panel-painted",
        });
      }
    },
    [
      latencyDebugEnabled,
      noteRenderedCameraPose,
      placementStatus,
      provisionalFrameIds,
      transformedLayerCount,
      worldFrameId,
    ],
  );

  useEffect(() => {
    if (
      !latencyDebugEnabled ||
      (pointCloudLayers.length === 0 &&
        sceneAnnotationLayers.length === 0 &&
        gridLayers.length === 0 &&
        cameraFrustumLayers.length === 0)
    ) {
      return;
    }

    const detail = {
      annotationLayers: sceneAnnotationLayers.length,
      frustumLayers: cameraFrustumLayers.length,
      gridLayers: gridLayers.length,
      layers:
        pointCloudLayers.length +
        sceneAnnotationLayers.length +
        gridLayers.length +
        cameraFrustumLayers.length,
      placementStatus,
      pointCount: pointCountForLayers(pointCloudLayers),
      pendingAnnotationFrameIds,
      pendingFrustumFrameIds,
      pendingGridFrameIds,
      provisionalFrameIds,
      transformStatus: frameTransforms.status,
      transformedLayerCount,
      worldFrameId,
    };
    markMcapLatencyEvent("3d layers ready", detail, {
      onceKey: "first-3d-layers-ready",
    });
    if (placementStatus === "provisional") {
      markMcapLatencyEvent("provisional 3d layers ready", detail, {
        onceKey: "first-provisional-3d-layers-ready",
      });
    }
    if (placementStatus === "transformed") {
      markMcapLatencyEvent("transformed 3d layers ready", detail, {
        onceKey: "first-transformed-3d-layers-ready",
      });
    }
  }, [
    cameraFrustumLayers.length,
    frameTransforms.status,
    gridLayers.length,
    latencyDebugEnabled,
    placementStatus,
    pendingAnnotationFrameIds,
    pendingFrustumFrameIds,
    pendingGridFrameIds,
    pointCloudLayers,
    provisionalFrameIds,
    sceneAnnotationLayers,
    transformedLayerCount,
    worldFrameId,
  ]);

  useEffect(() => {
    if (
      !latencyDebugEnabled ||
      (pointCloudLayers.length === 0 &&
        sceneAnnotationLayers.length === 0 &&
        gridLayers.length === 0 &&
        cameraFrustumLayers.length === 0)
    ) {
      return;
    }

    const debugStateKey = [
      placementStatus,
      pointCloudLayers.length,
      sceneAnnotationLayers.length,
      gridLayers.length,
      cameraFrustumLayers.length,
      transformedLayerCount,
      pendingAnnotationFrameIds.join(","),
      pendingFrustumFrameIds.join(","),
      pendingGridFrameIds.join(","),
      provisionalFrameIds.join(","),
      unresolvedFrameIds.join(","),
      worldFrameId,
      frameTransforms.status,
      frameTransforms.frameIds.length,
      cameraTargetFrameId,
      cameraTargetResolution.status,
      trackingMode,
      controlledCameraPose ? "controlled" : "uncontrolled",
    ].join("|");
    if (debugStateKey === lastDebugPlacementStateRef.current) {
      return;
    }
    lastDebugPlacementStateRef.current = debugStateKey;

    markMcapLatencyEvent("3d placement state changed", {
      cameraTargetFrameId,
      cameraTargetStatus: cameraTargetResolution.status,
      controlledCamera: controlledCameraPose !== null,
      frameIds: frameIds.length,
      annotationLayers: sceneAnnotationLayers.length,
      frustumLayers: cameraFrustumLayers.length,
      gridLayers: gridLayers.length,
      layers:
        pointCloudLayers.length +
        sceneAnnotationLayers.length +
        gridLayers.length +
        cameraFrustumLayers.length,
      placementStatus,
      pendingAnnotationFrameIds,
      pendingFrustumFrameIds,
      pendingGridFrameIds,
      pointCount: pointCountForLayers(pointCloudLayers),
      provisionalFrameIds,
      transformFrameIds: frameTransforms.frameIds.length,
      transformStatus: frameTransforms.status,
      transformedLayerCount,
      unresolvedFrameIds,
      worldFrameId,
      trackingMode,
    });
  }, [
    cameraFrustumLayers.length,
    cameraTargetFrameId,
    cameraTargetResolution.status,
    controlledCameraPose,
    frameIds.length,
    frameTransforms.frameIds.length,
    frameTransforms.status,
    gridLayers.length,
    latencyDebugEnabled,
    pendingAnnotationFrameIds,
    pendingFrustumFrameIds,
    pendingGridFrameIds,
    placementStatus,
    pointCloudLayers,
    provisionalFrameIds,
    sceneAnnotationLayers,
    trackingMode,
    transformedLayerCount,
    unresolvedFrameIds,
    worldFrameId,
  ]);

  return (
    <>
      <Mcap3dTileSettings
        cameraSources={cameraSources}
        cameraTargetFrameId={cameraTargetFrameId}
        cameraTopics={cameraTopics}
        enabled={enabled}
        frameIds={frameIds}
        mapLayerSources={mapLayerSources}
        mapLayerTopics={mapLayerTopics}
        pointCloudSources={pointCloudSources}
        pointCloudTopics={pointCloudTopics}
        poseSources={poseSources}
        poseTopics={poseTopics}
        referenceGrid={referenceGrid}
        sceneAnnotationSources={sceneAnnotationSources}
        sceneAnnotationTopics={sceneAnnotationTopics}
        sceneBackground={sceneBackground}
        selectedPoseSources={selectedPoseSources}
        setCameraSourcesEnabled={setCameraSourcesEnabled}
        setReferenceGrid={setReferenceGrid}
        setSceneBackground={setSceneBackground}
        setTrackingMode={setTrackingMode}
        setTrajectoryFrameOverrides={setTrajectoryFrameOverrides}
        toggleSource={toggleSource}
        trackingMode={trackingMode}
        trajectories={trajectories}
        trajectoryFrameByTopic={trajectoryFrameByTopic}
        updateCameraTargetFrameId={updateCameraTargetFrameId}
        updateWorldFrameId={updateWorldFrameId}
        worldFrameId={worldFrameId}
      />
      {selectedTopics.length === 0 ? (
        <div className={styles.loading}>
          <span className={styles.emptyText}>No sources selected</span>
        </div>
      ) : // Gate on the UNSTABILIZED notices: a live notice condition must keep
      // the panel (and its GL canvas) mounted even while the stabilizer's
      // appearance floor still hides it from the chip — otherwise short
      // transform dropouts would flash the empty state and churn the canvas.
      pointCloudLayers.length > 0 ||
        sceneAnnotationLayers.length > 0 ||
        gridLayers.length > 0 ||
        cameraFrustumLayers.length > 0 ||
        producedNotices.length > 0 ? (
        <div className={styles.panelStack} {...hoverTooltipContainerProps}>
          <PointCloudPanel
            annotationLayers={annotationLayers}
            background={panelBackground}
            cameraPose={panelCameraPose}
            canvasSurface="modal-3d"
            fitResetKey={worldFrameId}
            frustumLayers={frustumLayers}
            hudLines={hudLines}
            gridLayers={gridLayers}
            layers={pointCloudLayers}
            className={styles.panel}
            notices={panelNotices}
            onCameraPoseChange={handleCameraPoseChange}
            onRenderStats={handlePanelRenderStats}
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

function pointCountForLayers(
  layers: readonly {
    readonly frame: {
      readonly pointCount: number;
    };
  }[],
): number {
  return layers.reduce((sum, layer) => sum + layer.frame.pointCount, 0);
}

function msToNs(value: number): bigint {
  return BigInt(Math.max(0, Math.round(value))) * 1_000_000n;
}

export default Mcap3dTile;
