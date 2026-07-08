import { collectTileIds, useTiling, type TilingTile } from "@fiftyone/tiling";
import { useStore, type Atom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MosaicNode } from "react-mosaic-component";
import type { ByteSourceReadProfile } from "../../../query/bytes";
import type { SceneSource } from "../../../scene-inventory";
import {
  DEFAULT_MCAP_3D_SCENE_UP_AXIS,
  type Mcap3dSceneUpAxis,
} from "./mcap-3d-scene-up";
import {
  mcapTileTypeFromId,
  readMcapModalLayout,
  writeMcapModalLayout,
  type McapPersistedModalLayout,
} from "./mcap-layout-persistence";
import {
  mcapPlotTileSeriesAtom,
  type McapPlotSeriesConfig,
} from "./mcap-plot-tile-state";
import { mcapRawTileTopicAtom } from "./mcap-raw-tile-state";
import { MCAP_TILE_TYPE } from "./mcap-tile-types";
import {
  collectPlaybackDeviceCapabilities,
  rankDefaultImageSources,
  resolvePlaybackLayout,
  type PlaybackDeviceCapabilities,
  type PlaybackLayoutTile,
} from "./playback-layout";
import { getMcapTileDefinition, mcapTileTypesFor } from "./use-mcap-tiles";

export interface McapModalLayout {
  initialTiles: Record<string, TilingTile>;
  /** User-authored titles to seed into the TilingProvider. */
  initialManualTileTitles: Record<string, string>;
  /** `undefined` lets the TilingProvider auto-lay-out `initialTiles`. */
  initialLayout: MosaicNode<string> | undefined;
  /** Tile id that should initially render expanded to fullscreen. */
  initialExpandedTileId: string | null;
  defaultLeftOpen: boolean;
  onLeftOpenChange: (open: boolean) => void;
  /** Persisted sidebar width; `undefined` keeps the shell's default. */
  defaultLeftSidebarWidth: number | undefined;
  onLeftSidebarWidthChange: (px: number) => void;
  sceneUpAxis: Mcap3dSceneUpAxis;
  onSceneUpAxisChange: (axis: Mcap3dSceneUpAxis) => void;
}

export interface UseMcapModalLayoutOptions {
  sources: readonly SceneSource[];
  /**
   * Persistence scope — `ctx.dataset.datasetId` (stable across dataset
   * renames, unlike the name) for the sample renderer, or an MCAP source key
   * for the explorer. Absent, reads/writes hit only the browser-wide fallback
   * entry.
   */
  datasetId?: string;
  /** Source locality hint; tightens the default tile budget when remote. */
  readProfile?: ByteSourceReadProfile;
  /** Capability override for tests; collected from the browser when absent. */
  capabilities?: PlaybackDeviceCapabilities;
}

/**
 * Mount-time layout state for the MCAP modal: the user's persisted
 * sidebar visibility and tile arrangement when one restores cleanly
 * against the current scene, the resolver's defaults otherwise — a
 * budgeted set of default-preferred image tiles plus one fused 3D tile,
 * arranged by MCAP's type-aware layout strategy and sized to the
 * machine, the source locality, and the viewport (see
 * `resolvePlaybackLayout`). Pair with
 * `<McapModalLayoutPersistence />` (inside the playback shell) to write
 * changes back.
 */
