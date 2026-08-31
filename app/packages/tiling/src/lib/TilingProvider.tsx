import { Provider as JotaiProvider, createStore, useStore } from "jotai";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { MosaicNode } from "react-mosaic-component";
import {
  addTileToLayout,
  autoLayout as autoLayoutFn,
  collectTileIds,
} from "../views/MosaicGrid/MosaicGrid";
import { registeredTilesAtom, tileScopedKey, tileSelectionAtom } from "./atoms";
import type {
  AddTileOptions,
  SetTileTitleOptions,
  TilingAutoLayoutStrategy,
  TilingContextValue,
  TilingLayoutMetrics,
  TilingTile,
} from "./types";

export type {
  AddTileOptions,
  TilingAutoLayoutStrategy,
  TilingContextValue,
  TilingTile,
} from "./types";

const TilingContext = createContext<TilingContextValue | null>(null);

/** Internal context carrying the current tile id down to a tile's body. */
const TileIdContext = createContext<string | null>(null);

/**
 * Identifies which `<TilingProvider>` a subtree belongs to, so per-tile
 * and per-registry atoms stay separate when several providers share one
 * Jotai store (see `isolateStore`). Providers that own an isolated store
 * still carry a scope — harmless, and it keeps the atom keys uniform.
 */
const TileScopeContext = createContext<string>("default");

/** Scope id of the nearest `<TilingProvider>`. */
export function useTileScopeId(): string {
  return useContext(TileScopeContext);
}

export interface TilingProviderProps {
  /** Initial tile entries keyed by id. */
  initialTiles?: Record<string, TilingTile>;
  /** Initial user-authored titles keyed by tile id. */
  initialManualTileTitles?: Record<string, string>;
  /** Optional host-specific layout builder used by "Auto Layout". */
  autoLayoutStrategy?: TilingAutoLayoutStrategy;
  /** Initial layout tree. If omitted, auto-laid out from `initialTiles`. */
  initialLayout?: MosaicNode<string> | null;
  /** Tile id that should initially render expanded to fullscreen. */
  initialExpandedTileId?: string | null;
  /** Tile entries restored by "Reset Layout". Defaults to `initialTiles`. */
  resetTiles?: Record<string, TilingTile>;
  /** Manual titles restored by "Reset Layout". Defaults to the initial titles. */
  resetManualTileTitles?: Record<string, string>;
  /** Layout restored by "Reset Layout". Defaults to the initial layout. */
  resetLayout?: MosaicNode<string> | null;
  /** Optional geometry-aware builder for the Reset Layout arrangement. */
  resetLayoutStrategy?: TilingAutoLayoutStrategy;
  /**
   * Whether the provider owns a private Jotai store. Default `true` —
   * the historical behavior, right for standalone surfaces (the MCAP
   * modal, the MCAP Explorer panel, stories).
   *
   * Pass `false` when the shell is embedded in a host that already has
   * modal- or app-scoped Jotai atoms its own chrome reads and writes
   * (`fos.modalMode`, lighter scene atoms, the annotate label list). A
   * private store would shadow those: the host's atoms would resolve
   * against the tiling store and silently read their initial values.
   * Tiling's own atoms stay separate via {@link useTileScopeId}, so
   * sharing the host store is safe.
   */
  isolateStore?: boolean;
  children: React.ReactNode;
}

/**
 * Orchestrates all tiling-level state for an app: layout tree, tile
 * entries, focused tile, and per-tile settings panels. Designed so a
 * consuming page is just glue:
 *
 * ```tsx
 * <TilingProvider initialTiles={...}>
 *   <Layout />  // pulls everything from useTiling()
 * </TilingProvider>
 * ```
 */
