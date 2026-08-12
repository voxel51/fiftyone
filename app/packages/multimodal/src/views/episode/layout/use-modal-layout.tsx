import { collectTileIds, useTiling, type TilingTile } from "@fiftyone/tiling";
import { useStore, type Atom, type PrimitiveAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MosaicNode } from "react-mosaic-component";
import { episodeTileExtensionSettingsAtom } from "../../../extensions/tiles/settings";
import { isEpisodeTileExtensionId } from "../../../extensions/tiles/registry";
import type { ByteSourceReadProfile } from "../../../ir";
import type { SceneSource } from "../../../scene-inventory";
import {
  DEFAULT_SCENE_3D_UP_AXIS,
  type Scene3dUpAxis,
} from "../spatial/view-preferences";
import {
  DEFAULT_SCENE_3D_TRACKING_MODE,
  type Scene3dTrackingMode,
} from "../scene/camera/scene-3d-camera";
import {
  tileTypeFromId,
  readCameraPreferences,
  readModalLayout,
  sanitizeExtensionSettings,
  writeCameraPreferences,
  writeModalLayout,
  type PersistedModalLayout,
} from "./layout-persistence";
import {
  DEFAULT_LOG_TILE_SETTINGS,
  logTileSettingsAtom,
  type LogTileSettings,
} from "../logs/log-tile-state";
import {
  DEFAULT_MAP_TILE_SETTINGS,
  mapTileSettingsAtom,
  type MapTileSettings,
} from "../map/tile/tile-state";
import {
  plotTileSeriesAtom,
  type PlotSeriesConfig,
} from "../plots/plot-tile-state";
import { rawTileStreamAtom } from "../tiles/raw-message-binding";
import {
  DEFAULT_SCENE_3D_TILE_PLAYBACK_SETTINGS,
  scene3dTilePlaybackSettingsAtom,
  type Scene3dTilePlaybackSettings,
} from "../scene/tile/scene-3d-tile-state";
import {
  TILE_TYPE,
  type EpisodeTileProps,
  type TileType,
} from "../tiles/tile-types";
import {
  collectPlaybackDeviceCapabilities,
  rankDefaultImageSources,
  resolvePlaybackLayout,
  type PlaybackDeviceCapabilities,
  type PlaybackLayoutTile,
} from "./playback-layout";
import MissingTile from "../tiles/MissingTile";
import {
  defaultTimelineSamplingRateHz,
  normalizeTimelineSamplingRateHz,
} from "../playback/timeline-sampling";

export interface ModalLayout {
  initialTiles: Record<string, TilingTile>;
  /** User-authored titles to seed into the TilingProvider. */
  initialManualTileTitles: Record<string, string>;
  /** `undefined` lets the TilingProvider auto-lay-out `initialTiles`. */
  initialLayout: MosaicNode<string> | undefined;
  /** Tile id that should initially render expanded to fullscreen. */
  initialExpandedTileId: string | null;
  /** Resolver-default tile entries restored by Reset Layout. */
  resetTiles: Record<string, TilingTile>;
  defaultLeftOpen: boolean;
  onLeftOpenChange: (open: boolean) => void;
  /** Persisted sidebar width; `undefined` keeps the shell's default. */
  defaultLeftSidebarWidth: number | undefined;
  onLeftSidebarWidthChange: (px: number) => void;
  sceneUpAxis: Scene3dUpAxis;
  onSceneUpAxisChange: (axis: Scene3dUpAxis) => void;
  preferredWorldFrameId: string | null;
  onPreferredWorldFrameIdChange: (frameId: string | null) => void;
  preferredCameraTargetFrameId: string | null;
  onPreferredCameraTargetFrameIdChange: (frameId: string) => void;
  defaultTrackingMode: Scene3dTrackingMode;
  onDefaultTrackingModeChange: (mode: Scene3dTrackingMode) => void;
  timelineSamplingRateHz: number;
  onTimelineSamplingRateChange: (rateHz: number) => void;
}

