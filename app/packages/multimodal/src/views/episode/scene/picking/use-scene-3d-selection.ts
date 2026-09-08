import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PointCloudVisualization } from "../../../../ir/index";
import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  type SceneSource,
} from "../../../../ir/index";
import { useSceneInventory } from "../../../../scene-inventory/react/index";
import { filterDefaultStreamEquivalents } from "../../../../stream-selection/index";
import {
  resolveScene3dSelectionRestore,
  type Scene3dViewStateStore,
  type Scene3dViewStateSnapshot,
} from "../camera/scene-3d-view-state";
import { useScene3dViewStateStore } from "../camera/scene-3d-view-state-context";
import {
  readScene3dTileVisibility,
  usePanelVisibilityScope,
  writeScene3dTrajectoryFrameOverrides,
  writeScene3dTileVisibility,
  type Scene3dTileVisibility,
} from "../../tiles/panel-visibility";
import {
  createSemanticSourceIndex,
  resolveSemanticSourceKeys,
  semanticSourceKey,
  semanticSourceKeysForRuntimeIds,
  type SemanticSourceKey,
} from "../../settings/semantic-source";
import { useImageProjectionSettingsByStream } from "../../settings/modal/state";
import { useImageTileBindings } from "../../tiles/tile-source-bindings";
import type { StreamContentFrame } from "../../playback/use-stream-values";

const TILE_TYPE_LABEL = "3D";
const PROVISIONAL_STREAM_KEYWORDS: readonly {
  readonly score: number;
  readonly value: string;
}[] = [
  { score: 90, value: "lidar_top" },
  { score: 90, value: "top_lidar" },
  { score: 70, value: "lidar" },
  { score: 60, value: "velodyne" },
  { score: 60, value: "ouster" },
  { score: 60, value: "hesai" },
  { score: 60, value: "pandar" },
  { score: 60, value: "robosense" },
  { score: 60, value: "rslidar" },
  { score: 60, value: "livox" },
  { score: 55, value: "luminar" },
  { score: 55, value: "innoviz" },
  { score: 55, value: "cepton" },
  { score: 35, value: "point_cloud" },
  { score: 35, value: "pointcloud" },
  { score: 25, value: "/points" },
  { score: 20, value: "points" },
];
const PROVISIONAL_STREAM_PENALTIES: readonly {
  readonly score: number;
  readonly value: string;
}[] = [{ score: -50, value: "radar" }];

interface Scene3dSelectionState {
  readonly cameraSelectionCustomized: boolean;
  readonly customized: boolean;
  readonly enabledSourceKeys: ReadonlySet<SemanticSourceKey>;
  readonly primarySourceKey: SemanticSourceKey | null;
}

interface CameraImageAssociations {
  readonly imageStreamByCalibrationStream: ReadonlyMap<string, string>;
  readonly openCalibrationStreams: ReadonlySet<string>;
}

/**
 * Source selection state for the 3D tile: which 3D-renderable sources are
 * enabled, the stream arrays derived from that set, the calibration↔image
 * pairing that feeds camera frustum image planes, and the tile-title sync.
 * Durable state is scoped to the calling tile. A fresh tile starts with one
 * ranked primary geometry plus textured cameras represented by open image
 * panes; labels, maps, poses, and secondary clouds remain cold until the user
 * enables them.
 */