export const TilingProvider: React.FC<TilingProviderProps> = ({
  initialTiles = {},
  initialManualTileTitles = {},
  autoLayoutStrategy,
  initialLayout,
  initialExpandedTileId,
  resetTiles,
  resetManualTileTitles,
  resetLayout: resetLayoutProp,
  resetLayoutStrategy,
  isolateStore = true,
  children,
}) => {
  const scopeId = useId();

  // Release the scope's registry entry on unmount, the same way `removeTile` /
  // `resetLayout` release per-tile `tileSelectionAtom` entries. Without this
  // every modal or panel that mounts a provider leaves an `atomFamily` entry
  // behind for the rest of the session.
  useEffect(
    () => () => {
      registeredTilesAtom.remove(scopeId);
    },
    [scopeId],
  );
  const initialLayoutValueRef = useRef<MosaicNode<string> | null | undefined>(
    undefined,
  );
  if (initialLayoutValueRef.current === undefined) {
    initialLayoutValueRef.current =
      initialLayout === undefined
        ? (autoLayoutStrategy ?? autoLayoutFn)(Object.keys(initialTiles))
        : initialLayout;
  }
  const initialLayoutValue = initialLayoutValueRef.current;
  const resetTilesValueRef = useRef(resetTiles ?? initialTiles);
  const resetManualTileTitlesValueRef = useRef(
    filterManualTitles(
      resetManualTileTitles ?? initialManualTileTitles,
      resetTilesValueRef.current,
    ),
  );
  const resetLayoutValueRef = useRef<MosaicNode<string> | null | undefined>(
    undefined,
  );
  if (resetLayoutValueRef.current === undefined) {
    if (resetLayoutProp !== undefined) {
      resetLayoutValueRef.current = resetLayoutProp;
    } else if (resetTiles === undefined) {
      resetLayoutValueRef.current = initialLayoutValue;
    } else {
      resetLayoutValueRef.current = (autoLayoutStrategy ?? autoLayoutFn)(
        Object.keys(resetTilesValueRef.current),
      );
    }
  }
  const [tiles, setTiles] = useState<Record<string, TilingTile>>(initialTiles);
  const [manualTileTitles, setManualTileTitles] = useState<
    Record<string, string>
  >(() => filterManualTitles(initialManualTileTitles, initialTiles));
  const [layout, setLayoutState] = useState<MosaicNode<string> | null>(
    initialLayoutValue,
  );
  const [expandedTileId, setExpandedTileId] = useState<string | null>(
    initialExpandedTileId &&
      collectTileIds(initialLayoutValue).includes(initialExpandedTileId)
      ? initialExpandedTileId
      : null,
  );
  const [focusedTileId, setFocusedTileId] = useState<string | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // Mirror `focusedTileId` in a ref so `addTile` can resolve the target
  // tile without nesting a `setLayoutState` inside the `setFocusedTileId`
  // updater (state updaters must remain pure; nested setState calls
  // duplicate in Strict Mode).
  const focusedTileIdRef = useRef<string | null>(null);
  // This effect mirrors focusedTileId into a ref for stable addTile calls.
  useEffect(() => {
    focusedTileIdRef.current = focusedTileId;
  }, [focusedTileId]);
  // Per-instance Jotai store so multiple <TilingProvider>s on the same
  // page each get isolated atom state (sources, selections, registry).
  // When the host opts out (`isolateStore={false}`), we read and write
  // the surrounding store instead — `useStore()` resolves against the
  // provider ABOVE this component, so it's the host's store either way,
  // never the one created here.
  const hostStore = useStore();
  const ownStoreRef = useRef<ReturnType<typeof createStore> | null>(null);
  if (isolateStore && ownStoreRef.current === null) {
    ownStoreRef.current = createStore();
  }
  const jotaiStore = isolateStore
    ? (ownStoreRef.current as ReturnType<typeof createStore>)
    : hostStore;
  // Portal target the settings sidebar registers; `<TileSettingsContent>`
  // children render here when their tile is focused.
  const [settingsSlotEl, setSettingsSlotEl] = useState<HTMLElement | null>(
    null,
  );
  // Seed the counter past any `<prefix>-<n>` suffix in the initial tiles,
  // so the first `addTile("camera", ...)` against `{ "camera-1": ... }`
  // produces `camera-2` instead of colliding with `camera-1`. Walks every
  // initial id once at mount; later additions just `counterRef.current++`.
  const counterRef = useRef(
    Object.keys(initialTiles).reduce((max, id) => {
      const m = id.match(/-(\d+)$/);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0) + 1,
  );
  // Always-current ref so autoLayout stays referentially stable — avoids
  // stale captures in useMemo dependency-suppressed consumers (TilingHeader).
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const autoLayoutStrategyRef = useRef(autoLayoutStrategy);
  autoLayoutStrategyRef.current = autoLayoutStrategy;
  const resetLayoutStrategyRef = useRef(resetLayoutStrategy);
  resetLayoutStrategyRef.current = resetLayoutStrategy;
  const layoutMetricsRef = useRef<TilingLayoutMetrics | null>(null);
  const setLayoutMetrics = useCallback(
    (metrics: TilingLayoutMetrics | null) => {
      layoutMetricsRef.current = metrics;
    },
    [],
  );
  const manualTileTitlesRef = useRef(manualTileTitles);
  manualTileTitlesRef.current = manualTileTitles;

  /**
   * Layout setter that also reconciles the entries map (drops orphans
   * after a close / drag) and clears focus when the focused tile was
   * removed. This is the function MosaicGrid wires to `onChange`.
   */
  const setLayout = useCallback(
    (next: MosaicNode<string> | null) => {
      setLayoutState(next);
      const presentIds = new Set(collectTileIds(next));
      // Diff outside the setTiles updater. React doesn't run state
      // updaters synchronously (and Strict Mode replays them), so
      // side effects belong here, not inside.
      const idsToRemove = Object.keys(tiles).filter(
        (id) => !presentIds.has(id),
      );
      if (idsToRemove.length > 0) {
        setTiles((prev) => {
          const filtered = { ...prev };
          for (const id of idsToRemove) delete filtered[id];
          return filtered;
        });
        setManualTileTitles((prev) => omitKeys(prev, idsToRemove));
        // Free per-tile atomFamily entries so dynamic tile ids don't
        // accumulate in the store across long sessions.
        for (const id of idsToRemove) {
          tileSelectionAtom.remove(tileScopedKey(scopeId, id));
          duplicatorsRef.current.delete(id);
        }
      }
      setFocusedTileId((current) =>
        current && presentIds.has(current) ? current : null,
      );
      setExpandedTileId((current) =>
        current && presentIds.has(current) ? current : null,
      );
    },
    [tiles],
  );

  const addTile = useCallback(
    (
      tile: TilingTile,
      {
        idPrefix = tile.type ?? "tile",
        targetId,
        focus = true,
        direction,
      }: AddTileOptions = {},
    ): string => {
      const id = `${idPrefix}-${counterRef.current++}`;
      const tileWithType = tile.type ? tile : { ...tile, type: idPrefix };
      setTiles((prev) => ({ ...prev, [id]: tileWithType }));
      // Resolve target from the focus ref (no nested setState inside
      // setFocusedTileId — that would violate updater purity).
      const target =
        targetId !== undefined ? targetId : focusedTileIdRef.current;
      setLayoutState((prev) => addTileToLayout(prev, id, target, direction));
      if (focus) setFocusedTileId(id);
      return id;
    },
    [],
  );

  // Per-tile duplicate factories, registered by tile bodies (see
  // `useTileDuplicator`). A ref, not state: registration happens in
  // effects and must never re-render the provider.
  const duplicatorsRef = useRef(new Map<string, () => TilingTile>());

  const registerTileDuplicator = useCallback(
    (tileId: string, factory: () => TilingTile) => {
      duplicatorsRef.current.set(tileId, factory);
      return () => {
        if (duplicatorsRef.current.get(tileId) === factory) {
          duplicatorsRef.current.delete(tileId);
        }
      };
    },
    [],
  );

  /**
   * Fresh same-kind tile from the registry, keyed by the tile entry's
   * registered `type`. `null` when the kind was never registered.
   */
  const freshTileOfSameKind = useCallback(
    (tileId: string): { tile: TilingTile; idPrefix: string } | null => {
      const type = tilesRef.current[tileId]?.type;
      if (!type) return null;
      const entry = jotaiStore
        .get(registeredTilesAtom(scopeId))
        .find((registered) => registered.type === type);
      if (!entry) return null;
      const TileComponent = entry.Tile;
      return {
        idPrefix: entry.type,
        tile: {
          render: () => <TileComponent />,
          title: entry.typeLabel,
          type: entry.type,
        },
      };
    },
    [jotaiStore, scopeId],
  );

  const splitTile = useCallback(
    (tileId: string, direction: "row" | "column"): string | null => {
      // A split spawns a FRESH instance (the new tile picks its own
      // default content — e.g. the next undisplayed stream), unlike
      // duplicate, which clones the origin's bindings.
      const fresh = freshTileOfSameKind(tileId);
      if (fresh) {
        return addTile(fresh.tile, {
          direction,
          idPrefix: fresh.idPrefix,
          targetId: tileId,
        });
      }
      const factory = duplicatorsRef.current.get(tileId);
      if (!factory) return null;
      const idPrefix = tilesRef.current[tileId]?.type ?? "tile";
      return addTile(factory(), {
        direction,
        idPrefix,
        targetId: tileId,
      });
    },
    [addTile, freshTileOfSameKind],
  );

  const duplicateTile = useCallback(
    (tileId: string): string | null => {
      const factory = duplicatorsRef.current.get(tileId);
      const manualTitle = manualTileTitlesRef.current[tileId];
      const baseTile = factory ? factory() : freshTileOfSameKind(tileId)?.tile;
      const tile =
        baseTile && manualTitle
          ? { ...baseTile, title: manualTitle }
          : baseTile;
      if (!tile) return null;
      const idPrefix = tilesRef.current[tileId]?.type ?? "tile";
      const newId = addTile(tile, {
        idPrefix,
        targetId: tileId,
      });
      if (manualTitle) {
        setManualTileTitles((prev) => ({ ...prev, [newId]: manualTitle }));
      }
      return newId;
    },
    [addTile, freshTileOfSameKind],
  );

  const changeTileType = useCallback(
    (tileId: string, type: string): string | null => {
      if (tilesRef.current[tileId]?.type === type) {
        return tileId;
      }
      if (
        !tilesRef.current[tileId] ||
        !collectTileIds(layoutRef.current).includes(tileId)
      ) {
        return null;
      }
      const entry = jotaiStore
        .get(registeredTilesAtom(scopeId))
        .find((registered) => registered.type === type);
      if (!entry) {
        return null;
      }

      const id = `${entry.type}-${counterRef.current++}`;
      const TileComponent = entry.Tile;
      setTiles((prev) => {
        if (!(tileId in prev)) return prev;
        const next = { ...prev };
        delete next[tileId];
        next[id] = {
          render: () => <TileComponent />,
          title: entry.typeLabel,
          type: entry.type,
        };
        return next;
      });
      setManualTileTitles((prev) => omitKeys(prev, [tileId]));
      setLayoutState((prev) => (prev ? replaceTileId(prev, tileId, id) : prev));
      setFocusedTileId(id);
      setExpandedTileId((current) => (current === tileId ? id : current));
      tileSelectionAtom.remove(tileScopedKey(scopeId, tileId));
      duplicatorsRef.current.delete(tileId);
      return id;
    },
    [jotaiStore, scopeId],
  );

  const closeOtherTiles = useCallback(
    (tileId: string) => {
      // Collapsing the tree to the single leaf lets setLayout's
      // reconciliation drop the other tiles and their atom entries.
      setLayout(tileId);
      setFocusedTileId(tileId);
      setExpandedTileId(null);
    },
    [setLayout],
  );

  const removeTile = useCallback(
    (id: string) => {
      setTiles((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setLayoutState((prev) => {
        if (prev === null) return null;
        if (typeof prev === "string") return prev === id ? null : prev;
        // Walk the tree, collapsing the parent split when one child is removed.
        const stripped = stripTile(prev, id);
        return stripped;
      });
      setFocusedTileId((current) => (current === id ? null : current));
      setExpandedTileId((current) => (current === id ? null : current));
      setManualTileTitles((prev) => omitKeys(prev, [id]));
      // Release the per-tile atomFamily entry so the store doesn't
      // grow unbounded across long sessions.
      tileSelectionAtom.remove(tileScopedKey(scopeId, id));
      duplicatorsRef.current.delete(id);
    },
    [scopeId],
  );

  const setTileTitle = useCallback(
    (
      tileId: string,
      title: string,
      { source = "manual" }: SetTileTitleOptions = {},
    ) => {
      if (!tilesRef.current[tileId]) return;
      if (source === "auto" && manualTileTitlesRef.current[tileId]) return;
      setTiles((prev) => {
        const tile = prev[tileId];
        if (!tile || tile.title === title) return prev;
        return { ...prev, [tileId]: { ...tile, title } };
      });
      if (source === "manual") {
        setManualTileTitles((prev) =>
          prev[tileId] === title ? prev : { ...prev, [tileId]: title },
        );
      }
    },
    [],
  );

  const autoLayout = useCallback(() => {
    // Derive from the tiles map, not from the layout tree — a tile
    // entry can exist in `tiles` without being placed in the tree
    // yet (e.g. when `initialLayout` is null or partial), and we
    // don't want auto-layout to silently drop it.
    // Read from ref so this callback stays stable across tile additions,
    // avoiding stale captures in useMemo consumers that suppress deps.
    const strategy: TilingAutoLayoutStrategy =
      autoLayoutStrategyRef.current ?? autoLayoutFn;
    const tileIds = Object.keys(tilesRef.current);
    setLayoutState(
      applyLayoutStrategy(strategy, tileIds, layoutMetricsRef.current),
    );
    setExpandedTileId(null);
  }, []);

  const resetLayout = useCallback(() => {
    const defaultTileIds = Object.keys(resetTilesValueRef.current);
    const resetTileIds = new Set(defaultTileIds);
    for (const tileId of Object.keys(tilesRef.current)) {
      if (!resetTileIds.has(tileId)) {
        tileSelectionAtom.remove(tileScopedKey(scopeId, tileId));
        duplicatorsRef.current.delete(tileId);
      }
    }
    setTiles({ ...resetTilesValueRef.current });
    setManualTileTitles({ ...resetManualTileTitlesValueRef.current });
    const strategy = resetLayoutStrategyRef.current;
    setLayoutState(
      strategy
        ? applyLayoutStrategy(
            strategy,
            defaultTileIds,
            layoutMetricsRef.current,
          )
        : (resetLayoutValueRef.current ?? null),
    );
    setFocusedTileId(null);
    setExpandedTileId(null);
  }, [scopeId]);

  const value = useMemo<TilingContextValue>(
    () => ({
      layout,
      tiles,
      focusedTileId,
      expandedTileId,
      setLayout,
      setFocusedTileId,
      setExpandedTileId,
      addTile,
      removeTile,
      autoLayout,
      resetLayout,
      setLayoutMetrics,
      splitTile,
      duplicateTile,
      changeTileType,
      closeOtherTiles,
      registerTileDuplicator,
      settingsSlotEl,
      setSettingsSlotEl,
      manualTileTitles,
      setTileTitle,
    }),
    [
      layout,
      tiles,
      focusedTileId,
      expandedTileId,
      setLayout,
      addTile,
      removeTile,
      autoLayout,
      resetLayout,
      setLayoutMetrics,
      splitTile,
      duplicateTile,
      changeTileType,
      closeOtherTiles,
      registerTileDuplicator,
      settingsSlotEl,
      manualTileTitles,
      setTileTitle,
    ],
  );

  const scoped = (
    <TileScopeContext.Provider value={scopeId}>
      <TilingContext.Provider value={value}>{children}</TilingContext.Provider>
    </TileScopeContext.Provider>
  );

  // Only wrap in a JotaiProvider when we own the store. Wrapping with the
  // host's own store would work but is pointless indirection; NOT wrapping
  // is what lets the host's modal-scoped atoms resolve normally.
  return isolateStore ? (
    <JotaiProvider store={jotaiStore}>{scoped}</JotaiProvider>
  ) : (
    scoped
  );
};

/**
 * Remove a tile id from the layout tree. If a split node ends up with
 * one child after removal, the split collapses into that child.
 */
function stripTile(
  node: MosaicNode<string>,
  id: string,
): MosaicNode<string> | null {
  if (typeof node === "string") return node === id ? null : node;
  const first = stripTile(node.first, id);
  const second = stripTile(node.second, id);
  if (first === null && second === null) return null;
  if (first === null) return second;
  if (second === null) return first;
  return { ...node, first, second };
}

function replaceTileId(
  node: MosaicNode<string>,
  oldId: string,
  newId: string,
): MosaicNode<string> {
  if (typeof node === "string") {
    return node === oldId ? newId : node;
  }
  return {
    ...node,
    first: replaceTileId(node.first, oldId, newId),
    second: replaceTileId(node.second, oldId, newId),
  };
}

function applyLayoutStrategy(
  strategy: TilingAutoLayoutStrategy,
  tileIds: readonly string[],
  metrics: TilingLayoutMetrics | null,
): MosaicNode<string> | null {
  return metrics ? strategy(tileIds, metrics) : strategy(tileIds);
}

function filterManualTitles(
  titles: Record<string, string>,
  tiles: Record<string, TilingTile>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [id, title] of Object.entries(titles)) {
    if (tiles[id] && title.length > 0) {
      result[id] = title;
    }
  }
  return result;
}

function omitKeys<T>(
  source: Readonly<Record<string, T>>,
  keys: readonly string[],
): Record<string, T> {
  if (keys.length === 0) {
    return source as Record<string, T>;
  }
  let changed = false;
  const next = { ...source };
  for (const key of keys) {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? next : (source as Record<string, T>);
}

/** Reads the tiling context. Throws if used outside a `TilingProvider`. */
export function useTiling(): TilingContextValue {
  const ctx = useContext(TilingContext);
  if (!ctx) {
    throw new Error("useTiling must be used inside <TilingProvider>");
  }
  return ctx;
}

/**
 * Wraps children with the tile-id context so descendants can call
 * `useTileSettings` without knowing the id explicitly. Used by
 * `MosaicGrid` to scope each rendered tile.
 */
export const TileIdScope: React.FC<{
  tileId: string;
  children: React.ReactNode;
}> = ({ tileId, children }) => (
  <TileIdContext.Provider value={tileId}>{children}</TileIdContext.Provider>
);

/** The current tile's id, or `null` outside a `TileIdScope`. */
export function useTileId(): string | null {
  return useContext(TileIdContext);
}

/**
 * Portals its children into the settings sidebar when the surrounding
 * tile is focused. State flows through normal React props from the
 * tile body — no shared store needed.
 */
export const TileSettingsContent: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const tileId = useTileId();
  const { focusedTileId, settingsSlotEl } = useTiling();
  if (!tileId || tileId !== focusedTileId || !settingsSlotEl) return null;
  return createPortal(
    <div onPointerDown={stopPortalEvent}>{children}</div>,
    settingsSlotEl,
  );
};

function stopPortalEvent(event: React.SyntheticEvent) {
  event.stopPropagation();
}
