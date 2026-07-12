import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneInventory, type SceneSource } from "../../../scene-inventory";
import { MCAP_SCENE_SOURCE_METADATA, MCAP_SOURCE_TYPE } from "../scene-sources";
import { filterDefaultTopicEquivalents } from "../topic-matching";
import {
  resolveMcap3dSelectionRestore,
  type Mcap3dViewStateStore,
  type Mcap3dViewStateSnapshot,
} from "./mcap-3d-view-state";
import { useMcap3dViewStateStore } from "./mcap-3d-view-state-context";
import {
  readMcap3dTileVisibility,
  useMcapPanelVisibilityScope,
  writeMcap3dTileVisibility,
  type Mcap3dTileVisibility,
} from "./mcap-panel-visibility";
import { useMcapImageProjectionSettingsByTopic } from "./mcap-modal-settings";
import { useMcapImageTileBindings } from "./mcap-tile-source-bindings";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

const TILE_TYPE_LABEL = "3D";
const PROVISIONAL_TOPIC_KEYWORDS: readonly {
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
const PROVISIONAL_TOPIC_PENALTIES: readonly {
  readonly score: number;
  readonly value: string;
}[] = [{ score: -50, value: "radar" }];

interface Mcap3dSelectionState {
  readonly customized: boolean;
  readonly enabled: ReadonlySet<string>;
  readonly primarySourceId: string | null;
}

interface McapCameraImageAssociations {
  readonly imageTopicByCalibrationTopic: ReadonlyMap<string, string>;
  readonly openCalibrationTopics: ReadonlySet<string>;
}

/**
 * Source selection state for the 3D tile: which 3D-renderable sources are
 * enabled, the topic arrays derived from that set, the calibration↔image
 * pairing that feeds camera frustum image planes, and the tile-title sync.
 * Durable state is scoped to the calling tile. A fresh tile starts with one
 * ranked primary geometry plus textured cameras represented by open image
 * panes; labels, maps, poses, and secondary clouds remain cold until the user
 * enables them.
 */
export function useMcap3dSelection({
  restore = null,
  viewStateStore: suppliedViewStateStore,
}: {
  readonly restore?: Mcap3dViewStateSnapshot | null;
  readonly viewStateStore?: Mcap3dViewStateStore;
} = {}) {
  const viewStateStore = useMcap3dViewStateStore(suppliedViewStateStore);
  const tileId = useTileId();
  const visibilityScope = useMcapPanelVisibilityScope();
  const imageTileBindings = useMcapImageTileBindings();
  const sources = useSceneInventory();
  const imageProjectionSettings = useMcapImageProjectionSettingsByTopic();
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
  const cameraCalibrationTopics = useMemo(
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
    () => sources.filter((source) => source.type === MCAP_SOURCE_TYPE.IMAGE),
    [sources],
  );
  const defaultImageSources = useMemo(
    () =>
      filterDefaultTopicEquivalents(imageSources, {
        getKind: (source) => source.type,
        getTopic: (source) => source.id,
      }),
    [imageSources],
  );
  const cameraAssociations = useMemo(
    () =>
      buildMcapCameraImageAssociations({
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
        cameraAssociations.imageTopicByCalibrationTopic.has(source.id),
      ),
    [cameraAssociations, cameraCalibrationSources],
  );
  const selectableRenderableSources = useMemo(
    () =>
      renderableSources.filter(
        (source) =>
          !isCameraCalibrationSource(source) ||
          cameraAssociations.imageTopicByCalibrationTopic.has(source.id),
      ),
    [cameraAssociations, renderableSources],
  );
  const defaultRenderableSources = useMemo(
    () =>
      filterDefaultTopicEquivalents(selectableRenderableSources, {
        getKind: (source) => source.type,
        getTopic: (source) => source.id,
      }),
    [selectableRenderableSources],
  );
  const setTileTitle = useSetTileTitle();
  // Carried-over selection state from the previous sample, resolved once at
  // mount: it applies only when the new sample's renderable source ids
  // exactly match the shape the snapshot was captured against.
  const [selectionRestore] = useState(() =>
    resolveMcap3dSelectionRestore(
      restore,
      selectableRenderableSources.map((s) => s.id),
    ),
  );
  const [selection, setSelection] = useState<Mcap3dSelectionState>(() => {
    const persisted = readMcap3dTileVisibility(visibilityScope, tileId ?? null);
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
      cameraAssociations.openCalibrationTopics,
    );
  });
  const { customized, enabled, primarySourceId } = selection;

  // This effect writes panel-local visibility to durable storage before a
  // later modal open can recreate stream demand.
  useEffect(() => {
    if (!customized) return;
    writeMcap3dTileVisibility(visibilityScope, tileId ?? null, {
      enabledSourceIds: [...enabled],
      primarySourceId,
    });
  }, [customized, enabled, primarySourceId, tileId, visibilityScope]);

  // This effect retains the memory bridge for navigation compatibility while
  // durable per-tile visibility remains the source of truth.
  useEffect(() => {
    viewStateStore.recordSourceSelection({
      enabledSourceIds: [...enabled],
      renderableSourceIds: selectableRenderableSources.map((s) => s.id),
    });
  }, [enabled, selectableRenderableSources, viewStateStore]);

  // This effect keeps untouched camera defaults aligned with the image panes
  // currently open. The first sidebar edit freezes the explicit selection.
  useEffect(() => {
    setSelection((current) => {
      if (current.customized) return current;
      const defaults = default3dSelection(
        defaultRenderableSources,
        cameraAssociations.openCalibrationTopics,
      );
      const nextEnabled = new Set(
        [...current.enabled].filter((id) => !cameraCalibrationTopics.has(id)),
      );
      for (const id of defaults.enabled) {
        if (cameraCalibrationTopics.has(id)) nextEnabled.add(id);
      }
      return sameStringSet(nextEnabled, current.enabled)
        ? current
        : { ...current, enabled: nextEnabled };
    });
  }, [
    cameraAssociations.openCalibrationTopics,
    cameraCalibrationTopics,
    defaultRenderableSources,
  ]);

  // Reconcile inventory churn conservatively: missing sources disappear and
  // a missing primary gets one ranked replacement, but newly discovered
  // secondary sources never auto-enable.
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
  const pointCloudTopics = useMemo(
    () => selectedPointCloudSources.map((s) => s.id),
    [selectedPointCloudSources],
  );
  const sceneAnnotationTopics = useMemo(
    () => selectedSceneAnnotationSources.map((s) => s.id),
    [selectedSceneAnnotationSources],
  );
  const mapLayerTopics = useMemo(
    () => selectedMapLayerSources.map((s) => s.id),
    [selectedMapLayerSources],
  );
  const cameraTopics = useMemo(
    () => selectedCameraSources.map((s) => s.id),
    [selectedCameraSources],
  );
  const selectedPoseSources = useMemo(
    () => poseSources.filter((s) => enabled.has(s.id)),
    [poseSources, enabled],
  );
  const poseTopics = useMemo(
    () => selectedPoseSources.map((s) => s.id),
    [selectedPoseSources],
  );
  const frustumImageTopics = useMemo(
    () =>
      cameraTopics.map(
        (topic) =>
          cameraAssociations.imageTopicByCalibrationTopic.get(topic) ?? "",
      ),
    [cameraAssociations, cameraTopics],
  );
  const selectedTopics = useMemo(
    () => [
      ...pointCloudTopics,
      ...mapLayerTopics,
      ...cameraTopics,
      ...poseTopics,
      ...sceneAnnotationTopics,
    ],
    [
      cameraTopics,
      mapLayerTopics,
      pointCloudTopics,
      poseTopics,
      sceneAnnotationTopics,
    ],
  );
  const selectedTopicsKey = useMemo(
    () => selectedTopics.join("\0"),
    [selectedTopics],
  );
  // Location fixes are pure telemetry (no checkbox, no scene content): the
  // first LocationFix stream in the inventory feeds the HUD readout.
  const locationTopics = useMemo(() => {
    const first = sources.find((s) => s.type === MCAP_SOURCE_TYPE.LOCATION);
    return first ? [first.id] : [];
  }, [sources]);

  // This effect syncs the tile title with the current 3D source selection.
  useEffect(() => {
    const label =
      selectedTopics.length === 1
        ? selectableRenderableSources.find((s) => s.id === selectedTopics[0])
            ?.label
        : null;
    setTileTitle(label ?? TILE_TYPE_LABEL, { source: "auto" });
  }, [selectedTopics, selectableRenderableSources, setTileTitle]);

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
    restoredSourceShapeMatches: selectionRestore.sourceShapeMatches,
    sceneAnnotationSources,
    sceneAnnotationTopics,
    selectedPointCloudSources,
    selectedPoseSources,
    selectedTopics,
    selectedTopicsKey,
    setSourcesEnabled,
    toggleSource,
  };
}