export interface UseModalLayoutOptions {
  /** Tile kinds supported by the active episode manifest and capabilities. */
  availableTileTypes: readonly TileType[];
  sources: readonly SceneSource[];
  /**
   * Persistence scope — `ctx.dataset.datasetId` (stable across dataset
   * renames, unlike the name) for the sample renderer, or an episode source key
   * for the explorer. Absent, reads/writes hit only the browser-wide fallback
   * entry.
   */
  datasetId?: string;
  /** Selected media field used to isolate durable camera conventions. */
  cameraPreferenceField?: string;
  /** Source locality hint; tightens the default tile budget when remote. */
  readProfile?: ByteSourceReadProfile;
  /** Capability override for tests; collected from the browser when absent. */
  capabilities?: PlaybackDeviceCapabilities;
  /** Shell-owned resolver that materializes persisted tile descriptors. */
  resolveTile: TileResolver;
}

export type TileResolver = (type: string) => {
  readonly Tile: React.ComponentType<EpisodeTileProps>;
  readonly typeLabel: string;
} | null;

/**
 * Mount-time layout state for the episode modal: the user's persisted
 * sidebar visibility and tile arrangement when one restores cleanly
 * against the current scene, the resolver's defaults otherwise — a
 * budgeted set of default-preferred image tiles plus one fused 3D tile,
 * arranged by episode's type-aware layout strategy and sized to the
 * machine, the source locality, and the viewport (see
 * `resolvePlaybackLayout`). Pair with
 * `<ModalLayoutPersistence />` (inside the playback shell) to write
 * changes back.
 */