export function useScene3dSelection({
  restore = null,
  sourceKey,
  viewStateStore: suppliedViewStateStore,
}: {
  readonly restore?: Scene3dViewStateSnapshot | null;
  readonly sourceKey: string;
  readonly viewStateStore?: Scene3dViewStateStore;
}) {
  const viewStateStore = useScene3dViewStateStore(suppliedViewStateStore);
  const tileId = useTileId();
  const visibilityScope = usePanelVisibilityScope();
  const imageTileBindings = useImageTileBindings();
  const sources = useSceneInventory();
  const sourceIndex = useMemo(
    () => createSemanticSourceIndex(sources),
    [sources],
  );
  const imageProjectionSettings = useImageProjectionSettingsByStream();
  const renderableSources = useMemo(
    () => sources.filter(is3dRenderableSource),
    [sources],
  );
  const pointCloudSources = useMemo(
    () => renderableSources.filter(isPointCloudSource),
    [renderableSources],
  );
  const mapLayerSources = useMemo(
    () => renderableSources.filter(isMapLayerSource),
    [renderableSources],
  );
  const cameraCalibrationSources = useMemo(
    () => renderableSources.filter(isCameraCalibrationSource),
    [renderableSources],
  );
  const cameraCalibrationSourceKeys = useMemo(
    () =>
      new Set(
        cameraCalibrationSources.map((source) => semanticSourceKey(source)),
      ),
    [cameraCalibrationSources],
  );
  const poseSources = useMemo(
    () => renderableSources.filter(isPoseSource),
    [renderableSources],
  );
  const sceneAnnotationSources = useMemo(
    () => renderableSources.filter(isSceneAnnotationSource),
    [renderableSources],
  );
  const imageSources = useMemo(
    () => sources.filter((source) => source.type === SCENE_SOURCE_TYPE.IMAGE),
    [sources],
  );
  const defaultImageSources = useMemo(
    () =>
      filterDefaultStreamEquivalents(imageSources, {
        getKind: (source) => source.type,
        getSourceName: (source) => source.sourceName,
      }),
    [imageSources],
  );
  const cameraAssociations = useMemo(
    () =>
      buildCameraImageAssociations({
        cameraSources: cameraCalibrationSources,
        defaultImageSources,
        imageProjectionSettings,
        imageSources,
        imageTileBindings,
      }),
    [
      cameraCalibrationSources,
      defaultImageSources,
      imageProjectionSettings,
      imageSources,
      imageTileBindings,
    ],
  );
  const cameraSources = useMemo(
    () =>
      cameraCalibrationSources.filter((source) =>
        cameraAssociations.imageStreamByCalibrationStream.has(source.id),
      ),
    [cameraAssociations, cameraCalibrationSources],
  );
  const selectableRenderableSources = useMemo(
    () =>
      renderableSources.filter(
        (source) =>
          !isCameraCalibrationSource(source) ||
          cameraAssociations.imageStreamByCalibrationStream.has(source.id),
      ),
    [cameraAssociations, renderableSources],
  );
  const selectableRenderableSourceIds = useMemo(
    () => selectableRenderableSources.map((source) => source.id),
    [selectableRenderableSources],
  );
  const selectableRenderableSourceKeys = useMemo(
    () => [...new Set(selectableRenderableSources.map(semanticSourceKey))],
    [selectableRenderableSources],
  );
  const defaultRenderableSources = useMemo(
    () =>
      filterDefaultStreamEquivalents(selectableRenderableSources, {
        getKind: (source) => source.type,
        getSourceName: (source) => source.sourceName,
      }),
    [selectableRenderableSources],
  );
  const setTileTitle = useSetTileTitle();
  const persistedVisibility = useMemo(
    () => readScene3dTileVisibility(visibilityScope, tileId ?? null),
    [tileId, visibilityScope],
  );
  // Carried-over selection state from the previous sample, resolved once at
  // mount: it applies only when the new sample's renderable source ids
  // exactly match the shape the snapshot was captured against.
  const [selectionRestore] = useState(() =>
    resolveScene3dSelectionRestore(restore, selectableRenderableSourceIds),
  );
  const [selection, setSelection] = useState<Scene3dSelectionState>(() => {
    const persisted = persistedVisibility;
    if (persisted) {
      return reconcilePersistedSelection(persisted);
    }
    if (selectionRestore.enabledSourceIds) {
      return selectionFromEnabledIds(
        selectionRestore.enabledSourceIds,
        selectableRenderableSources,
      );
    }
    return default3dSelection(
      defaultRenderableSources,
      cameraAssociations.openCalibrationStreams,
    );
  });
  const {
    cameraSelectionCustomized,
    customized,
    enabledSourceKeys,
    primarySourceKey,
  } = selection;
  const enabled = useMemo(
    () =>
      new Set(resolveSemanticSourceKeys([...enabledSourceKeys], sourceIndex)),
    [enabledSourceKeys, sourceIndex],
  );
  const primarySourceId = useMemo(
    () =>
      primarySourceKey
        ? (selectableRenderableSources.find(
            (source) => semanticSourceKey(source) === primarySourceKey,
          )?.id ?? null)
        : null,
    [primarySourceKey, selectableRenderableSources],
  );

  // This effect writes panel-local visibility to durable storage before a
  // later modal open can recreate stream demand.
  useEffect(() => {
    if (!customized && !cameraSelectionCustomized) return;
    writeScene3dTileVisibility(visibilityScope, tileId ?? null, {
      cameraSelectionCustomized,
      enabledSourceKeys: [...enabledSourceKeys],
      primarySourceKey,
    });
  }, [
    cameraSelectionCustomized,
    customized,
    enabledSourceKeys,
    primarySourceKey,
    tileId,
    visibilityScope,
  ]);

  // This effect retains the memory bridge for navigation compatibility while
  // durable per-tile visibility remains the source of truth. During modal
  // navigation the next inventory can arrive before its data stream is bound;
  // keep the outgoing source shape until the non-empty source key commits the
  // next camera epoch.
  useEffect(() => {
    if (!sourceKey) return;
    viewStateStore.recordSourceSelection({
      enabledSourceIds: [...enabled],
      renderableSourceIds: selectableRenderableSourceIds,
      renderableSourceKeys: selectableRenderableSourceKeys,
    });
  }, [
    enabled,
    selectableRenderableSourceIds,
    selectableRenderableSourceKeys,
    sourceKey,
    viewStateStore,
  ]);

  // This effect keeps automatic camera defaults aligned with the image panes
  // currently open. Only a camera edit freezes that selection; unrelated 3D
  // source edits continue to release textures for image panes that close.
  useEffect(() => {
    setSelection((current) => {
      if (current.cameraSelectionCustomized) return current;
      const defaults = default3dSelection(
        defaultRenderableSources,
        cameraAssociations.openCalibrationStreams,
      );
      const nextEnabled = new Set(
        [...current.enabledSourceKeys].filter(
          (key) => !cameraCalibrationSourceKeys.has(key),
        ),
      );
      for (const key of defaults.enabledSourceKeys) {
        if (cameraCalibrationSourceKeys.has(key)) nextEnabled.add(key);
      }
      return sameStringSet(nextEnabled, current.enabledSourceKeys)
        ? current
        : { ...current, enabledSourceKeys: nextEnabled };
    });
  }, [
    cameraAssociations.openCalibrationStreams,
    cameraCalibrationSourceKeys,
    defaultRenderableSources,
  ]);

  // Before any user customization, a temporarily missing automatic primary
  // may use the best available fallback. Customized semantic intent remains
  // latent instead and is never rewritten by inventory churn.
  useEffect(() => {
    const currentKeys = new Set(
      selectableRenderableSources.map(semanticSourceKey),
    );
    setSelection((current) => {
      if (current.customized) return current;
      const primaryAvailable =
        !current.primarySourceKey || currentKeys.has(current.primarySourceKey);
      if (primaryAvailable) return current;
      const replacement = defaultPrimarySource(defaultRenderableSources);
      const replacementKey = replacement
        ? semanticSourceKey(replacement)
        : null;
      const nextEnabled = new Set(current.enabledSourceKeys);
      nextEnabled.delete(current.primarySourceKey);
      if (replacementKey) nextEnabled.add(replacementKey);
      return {
        ...current,
        enabledSourceKeys: nextEnabled,
        primarySourceKey: replacementKey,
      };
    });
  }, [defaultRenderableSources, selectableRenderableSources]);

  // Prefer LiDAR-like point clouds first for initial fetch/paint. SceneUpdate
  // sources remain schema-driven labels and do not affect the provisional cloud
  // choice.
  const selectedPointCloudSources = useMemo(
    () =>
      sortPointCloudSourcesForInitialPaint(
        pointCloudSources.filter((s) => enabled.has(s.id)),
      ),
    [pointCloudSources, enabled],
  );
  const selectedSceneAnnotationSources = useMemo(
    () => sceneAnnotationSources.filter((s) => enabled.has(s.id)),
    [sceneAnnotationSources, enabled],
  );
  const selectedMapLayerSources = useMemo(
    () => mapLayerSources.filter((s) => enabled.has(s.id)),
    [mapLayerSources, enabled],
  );
  const selectedCameraSources = useMemo(
    () => cameraSources.filter((s) => enabled.has(s.id)),
    [cameraSources, enabled],
  );
  const pointCloudStreams = useMemo(
    () => selectedPointCloudSources.map((s) => s.id),
    [selectedPointCloudSources],
  );
  const sceneAnnotationStreams = useMemo(
    () => selectedSceneAnnotationSources.map((s) => s.id),
    [selectedSceneAnnotationSources],
  );
  const mapLayerStreams = useMemo(
    () => selectedMapLayerSources.map((s) => s.id),
    [selectedMapLayerSources],
  );
  const cameraStreams = useMemo(
    () => selectedCameraSources.map((s) => s.id),
    [selectedCameraSources],
  );
  const selectedPoseSources = useMemo(
    () => poseSources.filter((s) => enabled.has(s.id)),
    [poseSources, enabled],
  );
  const poseStreams = useMemo(
    () => selectedPoseSources.map((s) => s.id),
    [selectedPoseSources],
  );
  const frustumImageStreams = useMemo(
    () =>
      cameraStreams.map(
        (stream) =>
          cameraAssociations.imageStreamByCalibrationStream.get(stream) ?? "",
      ),
    [cameraAssociations, cameraStreams],
  );
  const selectedStreams = useMemo(
    () => [
      ...pointCloudStreams,
      ...mapLayerStreams,
      ...cameraStreams,
      ...poseStreams,
      ...sceneAnnotationStreams,
    ],
    [
      cameraStreams,
      mapLayerStreams,
      pointCloudStreams,
      poseStreams,
      sceneAnnotationStreams,
    ],
  );
  const selectedStreamsKey = useMemo(
    () => selectedStreams.join("\0"),
    [selectedStreams],
  );
  // Location fixes are pure telemetry (no checkbox, no scene content): the
  // first LocationFix stream in the inventory feeds the HUD readout.
  const locationStreams = useMemo(() => {
    const first = sources.find((s) => s.type === SCENE_SOURCE_TYPE.LOCATION);
    return first ? [first.id] : [];
  }, [sources]);

  // This effect syncs the tile title with the current 3D source selection.
  useEffect(() => {
    const label =
      selectedStreams.length === 1
        ? selectableRenderableSources.find((s) => s.id === selectedStreams[0])
            ?.label
        : null;
    setTileTitle(label ?? TILE_TYPE_LABEL, { source: "auto" });
  }, [selectedStreams, selectableRenderableSources, setTileTitle]);

  const toggleSource = useCallback(
    (id: string, checked: boolean) => {
      const key = sourceIndex.keyByRuntimeId.get(id);
      if (!key) return;
      setSelection((current) => {
        const nextEnabled = new Set(current.enabledSourceKeys);
        if (checked) {
          nextEnabled.add(key);
        } else {
          nextEnabled.delete(key);
        }
        const primarySourceKey = nextPrimarySourceKey(
          current.primarySourceKey,
          nextEnabled,
          selectableRenderableSources,
          checked ? key : null,
        );
        if (
          primarySourceKey === current.primarySourceKey &&
          sameStringSet(nextEnabled, current.enabledSourceKeys)
        ) {
          return current;
        }
        return {
          cameraSelectionCustomized:
            current.cameraSelectionCustomized ||
            cameraCalibrationSourceKeys.has(key),
          customized: true,
          enabledSourceKeys: nextEnabled,
          primarySourceKey,
        };
      });
    },
    [cameraCalibrationSourceKeys, selectableRenderableSources, sourceIndex],
  );

  const setSourcesEnabled = useCallback(
    (ids: readonly string[], checked: boolean) => {
      const keys = semanticSourceKeysForRuntimeIds(ids, sourceIndex);
      setSelection((current) => {
        const nextEnabled = new Set(current.enabledSourceKeys);
        let changed = false;
        for (const key of keys) {
          if (checked) {
            if (!nextEnabled.has(key)) {
              nextEnabled.add(key);
              changed = true;
            }
          } else if (nextEnabled.delete(key)) {
            changed = true;
          }
        }
        if (!changed) return current;
        return {
          cameraSelectionCustomized:
            current.cameraSelectionCustomized ||
            keys.some((key) => cameraCalibrationSourceKeys.has(key)),
          customized: true,
          enabledSourceKeys: nextEnabled,
          primarySourceKey: nextPrimarySourceKey(
            current.primarySourceKey,
            nextEnabled,
            selectableRenderableSources,
            checked ? (keys[0] ?? null) : null,
          ),
        };
      });
    },
    [cameraCalibrationSourceKeys, selectableRenderableSources, sourceIndex],
  );
  const restoredTrajectoryFrameOverrides = useMemo(() => {
    const restored: Record<string, string> = {};
    for (const [key, frameId] of Object.entries(
      persistedVisibility?.trajectoryFrameOverrides ?? {},
    )) {
      for (const runtimeId of sourceIndex.runtimeIdsByKey.get(key) ?? []) {
        restored[runtimeId] = frameId;
      }
    }
    return restored;
  }, [persistedVisibility?.trajectoryFrameOverrides, sourceIndex]);
  const persistTrajectoryFrameOverrides = useCallback(
    (overrides: Readonly<Record<string, string>>) => {
      const semantic: Record<SemanticSourceKey, string> = {
        ...(readScene3dTileVisibility(visibilityScope, tileId ?? null)
          ?.trajectoryFrameOverrides ?? {}),
      };
      // Current sources are authoritative: an omitted current override means
      // the user cleared it. Keys absent from this recording stay latent.
      for (const key of sourceIndex.runtimeIdsByKey.keys()) {
        delete semantic[key];
      }
      for (const [runtimeId, frameId] of Object.entries(overrides)) {
        const key = sourceIndex.keyByRuntimeId.get(runtimeId);
        if (key) semantic[key] = frameId;
      }
      writeScene3dTrajectoryFrameOverrides(
        visibilityScope,
        tileId ?? null,
        semantic,
        {
          cameraSelectionCustomized,
          enabledSourceKeys: [...enabledSourceKeys],
          primarySourceKey,
        },
      );
    },
    [
      cameraSelectionCustomized,
      enabledSourceKeys,
      primarySourceKey,
      sourceIndex,
      tileId,
      visibilityScope,
    ],
  );

  return {
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
    renderableSourceIds: selectableRenderableSourceIds,
    renderableSourceKeys: selectableRenderableSourceKeys,
    persistTrajectoryFrameOverrides,
    restoredTrajectoryFrameOverrides,
    restoredSourceShapeMatches: selectionRestore.sourceShapeMatches,
    sceneAnnotationSources,
    sceneAnnotationStreams,
    selectedPointCloudSources,
    selectedPoseSources,
    selectedStreams,
    selectedStreamsKey,
    setSourcesEnabled,
    toggleSource,
  };
}

