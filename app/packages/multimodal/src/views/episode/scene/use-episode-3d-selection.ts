import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PointCloudVisualization } from "../../../ir";
import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  type SceneSource,
} from "../../../ir";
import { useSceneInventory } from "../../../scene-inventory/react";
import { filterDefaultStreamEquivalents } from "../../../stream-selection";
import {
  resolveEpisode3dSelectionRestore,
  type Episode3dViewStateStore,
  type Episode3dViewStateSnapshot,
} from "./episode-3d-view-state";
import { useEpisode3dViewStateStore } from "./episode-3d-view-state-context";
import {
  readEpisode3dTileVisibility,
  useEpisodePanelVisibilityScope,
  writeEpisode3dTileVisibility,
  type Episode3dTileVisibility,
} from "../tiles/episode-panel-visibility";
import { useEpisodeImageProjectionSettingsByStream } from "../settings/episode-modal-settings";
import { useEpisodeImageTileBindings } from "../tiles/episode-tile-source-bindings";
import type { EpisodeStreamPlaybackFrame } from "../playback/use-episode-stream-values";

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

interface Episode3dSelectionState {
  readonly customized: boolean;
  readonly enabled: ReadonlySet<string>;
  readonly primarySourceId: string | null;
}

interface EpisodeCameraImageAssociations {
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
export function useEpisode3dSelection({
  restore = null,
  sourceKey,
  viewStateStore: suppliedViewStateStore,
}: {
  readonly restore?: Episode3dViewStateSnapshot | null;
  readonly sourceKey: string;
  readonly viewStateStore?: Episode3dViewStateStore;
}) {
  const viewStateStore = useEpisode3dViewStateStore(suppliedViewStateStore);
  const tileId = useTileId();
  const visibilityScope = useEpisodePanelVisibilityScope();
  const imageTileBindings = useEpisodeImageTileBindings();
  const sources = useSceneInventory();
  const imageProjectionSettings = useEpisodeImageProjectionSettingsByStream();
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
  const cameraCalibrationStreams = useMemo(
    () => new Set(cameraCalibrationSources.map((source) => source.id)),
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
        getStream: (source) => source.id,
      }),
    [imageSources],
  );
  const cameraAssociations = useMemo(
    () =>
      buildEpisodeCameraImageAssociations({
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
  const defaultRenderableSources = useMemo(
    () =>
      filterDefaultStreamEquivalents(selectableRenderableSources, {
        getKind: (source) => source.type,
        getStream: (source) => source.id,
      }),
    [selectableRenderableSources],
  );
  const setTileTitle = useSetTileTitle();
  // Carried-over selection state from the previous sample, resolved once at
  // mount: it applies only when the new sample's renderable source ids
  // exactly match the shape the snapshot was captured against.
  const [selectionRestore] = useState(() =>
    resolveEpisode3dSelectionRestore(restore, selectableRenderableSourceIds),
  );
  const [selection, setSelection] = useState<Episode3dSelectionState>(() => {
    const persisted = readEpisode3dTileVisibility(
      visibilityScope,
      tileId ?? null,
    );
    if (persisted) {
      return reconcilePersistedSelection(
        persisted,
        selectableRenderableSources,
        defaultRenderableSources,
      );
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
  const { customized, enabled, primarySourceId } = selection;

  // This effect writes panel-local visibility to durable storage before a
  // later modal open can recreate stream demand.
  useEffect(() => {
    if (!customized) return;
    writeEpisode3dTileVisibility(visibilityScope, tileId ?? null, {
      enabledSourceIds: [...enabled],
      primarySourceId,
    });
  }, [customized, enabled, primarySourceId, tileId, visibilityScope]);

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
    });
  }, [enabled, selectableRenderableSourceIds, sourceKey, viewStateStore]);

  // This effect keeps untouched camera defaults aligned with the image panes
  // currently open. The first sidebar edit freezes the explicit selection.
  useEffect(() => {
    setSelection((current) => {
      if (current.customized) return current;
      const defaults = default3dSelection(
        defaultRenderableSources,
        cameraAssociations.openCalibrationStreams,
      );
      const nextEnabled = new Set(
        [...current.enabled].filter((id) => !cameraCalibrationStreams.has(id)),
      );
      for (const id of defaults.enabled) {
        if (cameraCalibrationStreams.has(id)) nextEnabled.add(id);
      }
      return sameStringSet(nextEnabled, current.enabled)
        ? current
        : { ...current, enabled: nextEnabled };
    });
  }, [
    cameraAssociations.openCalibrationStreams,
    cameraCalibrationStreams,
    defaultRenderableSources,
  ]);

  // This effect reconciles inventory churn conservatively: missing sources
  // disappear and a missing primary gets one ranked replacement, but newly
  // discovered secondary sources never auto-enable.
  useEffect(() => {
    const currentIds = new Set(
      selectableRenderableSources.map((source) => source.id),
    );
    setSelection((current) => {
      const nextEnabled = new Set(
        [...current.enabled].filter((id) => currentIds.has(id)),
      );
      let nextPrimary = current.primarySourceId;
      if (nextPrimary && !currentIds.has(nextPrimary)) {
        const replacement = defaultPrimarySource(defaultRenderableSources);
        nextPrimary = replacement?.id ?? null;
        if (replacement) nextEnabled.add(replacement.id);
      }
      if (
        nextPrimary === current.primarySourceId &&
        sameStringSet(nextEnabled, current.enabled)
      ) {
        return current;
      }
      return {
        ...current,
        enabled: nextEnabled,
        primarySourceId: nextPrimary,
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
      setSelection((current) => {
        const nextEnabled = new Set(current.enabled);
        if (checked) {
          nextEnabled.add(id);
        } else {
          nextEnabled.delete(id);
        }
        const primarySourceId = nextPrimarySourceId(
          current.primarySourceId,
          nextEnabled,
          selectableRenderableSources,
          checked ? id : null,
        );
        if (
          primarySourceId === current.primarySourceId &&
          sameStringSet(nextEnabled, current.enabled)
        ) {
          return current;
        }
        return { customized: true, enabled: nextEnabled, primarySourceId };
      });
    },
    [selectableRenderableSources],
  );

  const setSourcesEnabled = useCallback(
    (ids: readonly string[], checked: boolean) => {
      setSelection((current) => {
        const nextEnabled = new Set(current.enabled);
        let changed = false;
        for (const id of ids) {
          if (checked) {
            if (!nextEnabled.has(id)) {
              nextEnabled.add(id);
              changed = true;
            }
          } else if (nextEnabled.delete(id)) {
            changed = true;
          }
        }
        if (!changed) return current;
        return {
          customized: true,
          enabled: nextEnabled,
          primarySourceId: nextPrimarySourceId(
            current.primarySourceId,
            nextEnabled,
            selectableRenderableSources,
            checked ? (ids[0] ?? null) : null,
          ),
        };
      });
    },
    [selectableRenderableSources],
  );

  return {
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
    renderableSourceIds: selectableRenderableSourceIds,
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
): Episode3dSelectionState {
  const primary = defaultPrimarySource(defaultRenderableSources);
  const enabled = new Set(
    defaultRenderableSources
      .filter(
        (source) =>
          isCameraCalibrationSource(source) &&
          openCalibrationStreams.has(source.id),
      )
      .map((source) => source.id),
  );
  if (primary) enabled.add(primary.id);
  return {
    customized: false,
    enabled,
    primarySourceId: primary?.id ?? null,
  };
}

function buildEpisodeCameraImageAssociations({
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
}): EpisodeCameraImageAssociations {
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
  persisted: Episode3dTileVisibility,
  renderableSources: readonly SceneSource[],
  defaultRenderableSources: readonly SceneSource[],
): Episode3dSelectionState {
  const currentIds = new Set(renderableSources.map((source) => source.id));
  const enabled = new Set(
    persisted.enabledSourceIds.filter((id) => currentIds.has(id)),
  );
  let primarySourceId = persisted.primarySourceId;
  if (primarySourceId && currentIds.has(primarySourceId)) {
    enabled.add(primarySourceId);
  } else if (primarySourceId) {
    const replacement = defaultPrimarySource(defaultRenderableSources);
    primarySourceId = replacement?.id ?? null;
    if (replacement) enabled.add(replacement.id);
  }
  return { customized: true, enabled, primarySourceId };
}

function selectionFromEnabledIds(
  enabledSourceIds: readonly string[],
  renderableSources: readonly SceneSource[],
): Episode3dSelectionState {
  const currentIds = new Set(renderableSources.map((source) => source.id));
  const enabled = new Set(enabledSourceIds.filter((id) => currentIds.has(id)));
  return {
    customized: false,
    enabled,
    primarySourceId: bestEnabledPrimarySourceId(enabled, renderableSources),
  };
}

function nextPrimarySourceId(
  currentPrimarySourceId: string | null,
  enabled: ReadonlySet<string>,
  renderableSources: readonly SceneSource[],
  newlyEnabledSourceId: string | null,
): string | null {
  if (currentPrimarySourceId && enabled.has(currentPrimarySourceId)) {
    return currentPrimarySourceId;
  }
  if (newlyEnabledSourceId && enabled.has(newlyEnabledSourceId)) {
    const source = renderableSources.find(
      (candidate) => candidate.id === newlyEnabledSourceId,
    );
    if (source && !isCameraCalibrationSource(source)) {
      return source.id;
    }
  }
  return bestEnabledPrimarySourceId(enabled, renderableSources);
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
  frames: readonly (EpisodeStreamPlaybackFrame<PointCloudVisualization> | null)[],
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
  frames: readonly (EpisodeStreamPlaybackFrame<PointCloudVisualization> | null)[],
  stream: string | null,
) {
  if (!stream) {
    return null;
  }

  const index = selectedStreams.indexOf(stream);
  return index >= 0 ? (frames[index] ?? null) : null;
}

function provisionalPointCloudStreamScore(source: SceneSource): number {
  const haystack = `${source.id} ${source.label}`.toLowerCase();
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
