import { Provider as JotaiProvider, createStore } from "jotai";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { registeredTilesAtom, tileSelectionAtom } from "./atoms";
import type {
  AddTileOptions,
  SetTileTitleOptions,
  TilingContextValue,
  TilingTile,
} from "./types";

export type { AddTileOptions, TilingContextValue, TilingTile } from "./types";

const TilingContext = createContext<TilingContextValue | null>(null);

/** Internal context carrying the current tile id down to a tile's body. */
const TileIdContext = createContext<string | null>(null);

export interface TilingProviderProps {
  /** Initial tile entries keyed by id. */
  initialTiles?: Record<string, TilingTile>;
  /** Initial user-authored titles keyed by tile id. */
  initialManualTileTitles?: Record<string, string>;
  /** Initial layout tree. If omitted, auto-laid out from `initialTiles`. */
  initialLayout?: MosaicNode<string> | null;
  /** Tile id that should initially render expanded to fullscreen. */
  initialExpandedTileId?: string | null;
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
  initialLayout,
  initialExpandedTileId,
  children,
}) => {
  const initialLayoutValue =
    initialLayout === undefined
      ? autoLayoutFn(Object.keys(initialTiles))
      : initialLayout;
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
  const jotaiStore = useMemo(() => createStore(), []);
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
          tileSelectionAtom.remove(id);
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
        idPrefix = "tile",
        targetId,
        focus = true,
        direction,
      }: AddTileOptions = {},
    ): string => {
      const id = `${idPrefix}-${counterRef.current++}`;
      setTiles((prev) => ({ ...prev, [id]: tile }));
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
   * Fresh same-kind tile from the registry, keyed by the id's
   * `<type>-<n>` prefix. `null` when the kind was never registered.
   */
  const freshTileOfSameKind = useCallback(
    (tileId: string): { tile: TilingTile; idPrefix: string } | null => {
      const type = tileTypeFromId(tileId);
      if (!type) return null;
      const entry = jotaiStore
        .get(registeredTilesAtom)
        .find((registered) => registered.type === type);
      if (!entry) return null;
      const TileComponent = entry.Tile;
      return {
        idPrefix: entry.type,
        tile: { title: entry.typeLabel, render: () => <TileComponent /> },
      };
    },
    [jotaiStore],
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
      return addTile(factory(), {
        direction,
        idPrefix: tileTypeFromId(tileId) ?? "tile",
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
      const newId = addTile(tile, {
        idPrefix: tileTypeFromId(tileId) ?? "tile",
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
      if (tileTypeFromId(tileId) === type) {
        return tileId;
      }
      if (
        !tilesRef.current[tileId] ||
        !collectTileIds(layoutRef.current).includes(tileId)
      ) {
        return null;
      }
      const entry = jotaiStore
        .get(registeredTilesAtom)
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
          title: entry.typeLabel,
          render: () => <TileComponent />,
        };
        return next;
      });
      setManualTileTitles((prev) => omitKeys(prev, [tileId]));
      setLayoutState((prev) => (prev ? replaceTileId(prev, tileId, id) : prev));
      setFocusedTileId(id);
      setExpandedTileId((current) => (current === tileId ? id : current));
      tileSelectionAtom.remove(tileId);
      duplicatorsRef.current.delete(tileId);
      return id;
    },
    [jotaiStore],
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

  const removeTile = useCallback((id: string) => {
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
    tileSelectionAtom.remove(id);
    duplicatorsRef.current.delete(id);
  }, []);

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
    setLayoutState(autoLayoutFn(Object.keys(tilesRef.current)));
    setExpandedTileId(null);
  }, []);

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

  return (
    <JotaiProvider store={jotaiStore}>
      <TilingContext.Provider value={value}>{children}</TilingContext.Provider>
    </JotaiProvider>
  );
};

/**
 * The `<type>` prefix of a `<type>-<n>` mosaic leaf id (`camera-2` →
 * `camera`), or `null` when the id doesn't follow the convention.
 */
export function tileTypeFromId(tileId: string): string | null {
  const match = /^(.+)-\d+$/.exec(tileId);
  return match ? match[1] : null;
}

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