/** Fresh 3D panels show one primary geometry plus cameras with open panes. */
function default3dSelection(
  defaultRenderableSources: readonly SceneSource[],
  openCalibrationStreams: ReadonlySet<string>,
): Scene3dSelectionState {
  const primary = defaultPrimarySource(defaultRenderableSources);
  const enabledSourceKeys = new Set(
    defaultRenderableSources
      .filter(
        (source) =>
          isCameraCalibrationSource(source) &&
          openCalibrationStreams.has(source.id),
      )
      .map(semanticSourceKey),
  );
  if (primary) enabledSourceKeys.add(semanticSourceKey(primary));
  return {
    cameraSelectionCustomized: false,
    customized: false,
    enabledSourceKeys,
    primarySourceKey: primary ? semanticSourceKey(primary) : null,
  };
}

function buildCameraImageAssociations({
  cameraSources,
  defaultImageSources,
  imageProjectionSettings,
  imageSources,
  imageTileBindings,
}: {
  readonly cameraSources: readonly SceneSource[];
  readonly defaultImageSources: readonly SceneSource[];
  readonly imageProjectionSettings: Readonly<
    Record<string, { readonly calibrationStream: string | null }>
  >;
  readonly imageSources: readonly SceneSource[];
  readonly imageTileBindings: Readonly<Record<string, string>>;
}): CameraImageAssociations {
  const cameraStreams = new Set(cameraSources.map((source) => source.id));
  const openImageStreams = new Set(Object.values(imageTileBindings));
  const imageStreamByCalibrationStream = new Map<string, string>();
  const openCalibrationStreams = new Set<string>();
  const calibrationStreamFor = (source: SceneSource) =>
    imageProjectionSettings[source.id]?.calibrationStream ??
    source.metadata?.[SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID] ??
    null;
  const associate = (source: SceneSource, open: boolean) => {
    const calibrationStream = calibrationStreamFor(source);
    if (!calibrationStream || !cameraStreams.has(calibrationStream)) return;
    if (!imageStreamByCalibrationStream.has(calibrationStream)) {
      imageStreamByCalibrationStream.set(calibrationStream, source.id);
    }
    if (open) openCalibrationStreams.add(calibrationStream);
  };

  // Open panes win so their decoded texture can be reused in 3D.
  for (const source of imageSources) {
    if (openImageStreams.has(source.id)) associate(source, true);
  }
  // Explicit calibration choices are the next strongest association.
  for (const source of [...imageSources].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (imageProjectionSettings[source.id]?.calibrationStream) {
      associate(source, false);
    }
  }
  // Finally, fill remaining cameras with the preferred inventory image.
  for (const source of defaultImageSources) associate(source, false);

  return { imageStreamByCalibrationStream, openCalibrationStreams };
}

