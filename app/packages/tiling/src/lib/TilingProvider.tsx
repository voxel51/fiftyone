import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MosaicNode } from "react-mosaic-component";
import {
  addTileToLayout,
  autoLayout as autoLayoutFn,
  collectTileIds,
} from "../views/MosaicGrid/MosaicGrid";
import type {
  AddTileOptions,
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
  /** Initial layout tree. If omitted, auto-laid out from `initialTiles`. */
  initialLayout?: MosaicNode<string> | null;
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
  initialLayout,
  children,
}) => {
  const [tiles, setTiles] = useState<Record<string, TilingTile>>(initialTiles);
  const [layout, setLayoutState] = useState<MosaicNode<string> | null>(
    initialLayout === undefined
      ? autoLayoutFn(Object.keys(initialTiles))
      : initialLayout
  );
  const [focusedTileId, setFocusedTileId] = useState<string | null>(null);
  const [settings, setSettings] = useState<
    Record<string, React.ComponentType>
  >({});
  // Seed the counter past any `<prefix>-<n>` suffix in the initial tiles,
  // so the first `addTile("camera", ...)` against `{ "camera-1": ... }`
  // produces `camera-2` instead of colliding with `camera-1`. Walks every
  // initial id once at mount; later additions just `counterRef.current++`.
  const counterRef = useRef(
    Object.keys(initialTiles).reduce((max, id) => {
      const m = id.match(/-(\d+)$/);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0) + 1
  );

  /**
   * Layout setter that also reconciles the entries map (drops orphans
   * after a close / drag) and clears focus when the focused tile was
   * removed. This is the function MosaicGrid wires to `onChange`.
   */
  const setLayout = useCallback((next: MosaicNode<string> | null) => {
    setLayoutState(next);
    const presentIds = new Set(collectTileIds(next));
    setTiles((prev) => {
      let changed = false;
      const filtered: Record<string, TilingTile> = {};
      for (const [id, entry] of Object.entries(prev)) {
        if (presentIds.has(id)) {
          filtered[id] = entry;
        } else {
          changed = true;
        }
      }
      return changed ? filtered : prev;
    });
    setFocusedTileId((current) =>
      current && presentIds.has(current) ? current : null
    );
  }, []);

  const addTile = useCallback(
    (
      tile: TilingTile,
      { idPrefix = "tile", targetId, focus = true }: AddTileOptions = {}
    ): string => {
      const id = `${idPrefix}-${counterRef.current++}`;
      setTiles((prev) => ({ ...prev, [id]: tile }));
      // Resolve target inside a functional setLayout so we don't capture
      // a stale focusedTileId.
      setFocusedTileId((currentFocused) => {
        const target = targetId !== undefined ? targetId : currentFocused;
        setLayoutState((prev) => addTileToLayout(prev, id, target));
        return focus ? id : currentFocused;
      });
      return id;
    },
    []
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
    },
    []
  );

  const autoLayout = useCallback(() => {
    setLayoutState((prev) => autoLayoutFn(collectTileIds(prev)));
  }, []);

  const registerSettings = useCallback(
    (tileId: string, Component: React.ComponentType) => {
      setSettings((prev) =>
        prev[tileId] === Component ? prev : { ...prev, [tileId]: Component }
      );
      return () => {
        setSettings((prev) => {
          if (!(tileId in prev)) return prev;
          const next = { ...prev };
          delete next[tileId];
          return next;
        });
      };
    },
    []
  );

  const FocusedTileSettings = focusedTileId
    ? (settings[focusedTileId] ?? null)
    : null;

  const value = useMemo<TilingContextValue>(
    () => ({
      layout,
      tiles,
      focusedTileId,
      setLayout,
      setFocusedTileId,
      addTile,
      removeTile,
      autoLayout,
      FocusedTileSettings,
      registerSettings,
    }),
    [
      layout,
      tiles,
      focusedTileId,
      setLayout,
      addTile,
      removeTile,
      autoLayout,
      FocusedTileSettings,
      registerSettings,
    ]
  );

  return (
    <TilingContext.Provider value={value}>{children}</TilingContext.Provider>
  );
};

/**
 * Remove a tile id from the layout tree. If a split node ends up with
 * one child after removal, the split collapses into that child.
 */
function stripTile(
  node: MosaicNode<string>,
  id: string
): MosaicNode<string> | null {
  if (typeof node === "string") return node === id ? null : node;
  const first = stripTile(node.first, id);
  const second = stripTile(node.second, id);
  if (first === null && second === null) return null;
  if (first === null) return second;
  if (second === null) return first;
  return { ...node, first, second };
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
 * Register a settings component for the surrounding tile. The component
 * is rendered (as `<Component />`) in the settings panel whenever this
 * tile is focused. Pass a module-level component reference, not an
 * inline JSX element — element identity changes every render and would
 * thrash the registry.
 */
export function useTileSettings(Component: React.ComponentType): void {
  const tileId = useTileId();
  const { registerSettings } = useTiling();
  useEffect(() => {
    if (!tileId) return undefined;
    return registerSettings(tileId, Component);
    // registerSettings is a useCallback([]) — stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileId, Component]);
}