export function useMcapModalLayout({
  sources,
  datasetId,
  readProfile,
  capabilities,
}: UseMcapModalLayoutOptions): McapModalLayout {
  const presentTypes = useMemo(
    () => Array.from(new Set(sources.map((s) => s.type))),
    [sources],
  );
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
    () => buildResolvedTiles(resolved.tiles),
    [resolved],
  );
  // Re-read storage whenever the scene changes: the renderer persists
  // across sample navigation, so a new sample arrives as new sources on
  // the same mount and must pick up whatever the previous sample persisted.
  const persisted = useMemo(
    () => readMcapModalLayout(datasetId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sources is the storage-read trigger, not an input
    [datasetId, sources],
  );

  const restored = useMemo(
    () =>
      rebuildTilesFromLayout(
        persisted?.layout,
        presentTypes,
        sources,
        persisted?.tileTitles,
      ),
    [persisted, presentTypes, sources],
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
    persisted?.sceneUpAxis ?? DEFAULT_MCAP_3D_SCENE_UP_AXIS;
  const [sceneUpAxis, setSceneUpAxis] = useState(persistedSceneUpAxis);
  useEffect(() => {
    setSceneUpAxis(persistedSceneUpAxis);
  }, [datasetId, persistedSceneUpAxis]);

  const onLeftOpenChange = useCallback(
    (open: boolean) => {
      writeMcapModalLayout({ leftSidebarOpen: open }, datasetId);
    },
    [datasetId],
  );

  const onLeftSidebarWidthChange = useCallback(
    (px: number) => {
      writeMcapModalLayout({ sidebarWidthPx: px }, datasetId);
    },
    [datasetId],
  );

  const onSceneUpAxisChange = useCallback(
    (axis: Mcap3dSceneUpAxis) => {
      setSceneUpAxis(axis);
      writeMcapModalLayout({ sceneUpAxis: axis }, datasetId);
    },
    [datasetId],
  );

  return {
    initialTiles: restored?.tiles ?? defaultTiles,
    initialManualTileTitles: restored?.manualTileTitles ?? {},
    initialLayout: restored?.layout ?? resolved.layout,
    initialExpandedTileId,
    defaultLeftOpen: persisted?.leftSidebarOpen ?? true,
    onLeftOpenChange,
    defaultLeftSidebarWidth: persisted?.sidebarWidthPx,
    onLeftSidebarWidthChange,
    sceneUpAxis,
    onSceneUpAxisChange,
  };
}

/**
 * Materializes the resolver's tile descriptors into tiling entries,
 * threading each tile's assigned source into its render closure.
 */
function buildResolvedTiles(
  tiles: readonly PlaybackLayoutTile[],
): Record<string, TilingTile> {
  const result: Record<string, TilingTile> = {};
  for (const tile of tiles) {
    const definition = getMcapTileDefinition(tile.tileType);
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
 * with a 3D topic still keeps its image tiles when opened on an
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
  presentTypes: readonly string[],
  sources: readonly SceneSource[],
  tileTitles?: Readonly<Record<string, string>>,
): {
  layout: MosaicNode<string>;
  manualTileTitles: Record<string, string>;
  tiles: Record<string, TilingTile>;
} | null {
  if (layout === null || layout === undefined) return null;

  const availableTypes = new Set<string>(mcapTileTypesFor(presentTypes));
  const isValidLeaf = (id: string): boolean => {
    const type = mcapTileTypeFromId(id);
    if (!type || !availableTypes.has(type)) return false;
    return getMcapTileDefinition(type) !== null;
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
    const type = mcapTileTypeFromId(id);
    if (!type) return null;
    // Pruning guarantees every surviving leaf maps to a definition.
    const definition = getMcapTileDefinition(type);
    if (!definition) return null;
    const Tile = definition.Tile;
    const initialSourceId =
      type === MCAP_TILE_TYPE.IMAGE
        ? rankedImages[imageLeafIndex++]?.id
        : undefined;
    const restoredTitle = tileTitles?.[id];
    const title = restoredTitle ?? definition.typeLabel;
    if (restoredTitle) {
      manualTileTitles[id] = restoredTitle;
    }
    tiles[id] = {
      render: () => <Tile initialSourceId={initialSourceId} />,
      title,
      type,
    };
  }
  return { layout: pruned, manualTileTitles, tiles };
}

export interface McapModalLayoutPersistenceProps {
  /** Persistence scope — same `datasetId` given to `useMcapModalLayout`. */
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
export function McapModalLayoutPersistence({
  datasetId,
}: McapModalLayoutPersistenceProps): React.ReactElement | null {
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

  // This effect seeds the plot-series atom once per mount from the
  // persisted dataset entry — persistence is an external system.
  useEffect(() => {
    const persisted = readMcapModalLayout(datasetIdRef.current)?.plotSeries;
    if (persisted) {
      store.set(mcapPlotTileSeriesAtom, (previous) => {
        const next = { ...previous };
        for (const [tileId, series] of Object.entries(persisted)) {
          if (!(tileId in tilesRef.current) || next[tileId]) continue;
          next[tileId] = series;
        }
        return next;
      });
    }
    seededPlotKeyRef.current = JSON.stringify(
      store.get(mcapPlotTileSeriesAtom),
    );
  }, [store]);

  // This effect seeds the raw-tile topic atom once per mount from the
  // persisted dataset entry — same contract as the plot series above.
  const seededRawKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const persisted = readMcapModalLayout(datasetIdRef.current)?.rawTopics;
    if (persisted) {
      store.set(mcapRawTileTopicAtom, (previous) => {
        const next = { ...previous };
        for (const [tileId, topic] of Object.entries(persisted)) {
          if (!(tileId in tilesRef.current) || next[tileId]) continue;
          next[tileId] = topic;
        }
        return next;
      });
    }
    seededRawKeyRef.current = JSON.stringify(store.get(mcapRawTileTopicAtom));
  }, [store]);

  const plotSeriesPatch = useCallback(
    (value: Readonly<Record<string, readonly McapPlotSeriesConfig[]>>) => ({
      plotSeries: compactPlotSeries(value),
    }),
    [],
  );
  useDebouncedMcapLayoutAtomMirror({
    atom: mcapPlotTileSeriesAtom,
    datasetIdRef,
    patchForValue: plotSeriesPatch,
    seededKeyRef: seededPlotKeyRef,
    store,
  });

  const rawTopicsPatch = useCallback(
    (value: Readonly<Record<string, string>>) => ({ rawTopics: value }),
    [],
  );
  useDebouncedMcapLayoutAtomMirror({
    atom: mcapRawTileTopicAtom,
    datasetIdRef,
    patchForValue: rawTopicsPatch,
    seededKeyRef: seededRawKeyRef,
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
      writeMcapModalLayout({ layout }, datasetId);
    }, MCAP_LAYOUT_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [layout, datasetId]);

  // This effect syncs the fullscreen tile id separately from the layout.
  // Fullscreen is view state layered over the saved arrangement, so
  // toggling it must not overwrite the normal mosaic tree.
  useEffect(() => {
    if (!expandedDirtyRef.current) return undefined;
    const timeout = setTimeout(() => {
      writeMcapModalLayout(
        { expandedTileId: expandedTileId ?? undefined },
        datasetId,
      );
    }, MCAP_LAYOUT_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [expandedTileId, datasetId]);

  // This effect syncs user-authored tile titles to dataset-scoped
  // storage. Heuristic auto titles are intentionally omitted.
  useEffect(() => {
    if (!titleDirtyRef.current) return undefined;
    const timeout = setTimeout(() => {
      writeMcapModalLayout({ tileTitles: { ...manualTileTitles } }, datasetId);
    }, MCAP_LAYOUT_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [datasetId, manualTileTitles, manualTileTitlesKey]);

  // This effect flushes the latest layout on unmount so a pending
  // debounce can't drop the user's final arrangement.
  useEffect(
    () => () => {
      if (dirtyRef.current) {
        writeMcapModalLayout(
          { layout: layoutRef.current },
          datasetIdRef.current,
        );
      }
      if (expandedDirtyRef.current) {
        writeMcapModalLayout(
          { expandedTileId: expandedTileIdRef.current ?? undefined },
          datasetIdRef.current,
        );
      }
      if (titleDirtyRef.current) {
        writeMcapModalLayout(
          { tileTitles: { ...manualTileTitlesRef.current } },
          datasetIdRef.current,
        );
      }
    },
    [],
  );

  return null;
}

const MCAP_LAYOUT_WRITE_DEBOUNCE_MS = 500;

function compactPlotSeries(
  value: Readonly<Record<string, readonly McapPlotSeriesConfig[]>>,
): Record<string, readonly McapPlotSeriesConfig[]> {
  const compact: Record<string, readonly McapPlotSeriesConfig[]> = {};
  for (const [tileId, series] of Object.entries(value)) {
    if (series.length > 0) {
      compact[tileId] = series;
    }
  }
  return compact;
}

/**
 * Mirrors a shell-scoped atom into persisted MCAP layout state after it
 * diverges from its seeded value. The unmount flush keeps the final edit
 * even when the modal closes before the debounce fires.
 */
function useDebouncedMcapLayoutAtomMirror<Value>({
  atom,
  datasetIdRef,
  patchForValue,
  seededKeyRef,
  store,
}: {
  readonly atom: Atom<Value>;
  readonly datasetIdRef: React.MutableRefObject<string | undefined>;
  readonly patchForValue: (value: Value) => Partial<McapPersistedModalLayout>;
  readonly seededKeyRef: React.MutableRefObject<string | null>;
  readonly store: ReturnType<typeof useStore>;
}) {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let dirty = false;
    const currentPatch = () => patchForValue(store.get(atom));
    const unsubscribe = store.sub(atom, () => {
      const key = JSON.stringify(store.get(atom));
      if (!dirty && key === seededKeyRef.current) return;
      dirty = true;
      if (timeout !== null) clearTimeout(timeout);
      timeout = setTimeout(() => {
        writeMcapModalLayout(currentPatch(), datasetIdRef.current);
      }, MCAP_LAYOUT_WRITE_DEBOUNCE_MS);
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
        writeMcapModalLayout(currentPatch(), datasetIdRef.current);
      }
    };
  }, [atom, datasetIdRef, patchForValue, seededKeyRef, store]);
}