/**
 * Point clouds are the preferred standalone signal. If none exist, choose one
 * non-camera renderable so label-only/map-only recordings still open usefully.
 */
function defaultPrimarySource(
  defaultRenderableSources: readonly SceneSource[],
): SceneSource | null {
  const pointCloud = sortPointCloudSourcesForInitialPaint(
    defaultRenderableSources.filter(isPointCloudSource),
  )[0];
  return (
    pointCloud ??
    defaultRenderableSources.find(
      (source) => !isCameraCalibrationSource(source),
    ) ??
    null
  );
}

function reconcilePersistedSelection(
  persisted: Scene3dTileVisibility,
): Scene3dSelectionState {
  const enabledSourceKeys = new Set(persisted.enabledSourceKeys);
  const primarySourceKey = persisted.primarySourceKey;
  // Keep unavailable identities latent. Only runtime derivation filters them;
  // inventory churn never rewrites the user's saved intent.
  if (primarySourceKey) enabledSourceKeys.add(primarySourceKey);
  return {
    cameraSelectionCustomized: persisted.cameraSelectionCustomized,
    customized: true,
    enabledSourceKeys,
    primarySourceKey,
  };
}

function selectionFromEnabledIds(
  enabledSourceIds: readonly string[],
  renderableSources: readonly SceneSource[],
): Scene3dSelectionState {
  const currentIds = new Set(renderableSources.map((source) => source.id));
  const enabledIds = enabledSourceIds.filter((id) => currentIds.has(id));
  const enabledSourceKeys = new Set(
    renderableSources
      .filter((source) => enabledIds.includes(source.id))
      .map(semanticSourceKey),
  );
  const primary = bestEnabledPrimarySourceId(
    new Set(enabledIds),
    renderableSources,
  );
  const primarySource = primary
    ? renderableSources.find((source) => source.id === primary)
    : undefined;
  return {
    cameraSelectionCustomized: false,
    customized: false,
    enabledSourceKeys,
    primarySourceKey: primarySource ? semanticSourceKey(primarySource) : null,
  };
}