export function useModalLayout({
  availableTileTypes,
  sources,
  datasetId,
  cameraPreferenceField,
  readProfile,
  capabilities,
  resolveTile,
}: UseModalLayoutOptions): ModalLayout {
  const resolved = useMemo(
    () =>
      resolvePlaybackLayout({
        capabilities: capabilities ?? collectPlaybackDeviceCapabilities(),
        readProfile,
        sources,
      }),
    [sources, readProfile, capabilities],
  );
  const defaultTiles = useMemo(
    () => buildResolvedTiles(resolved.tiles, resolveTile),
    [resolveTile, resolved],
  );
  // Re-read storage whenever the scene changes: the renderer persists
  // across sample navigation, so a new sample arrives as new sources on
  // the same mount and must pick up whatever the previous sample persisted.
  const persisted = useMemo(
    () => readModalLayout(datasetId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sources is the storage-read trigger, not an input
    [datasetId, sources],
  );
  const persistedCameraPreferences = useMemo(
    () => readCameraPreferences(datasetId, cameraPreferenceField),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sources re-reads storage after in-place sample swaps
    [cameraPreferenceField, datasetId, sources],
  );

  const restored = useMemo(
    () =>
      rebuildTilesFromLayout(
        persisted?.layout,
        availableTileTypes,
        sources,
        resolveTile,
        persisted?.tileTitles,
      ),
    [availableTileTypes, persisted, resolveTile, sources],
  );
  const restoredTileIds = useMemo(
    () => (restored ? new Set(collectTileIds(restored.layout)) : null),
    [restored],
  );
  const initialExpandedTileId =
    persisted?.expandedTileId && restoredTileIds?.has(persisted.expandedTileId)
      ? persisted.expandedTileId
      : null;
  const persistedSceneUpAxis =
    persistedCameraPreferences?.sceneUpAxis ??
    persisted?.sceneUpAxis ??
    DEFAULT_SCENE_3D_UP_AXIS;
  const [sceneUpAxis, setSceneUpAxis] = useState(persistedSceneUpAxis);
  const persistedPreferredWorldFrameId =
    persistedCameraPreferences?.preferredWorldFrameId ?? null;
  const persistedPreferredCameraTargetFrameId =
    persistedCameraPreferences?.preferredCameraTargetFrameId ?? null;
  const persistedDefaultTrackingMode =
    persistedCameraPreferences?.defaultTrackingMode ??
    DEFAULT_SCENE_3D_TRACKING_MODE;
  const [preferredWorldFrameId, setPreferredWorldFrameId] = useState(
    persistedPreferredWorldFrameId,
  );
  const [preferredCameraTargetFrameId, setPreferredCameraTargetFrameId] =
    useState(persistedPreferredCameraTargetFrameId);
  const [defaultTrackingMode, setDefaultTrackingMode] = useState(
    persistedDefaultTrackingMode,
  );
  const persistedTimelineSamplingRateHz =
    persisted?.timelineSamplingRateHz ??
    defaultTimelineSamplingRateHz(readProfile);
  const [timelineSamplingRateHz, setTimelineSamplingRateHz] = useState(
    persistedTimelineSamplingRateHz,
  );
  // This effect restores the dataset-scoped scene axis after a source change.
  useEffect(() => {
    setSceneUpAxis(persistedSceneUpAxis);
    setPreferredWorldFrameId(persistedPreferredWorldFrameId);
    setPreferredCameraTargetFrameId(persistedPreferredCameraTargetFrameId);
    setDefaultTrackingMode(persistedDefaultTrackingMode);
    setTimelineSamplingRateHz(persistedTimelineSamplingRateHz);
  }, [
    cameraPreferenceField,
    datasetId,
    persistedDefaultTrackingMode,
    persistedPreferredCameraTargetFrameId,
    persistedPreferredWorldFrameId,
    persistedSceneUpAxis,
    persistedTimelineSamplingRateHz,
  ]);

  const onLeftOpenChange = useCallback(
    (open: boolean) => {
      writeModalLayout({ leftSidebarOpen: open }, datasetId);
    },
    [datasetId],
  );

  const onLeftSidebarWidthChange = useCallback(
    (px: number) => {
      writeModalLayout({ sidebarWidthPx: px }, datasetId);
    },
    [datasetId],
  );

  const onSceneUpAxisChange = useCallback(
    (axis: Scene3dUpAxis) => {
      setSceneUpAxis(axis);
      if (datasetId && cameraPreferenceField?.trim()) {
        writeCameraPreferences(
          { sceneUpAxis: axis },
          datasetId,
          cameraPreferenceField,
        );
      } else {
        // Preserve the dataset-scoped fallback when the caller cannot
        // identify a media field yet.
        writeModalLayout({ sceneUpAxis: axis }, datasetId);
      }
    },
    [cameraPreferenceField, datasetId],
  );

  const onPreferredWorldFrameIdChange = useCallback(
    (frameId: string | null) => {
      setPreferredWorldFrameId(frameId);
      writeCameraPreferences(
        { preferredWorldFrameId: frameId ?? undefined },
        datasetId,
        cameraPreferenceField,
      );
    },
    [cameraPreferenceField, datasetId],
  );

  const onPreferredCameraTargetFrameIdChange = useCallback(
    (frameId: string) => {
      setPreferredCameraTargetFrameId(frameId);
      writeCameraPreferences(
        { preferredCameraTargetFrameId: frameId },
        datasetId,
        cameraPreferenceField,
      );
    },
    [cameraPreferenceField, datasetId],
  );

  const onDefaultTrackingModeChange = useCallback(
    (mode: Scene3dTrackingMode) => {
      setDefaultTrackingMode(mode);
      writeCameraPreferences(
        { defaultTrackingMode: mode },
        datasetId,
        cameraPreferenceField,
      );
    },
    [cameraPreferenceField, datasetId],
  );

  const onTimelineSamplingRateChange = useCallback(
    (rateHz: number) => {
      const normalized = normalizeTimelineSamplingRateHz(rateHz);
      setTimelineSamplingRateHz(normalized);
      writeModalLayout({ timelineSamplingRateHz: normalized }, datasetId);
    },
    [datasetId],
  );

  return {
    initialTiles: restored?.tiles ?? defaultTiles,
    initialManualTileTitles: restored?.manualTileTitles ?? {},
    initialLayout: restored?.layout ?? resolved.layout,
    initialExpandedTileId,
    resetTiles: defaultTiles,
    defaultLeftOpen: persisted?.leftSidebarOpen ?? true,
    onLeftOpenChange,
    defaultLeftSidebarWidth: persisted?.sidebarWidthPx,
    onLeftSidebarWidthChange,
    sceneUpAxis,
    onSceneUpAxisChange,
    preferredWorldFrameId,
    onPreferredWorldFrameIdChange,
    preferredCameraTargetFrameId,
    onPreferredCameraTargetFrameIdChange,
    defaultTrackingMode,
    onDefaultTrackingModeChange,
    timelineSamplingRateHz,
    onTimelineSamplingRateChange,
  };
}

/**
 * Materializes the resolver's tile descriptors into tiling entries,
 * threading each tile's assigned source into its render closure.
 */
function buildResolvedTiles(
  tiles: readonly PlaybackLayoutTile[],
  resolveTile: TileResolver,
): Record<string, TilingTile> {
  const result: Record<string, TilingTile> = {};
  for (const tile of tiles) {
    const definition = resolveTile(tile.tileType);
    if (!definition) continue;
    const Tile = definition.Tile;
    const initialSourceId = tile.initialSourceId;
    result[tile.id] = {
      render: () => <Tile initialSourceId={initialSourceId} />,
      title: tile.title,
      type: tile.tileType,
    };
  }
  return result;
}

/**
 * Prune a mosaic tree down to the leaves `isValidLeaf` accepts. Mosaic
 * trees are binary, so removing a leaf promotes its sibling into the
 * parent's slot (the parent's own split percentage goes with the
 * parent; surviving parents keep theirs). Returns `null` when nothing
 * survives.
 */
export function pruneMosaicLayout(
  node: MosaicNode<string>,
  isValidLeaf: (id: string) => boolean,
): MosaicNode<string> | null {
  if (typeof node === "string") return isValidLeaf(node) ? node : null;
  const first = pruneMosaicLayout(node.first, isValidLeaf);
  const second = pruneMosaicLayout(node.second, isValidLeaf);
  if (first !== null && second !== null) return { ...node, first, second };
  return first ?? second;
}

/**
 * Rebuild the tile entries a persisted mosaic tree references. Leaves
 * that can't render against the current scene — unknown tile type, no
 * source of that kind present, or no tile definition — are pruned from
 * the tree (sibling promotes into the parent's slot), so a layout saved
 * with a 3D stream still keeps its image tiles when opened on an
 * image-only recording instead of resetting, while never rendering dead
 * tiles. Only when nothing survives does the whole restore fall back to
 * the resolver defaults.
 *
 * Persistence stores the arrangement, not per-tile bindings, so
 * surviving image leaves rebind positionally (depth-first order of the
 * pruned tree) to the default-preferred sources of the current recording —
 * restored multi-camera layouts open on distinct streams
 * instead of all defaulting to the same one.
 */
function rebuildTilesFromLayout(
  layout: MosaicNode<string> | null | undefined,
  availableTileTypes: readonly TileType[],
  sources: readonly SceneSource[],
  resolveTile: TileResolver,
  tileTitles?: Readonly<Record<string, string>>,
): {
  layout: MosaicNode<string>;
  manualTileTitles: Record<string, string>;
  tiles: Record<string, TilingTile>;
} | null {
  if (layout === null || layout === undefined) return null;

  const availableTypes = new Set<string>(availableTileTypes);
  const isValidLeaf = (id: string): boolean => {
    const type = tileTypeFromId(id);
    if (!type) return false;
    const definition = resolveTile(type);
    return definition
      ? availableTypes.has(type)
      : isEpisodeTileExtensionId(type);
  };
  const pruned = pruneMosaicLayout(layout, isValidLeaf);
  if (pruned === null) return null;
  const tileIds = collectTileIds(pruned);
  if (tileIds.length === 0) return null;

  const rankedImages = rankDefaultImageSources(sources);
  let imageLeafIndex = 0;
  const manualTileTitles: Record<string, string> = {};
  const tiles: Record<string, TilingTile> = {};
  for (const id of tileIds) {
    const type = tileTypeFromId(id);
    if (!type) return null;
    const definition = resolveTile(type);
    const Tile = definition?.Tile ?? MissingTile;
    const initialSourceId =
      type === TILE_TYPE.IMAGE ? rankedImages[imageLeafIndex++]?.id : undefined;
    const restoredTitle = tileTitles?.[id];
    const title = restoredTitle ?? definition?.typeLabel ?? "Unavailable tile";
    if (restoredTitle) {
      manualTileTitles[id] = restoredTitle;
    }
    tiles[id] = {
      render: () => (
        <Tile
          initialSourceId={initialSourceId}
          unavailableType={definition ? undefined : type}
        />
      ),
      title,
      type,
    };
  }
  return { layout: pruned, manualTileTitles, tiles };
}

export interface ModalLayoutPersistenceProps {
  /** Persistence scope — same `datasetId` given to `useModalLayout`. */
  datasetId?: string;
}

/**
 * Non-visual observer that persists the tile arrangement. Render inside
 * the playback shell (any descendant of its TilingProvider), next to the
 * stream-registration children.
 *
 * Mosaic emits layout updates continuously while a divider is dragged,
 * so writes are debounced; the final state is flushed on unmount (modal
 * close / sample navigation).
 */
export function ModalLayoutPersistence({
  datasetId,
}: ModalLayoutPersistenceProps): React.ReactElement | null {
  const { expandedTileId, layout, manualTileTitles, tiles } = useTiling();
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const manualTileTitlesRef = useRef(manualTileTitles);
  manualTileTitlesRef.current = manualTileTitles;
  const expandedTileIdRef = useRef(expandedTileId);
  expandedTileIdRef.current = expandedTileId;
  const datasetIdRef = useRef(datasetId);
  datasetIdRef.current = datasetId;
  const store = useStore();

  // Restore persisted plot series into the shell-scoped atom for the
  // plot tiles that survived layout restore, then mirror atom changes
  // back to storage. Both live here because this component already owns
  // the layout write cadence and sits inside the TilingProvider's Jotai
  // store.
  const seededPlotKeyRef = useRef<string | null>(null);
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  useSeedPersistedTileAtom({
    atom: plotTileSeriesAtom,
    datasetIdRef,
    field: "plotSeries",
    seededKeyRef: seededPlotKeyRef,
    store,
    tilesRef,
  });

  const seededRawKeyRef = useRef<string | null>(null);
  useSeedPersistedTileAtom({
    atom: rawTileStreamAtom,
    datasetIdRef,
    field: "rawStreams",
    seededKeyRef: seededRawKeyRef,
    store,
    tilesRef,
  });

  const plotSeriesPatch = useCallback(
    (value: Readonly<Record<string, readonly PlotSeriesConfig[]>>) => ({
      plotSeries: compactPlotSeries(value),
    }),
    [],
  );
  useDebouncedLayoutAtomMirror({
    atom: plotTileSeriesAtom,
    datasetIdRef,
    patchForValue: plotSeriesPatch,
    seededKeyRef: seededPlotKeyRef,
    store,
  });

  const rawStreamsPatch = useCallback(
    (value: Readonly<Record<string, string>>) => ({ rawStreams: value }),
    [],
  );
  useDebouncedLayoutAtomMirror({
    atom: rawTileStreamAtom,
    datasetIdRef,
    patchForValue: rawStreamsPatch,
    seededKeyRef: seededRawKeyRef,
    store,
  });

  const seededExtensionSettingsKeyRef = useRef<string | null>(null);
  useSeedPersistedTileAtom({
    atom: episodeTileExtensionSettingsAtom,
    datasetIdRef,
    field: "extensionSettings",
    seededKeyRef: seededExtensionSettingsKeyRef,
    store,
    tilesRef,
  });

  const extensionSettingsPatch = useCallback(
    (value: Readonly<Record<string, unknown>>) => ({
      extensionSettings: sanitizeExtensionSettings(value),
    }),
    [],
  );
  useDebouncedLayoutAtomMirror({
    atom: episodeTileExtensionSettingsAtom,
    datasetIdRef,
    patchForValue: extensionSettingsPatch,
    seededKeyRef: seededExtensionSettingsKeyRef,
    store,
  });

  const seededLogKeyRef = useRef<string | null>(null);
  useSeedPersistedTileAtom({
    atom: logTileSettingsAtom,
    datasetIdRef,
    field: "logSettings",
    seededKeyRef: seededLogKeyRef,
    store,
    tilesRef,
  });

  const logSettingsPatch = useCallback(
    (value: Readonly<Record<string, LogTileSettings>>) => ({
      logSettings: compactLogSettings(value),
    }),
    [],
  );
  useDebouncedLayoutAtomMirror({
    atom: logTileSettingsAtom,
    datasetIdRef,
    patchForValue: logSettingsPatch,
    seededKeyRef: seededLogKeyRef,
    store,
  });

  const seededMapKeyRef = useRef<string | null>(null);
  useSeedPersistedTileAtom({
    atom: mapTileSettingsAtom,
    datasetIdRef,
    field: "mapSettings",
    seededKeyRef: seededMapKeyRef,
    store,
    tilesRef,
  });

  const mapSettingsPatch = useCallback(
    (value: Readonly<Record<string, MapTileSettings>>) => ({
      mapSettings: compactMapSettings(value),
    }),
    [],
  );
  useDebouncedLayoutAtomMirror({
    atom: mapTileSettingsAtom,
    datasetIdRef,
    patchForValue: mapSettingsPatch,
    seededKeyRef: seededMapKeyRef,
    store,
  });

  const seededScene3dSettingsKeyRef = useRef<string | null>(null);
  useSeedPersistedTileAtom({
    atom: scene3dTilePlaybackSettingsAtom,
    datasetIdRef,
    field: "scene3dSettings",
    seededKeyRef: seededScene3dSettingsKeyRef,
    store,
    tilesRef,
  });

  const scene3dSettingsPatch = useCallback(
    (
      value: Readonly<Record<string, Scene3dTilePlaybackSettings>>,
    ): Partial<PersistedModalLayout> => ({
      scene3dSettings: compactScene3dSettings(value),
    }),
    [],
  );
  useDebouncedLayoutAtomMirror({
    atom: scene3dTilePlaybackSettingsAtom,
    datasetIdRef,
    patchForValue: scene3dSettingsPatch,
    seededKeyRef: seededScene3dSettingsKeyRef,
    store,
  });

  // Write only after the layout actually changes from what this mount
  // started with. Restores can be PRUNED views of the saved arrangement
  // (e.g. an image-only sample drops the 3D leaf); persisting one without
  // a user edit would permanently delete the pruned leaves for the whole
  // dataset merely because an incompatible sample was viewed. Trees are a
  // handful of nodes, so content comparison is cheap.
  const initialLayoutKeyRef = useRef<string | null>(null);
  if (initialLayoutKeyRef.current === null) {
    initialLayoutKeyRef.current = JSON.stringify(layout ?? null);
  }
  const dirtyRef = useRef(false);
  if (
    !dirtyRef.current &&
    JSON.stringify(layout ?? null) !== initialLayoutKeyRef.current
  ) {
    dirtyRef.current = true;
  }
  const initialExpandedTileIdRef = useRef<string | null | undefined>(undefined);
  if (initialExpandedTileIdRef.current === undefined) {
    initialExpandedTileIdRef.current = expandedTileId;
  }
  const expandedDirtyRef = useRef(false);
  if (
    !expandedDirtyRef.current &&
    expandedTileId !== initialExpandedTileIdRef.current
  ) {
    expandedDirtyRef.current = true;
  }
  const manualTileTitlesKey = JSON.stringify(manualTileTitles);
  const initialManualTileTitlesKeyRef = useRef<string | null>(null);
  if (initialManualTileTitlesKeyRef.current === null) {
    initialManualTileTitlesKeyRef.current = manualTileTitlesKey;
  }
  const titleDirtyRef = useRef(false);
  if (
    !titleDirtyRef.current &&
    manualTileTitlesKey !== initialManualTileTitlesKeyRef.current
  ) {
    titleDirtyRef.current = true;
  }

  // This effect syncs the mosaic layout to localStorage (debounced) —
  // persistence is an external system, so an effect is the right tool.
  useEffect(() => {
    if (!dirtyRef.current) return undefined;
    const timeout = setTimeout(() => {
      writeModalLayout({ layout }, datasetId);
    }, LAYOUT_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [layout, datasetId]);

  // This effect syncs the fullscreen tile id separately from the layout.
  // Fullscreen is view state layered over the saved arrangement, so
  // toggling it must not overwrite the normal mosaic tree.
  useEffect(() => {
    if (!expandedDirtyRef.current) return undefined;
    const timeout = setTimeout(() => {
      writeModalLayout(
        { expandedTileId: expandedTileId ?? undefined },
        datasetId,
      );
    }, LAYOUT_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [expandedTileId, datasetId]);

  // This effect syncs user-authored tile titles to dataset-scoped
  // storage. Heuristic auto titles are intentionally omitted.
  useEffect(() => {
    if (!titleDirtyRef.current) return undefined;
    const timeout = setTimeout(() => {
      writeModalLayout({ tileTitles: { ...manualTileTitles } }, datasetId);
    }, LAYOUT_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [datasetId, manualTileTitles, manualTileTitlesKey]);

  // This effect flushes the latest layout on unmount so a pending
  // debounce can't drop the user's final arrangement.
  useEffect(
    () => () => {
      if (dirtyRef.current) {
        writeModalLayout({ layout: layoutRef.current }, datasetIdRef.current);
      }
      if (expandedDirtyRef.current) {
        writeModalLayout(
          { expandedTileId: expandedTileIdRef.current ?? undefined },
          datasetIdRef.current,
        );
      }
      if (titleDirtyRef.current) {
        writeModalLayout(
          { tileTitles: { ...manualTileTitlesRef.current } },
          datasetIdRef.current,
        );
      }
    },
    [],
  );

  return null;
}

const LAYOUT_WRITE_DEBOUNCE_MS = 500;

function compactPlotSeries(
  value: Readonly<Record<string, readonly PlotSeriesConfig[]>>,
): Record<string, readonly PlotSeriesConfig[]> {
  const compact: Record<string, readonly PlotSeriesConfig[]> = {};
  for (const [tileId, series] of Object.entries(value)) {
    if (series.length > 0) {
      compact[tileId] = series;
    }
  }
  return compact;
}

function compactLogSettings(
  value: Readonly<Record<string, LogTileSettings>>,
): Record<string, LogTileSettings> | undefined {
  const compact: Record<string, LogTileSettings> = {};
  for (const [tileId, settings] of Object.entries(value)) {
    const isDefault =
      settings.followPlayhead === DEFAULT_LOG_TILE_SETTINGS.followPlayhead &&
      settings.selectedLevels === DEFAULT_LOG_TILE_SETTINGS.selectedLevels &&
      settings.viewMode === DEFAULT_LOG_TILE_SETTINGS.viewMode &&
      settings.enabledDiagnosticStreams === undefined &&
      settings.enabledStreams === undefined;
    if (isDefault) {
      continue;
    }
    compact[tileId] = {
      followPlayhead: settings.followPlayhead,
      selectedLevels: settings.selectedLevels,
      viewMode: settings.viewMode,
      ...(settings.enabledDiagnosticStreams !== undefined
        ? { enabledDiagnosticStreams: settings.enabledDiagnosticStreams }
        : {}),
      ...(settings.enabledStreams !== undefined
        ? { enabledStreams: settings.enabledStreams }
        : {}),
    };
  }
  return Object.keys(compact).length > 0 ? compact : undefined;
}

function compactMapSettings(
  value: Readonly<Record<string, MapTileSettings>>,
): Record<string, MapTileSettings> | undefined {
  const compact: Record<string, MapTileSettings> = {};
  for (const [tileId, settings] of Object.entries(value)) {
    const baseLayer = settings.baseLayer ?? DEFAULT_MAP_TILE_SETTINGS.baseLayer;
    const isDefault =
      baseLayer === DEFAULT_MAP_TILE_SETTINGS.baseLayer &&
      settings.followEgo === DEFAULT_MAP_TILE_SETTINGS.followEgo &&
      settings.enabledStreams === undefined;
    if (isDefault) {
      continue;
    }
    compact[tileId] = {
      baseLayer,
      followEgo: settings.followEgo,
      ...(settings.enabledStreams !== undefined
        ? { enabledStreams: settings.enabledStreams }
        : {}),
    };
  }
  return Object.keys(compact).length > 0 ? compact : undefined;
}

function compactScene3dSettings(
  value: Readonly<Record<string, Scene3dTilePlaybackSettings>>,
): Record<string, Scene3dTilePlaybackSettings> | undefined {
  const compact: Record<string, Scene3dTilePlaybackSettings> = {};
  for (const [tileId, settings] of Object.entries(value)) {
    if (
      settings.smoothTrackedLabels ===
      DEFAULT_SCENE_3D_TILE_PLAYBACK_SETTINGS.smoothTrackedLabels
    ) {
      continue;
    }
    compact[tileId] = {
      smoothTrackedLabels: settings.smoothTrackedLabels,
    };
  }
  return Object.keys(compact).length > 0 ? compact : undefined;
}

type PersistedTileAtomField =
  | "extensionSettings"
  | "logSettings"
  | "mapSettings"
  | "plotSeries"
  | "rawStreams"
  | "scene3dSettings";

/**
 * Seeds tile-scoped atoms from the dataset entry once per modal mount.
 * Persistence is external state, so the effect intentionally owns the
 * read/seed boundary while callers provide the field-specific atom.
 */
function useSeedPersistedTileAtom<TileValue>({
  atom,
  datasetIdRef,
  field,
  seededKeyRef,
  store,
  tilesRef,
}: {
  readonly atom: PrimitiveAtom<Readonly<Record<string, TileValue>>>;
  readonly datasetIdRef: React.MutableRefObject<string | undefined>;
  readonly field: PersistedTileAtomField;
  readonly seededKeyRef: React.MutableRefObject<string | null>;
  readonly store: ReturnType<typeof useStore>;
  readonly tilesRef: React.MutableRefObject<Record<string, TilingTile>>;
}) {
  // This effect seeds one tile-scoped atom from persisted layout state.
  useEffect(() => {
    const persisted = readModalLayout(datasetIdRef.current)?.[field] as
      | Readonly<Record<string, TileValue>>
      | undefined;
    if (persisted) {
      store.set(atom, (previous) => {
        const next = { ...previous };
        for (const [tileId, value] of Object.entries(persisted) as [
          string,
          TileValue,
        ][]) {
          if (!(tileId in tilesRef.current) || next[tileId]) continue;
          next[tileId] = value;
        }
        return next;
      });
    }
    seededKeyRef.current = jsonKey(store.get(atom));
  }, [atom, datasetIdRef, field, seededKeyRef, store, tilesRef]);
}

/**
 * Mirrors a shell-scoped atom into persisted episode layout state after it
 * diverges from its seeded value. The unmount flush keeps the final edit
 * even when the modal closes before the debounce fires.
 */
function useDebouncedLayoutAtomMirror<Value>({
  atom,
  datasetIdRef,
  patchForValue,
  seededKeyRef,
  store,
}: {
  readonly atom: Atom<Value>;
  readonly datasetIdRef: React.MutableRefObject<string | undefined>;
  readonly patchForValue: (value: Value) => Partial<PersistedModalLayout>;
  readonly seededKeyRef: React.MutableRefObject<string | null>;
  readonly store: ReturnType<typeof useStore>;
}) {
  // This effect mirrors atom changes to storage and flushes them on cleanup.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let dirty = false;
    const currentPatch = () => patchForValue(store.get(atom));
    const unsubscribe = store.sub(atom, () => {
      const key = jsonKey(store.get(atom));
      if (!dirty && key === seededKeyRef.current) return;
      dirty = true;
      if (timeout !== null) clearTimeout(timeout);
      timeout = setTimeout(() => {
        writeModalLayout(currentPatch(), datasetIdRef.current);
      }, LAYOUT_WRITE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      if (dirty) {
        // Flush to the latest dataset scope; this observer intentionally
        // follows sample navigation without resubscribing the atom.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        writeModalLayout(currentPatch(), datasetIdRef.current);
      }
    };
  }, [atom, datasetIdRef, patchForValue, seededKeyRef, store]);
}

function jsonKey(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "__undefined__";
  } catch {
    return "__unserializable__";
  }
}
