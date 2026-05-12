import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * The value exposed by `TilingProvider`. Owns the currently focused tile
 * id and a registry of per-tile settings components. Consumers (sidebar,
 * inspector) read from this context; tile bodies register themselves via
 * `useTileSettings`.
 */
export interface TilingContextValue {
  focusedTileId: string | null;
  setFocusedTileId: (id: string | null) => void;
  /**
   * The component type registered by the currently focused tile, or
   * `null` if no tile is focused or the focused tile didn't register
   * any settings. Render it as `<Component />`.
   */
  FocusedTileSettings: React.ComponentType | null;
  /**
   * Register a settings component under `tileId`. Returns an unregister
   * function. Most tiles call this via `useTileSettings` rather than
   * directly. Pass a component *reference* (`CameraSettings`), not an
   * element (`<CameraSettings />`) — element identity changes every
   * render and would thrash the registry.
   */
  registerSettings: (
    tileId: string,
    Component: React.ComponentType
  ) => () => void;
}

const TilingContext = createContext<TilingContextValue | null>(null);

/** Internal context carrying the current tile id down to a tile's body. */
const TileIdContext = createContext<string | null>(null);

/**
 * Orchestrates tiling-level concerns shared between the mosaic grid and
 * the surrounding sidebars: which tile is focused, and what each tile
 * wants to show in the settings panel.
 */
export const TilingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [focusedTileId, setFocusedTileId] = useState<string | null>(null);
  const [settings, setSettings] = useState<
    Record<string, React.ComponentType>
  >({});

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
      focusedTileId,
      setFocusedTileId,
      FocusedTileSettings,
      registerSettings,
    }),
    [focusedTileId, FocusedTileSettings, registerSettings]
  );

  return (
    <TilingContext.Provider value={value}>{children}</TilingContext.Provider>
  );
};

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
 * tile is focused. Settings are scoped to the tile id provided by the
 * nearest `<TileIdScope>`.
 *
 * Pass a stable component *reference* — module-level components are
 * fine. Passing an inline JSX element (`<CameraSettings />`) would
 * cause an infinite re-register loop because the element identity
 * changes every render.
 *
 * @example
 * ```tsx
 * function CameraTile() {
 *   useTileSettings(CameraSettings);
 *   return <div>...</div>;
 * }
 * ```
 */
export function useTileSettings(Component: React.ComponentType): void {
  const tileId = useTileId();
  const { registerSettings } = useTiling();
  useEffect(() => {
    if (!tileId) return undefined;
    return registerSettings(tileId, Component);
  }, [tileId, Component, registerSettings]);
}