function nextPrimarySourceKey(
  currentPrimarySourceKey: SemanticSourceKey | null,
  enabled: ReadonlySet<SemanticSourceKey>,
  renderableSources: readonly SceneSource[],
  newlyEnabledSourceKey: SemanticSourceKey | null,
): SemanticSourceKey | null {
  if (currentPrimarySourceKey && enabled.has(currentPrimarySourceKey)) {
    return currentPrimarySourceKey;
  }
  if (newlyEnabledSourceKey && enabled.has(newlyEnabledSourceKey)) {
    const source = renderableSources.find(
      (candidate) => semanticSourceKey(candidate) === newlyEnabledSourceKey,
    );
    if (source && !isCameraCalibrationSource(source)) {
      return newlyEnabledSourceKey;
    }
  }
  const primary = bestEnabledPrimarySourceId(
    new Set(
      renderableSources
        .filter((source) => enabled.has(semanticSourceKey(source)))
        .map((source) => source.id),
    ),
    renderableSources,
  );
  const source = renderableSources.find(
    (candidate) => candidate.id === primary,
  );
  return source ? semanticSourceKey(source) : null;
}

function bestEnabledPrimarySourceId(
  enabled: ReadonlySet<string>,
  renderableSources: readonly SceneSource[],
): string | null {
  const rankedPointCloud = sortPointCloudSourcesForInitialPaint(
    renderableSources.filter(
      (source) => isPointCloudSource(source) && enabled.has(source.id),
    ),
  )[0];
  return (
    rankedPointCloud?.id ??
    renderableSources.find(
      (source) => enabled.has(source.id) && !isCameraCalibrationSource(source),
    )?.id ??
    null
  );
}

