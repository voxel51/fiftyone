import { useSetTileTitle } from "@fiftyone/tiling";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneInventory, type SceneSource } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { chooseCalibrationTopic } from "../topic-matching";
import {
  recordMcap3dShowCameraImages,
  recordMcap3dSourceSelection,
  resolveMcap3dSelectionRestore,
  type Mcap3dViewStateSnapshot,
} from "./mcap-3d-view-state";
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
  { score: 60, value: "robosense" },
  { score: 35, value: "point_cloud" },
  { score: 35, value: "pointcloud" },
  { score: 25, value: "/points" },
  { score: 20, value: "points" },
];
const PROVISIONAL_TOPIC_PENALTIES: readonly {
  readonly score: number;
  readonly value: string;
}[] = [{ score: -50, value: "radar" }];

/**
 * Source selection state for the 3D tile: which 3D-renderable sources are
 * enabled, the topic arrays derived from that set, the calibration↔image
 * pairing that feeds camera frustum image planes, and the tile-title sync.
 * State is local to the calling tile — it resets when the tile remounts.
 * An optional `restore` snapshot (captured by the previous mount via the
 * session view-state store) seeds the enabled set and camera-image toggle,
 * but only when the new sample's renderable-source shape strictly matches
 * the snapshot's; otherwise the defaults apply exactly as a fresh mount.
 */
export function useMcap3dSelection({
  restore = null,
}: {
  readonly restore?: Mcap3dViewStateSnapshot | null;
} = {}) {
  const sources = useSceneInventory();
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
  const cameraSources = useMemo(
    () => renderableSources.filter(isCameraCalibrationSource),
    [renderableSources],
  );
  const poseSources = useMemo(
    () => renderableSources.filter(isPoseSource),
    [renderableSources],
  );
  const sceneAnnotationSources = useMemo(
    () => renderableSources.filter(isSceneAnnotationSource),
    [renderableSources],
  );
  const setTileTitle = useSetTileTitle();
  // Carried-over selection state from the previous sample, resolved once at
  // mount: it applies only when the new sample's renderable source ids
  // exactly match the shape the snapshot was captured against.
  const [selectionRestore] = useState(() =>
    resolveMcap3dSelectionRestore(
      restore,
      renderableSources.map((s) => s.id),
    ),
  );
  // Start with every source enabled (or the carried-over set when the source
  // shape matches). This tile only mounts after the scene inventory is ready
  // (the renderer gates on it), so `renderableSources` is already populated
  // and the lazy initializer captures the full set once.
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        selectionRestore.enabledSourceIds ?? renderableSources.map((s) => s.id),
      ),
  );
  const knownRenderableSourceIdsRef = useRef<ReadonlySet<string>>(
    new Set(renderableSources.map((s) => s.id)),
  );

  // This effect writes the enabled-source selection (with the renderable
  // source shape it was captured against) through to the session view-state
  // store so the selection can carry across sample navigation.
  useEffect(() => {
    recordMcap3dSourceSelection({
      enabledSourceIds: [...enabled],
      renderableSourceIds: renderableSources.map((s) => s.id),
    });
  }, [enabled, renderableSources]);

  // This effect keeps the enabled source set aligned as 3D sources appear or
  // disappear after the tile mounts.
  useEffect(() => {
    const currentIds = new Set(renderableSources.map((s) => s.id));
    const previousIds = knownRenderableSourceIdsRef.current;
    setEnabled((current) => {
      const next = new Set(current);
      let changed = false;

      for (const id of currentIds) {
        if (!previousIds.has(id) && !next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      for (const id of next) {
        if (!currentIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }

      return changed ? next : current;
    });
    knownRenderableSourceIdsRef.current = currentIds;
  }, [renderableSources]);

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
  // Camera frames on frustum image planes: pair each calibration topic with
  // its camera's image stream (same prefix convention the image tile uses,
  // inverted) so the frustum can show what the camera currently sees.
  const [showCameraImages, setShowCameraImages] = useState(
    selectionRestore.showCameraImages ?? true,
  );

  // This effect writes the camera-image visibility toggle through to the
  // session view-state store so it can carry across sample navigation.
  useEffect(() => {
    recordMcap3dShowCameraImages(showCameraImages);
  }, [showCameraImages]);
  const imageTopicByCalibrationTopic = useMemo(() => {
    const pairs = new Map<string, string>();
    for (const source of sources) {
      if (source.type !== MCAP_SOURCE_TYPE.IMAGE) {
        continue;
      }
      const calibrationTopic = chooseCalibrationTopic(source.id, cameraTopics);
      if (calibrationTopic && !pairs.has(calibrationTopic)) {
        pairs.set(calibrationTopic, source.id);
      }
    }
    return pairs;
  }, [cameraTopics, sources]);
  const frustumImageTopics = useMemo(
    () =>
      showCameraImages
        ? cameraTopics.map(
            (topic) => imageTopicByCalibrationTopic.get(topic) ?? "",
          )
        : [],
    [cameraTopics, imageTopicByCalibrationTopic, showCameraImages],
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
        ? renderableSources.find((s) => s.id === selectedTopics[0])?.label
        : null;
    setTileTitle(label ?? TILE_TYPE_LABEL);
  }, [selectedTopics, renderableSources, setTileTitle]);

  const toggleSource = useCallback((id: string, checked: boolean) => {
    setEnabled((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

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
    setEnabled,
    setShowCameraImages,
    showCameraImages,
    toggleSource,
  };
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