/** Fresh 3D panels show one primary geometry plus cameras with open panes. */
function default3dSelection(
  defaultRenderableSources: readonly SceneSource[],
  openCalibrationTopics: ReadonlySet<string>,
): Mcap3dSelectionState {
  const primary = defaultPrimarySource(defaultRenderableSources);
  const enabled = new Set(
    defaultRenderableSources
      .filter(
        (source) =>
          isCameraCalibrationSource(source) &&
          openCalibrationTopics.has(source.id),
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

function buildMcapCameraImageAssociations({
  cameraSources,
  defaultImageSources,
  imageProjectionSettings,
  imageSources,
  imageTileBindings,
}: {
  readonly cameraSources: readonly SceneSource[];
  readonly defaultImageSources: readonly SceneSource[];
  readonly imageProjectionSettings: Readonly<
    Record<string, { readonly calibrationTopic: string | null }>
  >;
  readonly imageSources: readonly SceneSource[];
  readonly imageTileBindings: Readonly<Record<string, string>>;
}): McapCameraImageAssociations {
  const cameraTopics = new Set(cameraSources.map((source) => source.id));
  const openImageTopics = new Set(Object.values(imageTileBindings));
  const imageTopicByCalibrationTopic = new Map<string, string>();
  const openCalibrationTopics = new Set<string>();
  const calibrationTopicFor = (source: SceneSource) =>
    imageProjectionSettings[source.id]?.calibrationTopic ??
    source.metadata?.[MCAP_SCENE_SOURCE_METADATA.CALIBRATION_TOPIC] ??
    null;
  const associate = (source: SceneSource, open: boolean) => {
    const calibrationTopic = calibrationTopicFor(source);
    if (!calibrationTopic || !cameraTopics.has(calibrationTopic)) return;
    if (!imageTopicByCalibrationTopic.has(calibrationTopic)) {
      imageTopicByCalibrationTopic.set(calibrationTopic, source.id);
    }
    if (open) openCalibrationTopics.add(calibrationTopic);
  };

  // Open panes win so their decoded texture can be reused in 3D.
  for (const source of imageSources) {
    if (openImageTopics.has(source.id)) associate(source, true);
  }
  // Explicit calibration choices are the next strongest association.
  for (const source of [...imageSources].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (imageProjectionSettings[source.id]?.calibrationTopic) {
      associate(source, false);
    }
  }
  // Finally, fill remaining cameras with the preferred inventory image.
  for (const source of defaultImageSources) associate(source, false);

  return { imageTopicByCalibrationTopic, openCalibrationTopics };
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
  persisted: Mcap3dTileVisibility,
  renderableSources: readonly SceneSource[],
  defaultRenderableSources: readonly SceneSource[],
): Mcap3dSelectionState {
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
): Mcap3dSelectionState {
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
  return source.type === MCAP_SOURCE_TYPE.POINT_CLOUD;
}

function isSceneAnnotationSource(source: SceneSource): boolean {
  return source.type === MCAP_SOURCE_TYPE.SCENE_ANNOTATION;
}

function isMapLayerSource(source: SceneSource): boolean {
  return source.type === MCAP_SOURCE_TYPE.MAP_LAYER;
}

function isCameraCalibrationSource(source: SceneSource): boolean {
  return source.type === MCAP_SOURCE_TYPE.CAMERA_CALIBRATION;
}

function isPoseSource(source: SceneSource): boolean {
  return source.type === MCAP_SOURCE_TYPE.POSE;
}

function sortPointCloudSourcesForInitialPaint(
  sources: readonly SceneSource[],
): SceneSource[] {
  return sources
    .map((source, index) => ({
      index,
      score: provisionalPointCloudTopicScore(source),
      source,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ source }) => source);
}

/**
 * Picks the point cloud used for the provisional (pre-transform) paint —
 * the highest LiDAR-likelihood score among sources with a current frame.
 */
export function selectProvisionalPointCloudTopic(
  sources: readonly SceneSource[],
  frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[],
): string | null {
  let best: {
    readonly index: number;
    readonly score: number;
    readonly topic: string;
  } | null = null;

  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    if (!source) {
      continue;
    }
    if (!frames[index]) {
      continue;
    }

    const score = provisionalPointCloudTopicScore(source);
    if (
      !best ||
      score > best.score ||
      (score === best.score && index < best.index)
    ) {
      best = {
        index,
        score,
        topic: source.id,
      };
    }
  }

  return best?.topic ?? sources[0]?.id ?? null;
}

/**
 * Index-aligned lookup of a topic's current playback frame.
 */
export function playbackFrameForTopic(
  selectedTopics: readonly string[],
  frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[],
  topic: string | null,
) {
  if (!topic) {
    return null;
  }

  const index = selectedTopics.indexOf(topic);
  return index >= 0 ? (frames[index] ?? null) : null;
}

function provisionalPointCloudTopicScore(source: SceneSource): number {
  const haystack = `${source.id} ${source.label}`.toLowerCase();
  let score = 0;

  for (const keyword of PROVISIONAL_TOPIC_KEYWORDS) {
    if (haystack.includes(keyword.value)) {
      score += keyword.score;
    }
  }
  for (const penalty of PROVISIONAL_TOPIC_PENALTIES) {
    if (haystack.includes(penalty.value)) {
      score += penalty.score;
    }
  }

  return score;
}