function sameStringSet(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function is3dRenderableSource(source: SceneSource): boolean {
  return (
    isPointCloudSource(source) ||
    isSceneAnnotationSource(source) ||
    isMapLayerSource(source) ||
    isCameraCalibrationSource(source) ||
    isPoseSource(source)
  );
}

function isPointCloudSource(source: SceneSource): boolean {
  return source.type === SCENE_SOURCE_TYPE.POINT_CLOUD;
}

function isSceneAnnotationSource(source: SceneSource): boolean {
  return source.type === SCENE_SOURCE_TYPE.SCENE_ANNOTATION;
}

function isMapLayerSource(source: SceneSource): boolean {
  return source.type === SCENE_SOURCE_TYPE.MAP_LAYER;
}

function isCameraCalibrationSource(source: SceneSource): boolean {
  return source.type === SCENE_SOURCE_TYPE.CAMERA_CALIBRATION;
}

function isPoseSource(source: SceneSource): boolean {
  return source.type === SCENE_SOURCE_TYPE.POSE;
}

function sortPointCloudSourcesForInitialPaint(
  sources: readonly SceneSource[],
): SceneSource[] {
  return sources
    .map((source, index) => ({
      index,
      score: provisionalPointCloudStreamScore(source),
      source,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ source }) => source);
}

/**
 * Picks the point cloud used for the provisional (pre-transform) paint —
 * the highest LiDAR-likelihood score among sources with a current frame.
 */
export function selectProvisionalPointCloudStream(
  sources: readonly SceneSource[],
  frames: readonly (StreamContentFrame<PointCloudVisualization> | null)[],
): string | null {
  let best: {
    readonly index: number;
    readonly score: number;
    readonly stream: string;
  } | null = null;

  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    if (!source) {
      continue;
    }
    if (!frames[index]) {
      continue;
    }

    const score = provisionalPointCloudStreamScore(source);
    if (
      !best ||
      score > best.score ||
      (score === best.score && index < best.index)
    ) {
      best = {
        index,
        score,
        stream: source.id,
      };
    }
  }

  return best?.stream ?? sources[0]?.id ?? null;
}

/**
 * Index-aligned lookup of a stream's current playback frame.
 */
export function playbackFrameForStream(
  selectedStreams: readonly string[],
  frames: readonly (StreamContentFrame<PointCloudVisualization> | null)[],
  stream: string | null,
) {
  if (!stream) {
    return null;
  }

  const index = selectedStreams.indexOf(stream);
  return index >= 0 ? (frames[index] ?? null) : null;
}

function provisionalPointCloudStreamScore(source: SceneSource): number {
  const haystack = source.sourceName.toLowerCase();
  let score = 0;

  for (const keyword of PROVISIONAL_STREAM_KEYWORDS) {
    if (haystack.includes(keyword.value)) {
      score += keyword.score;
    }
  }
  for (const penalty of PROVISIONAL_STREAM_PENALTIES) {
    if (haystack.includes(penalty.value)) {
      score += penalty.score;
    }
  }

  return score;
}
