import React, { createContext, useContext, useMemo } from "react";
import type { SceneSource } from "../../ir";

export type { SceneSource } from "../../ir";

/** The discoverable data sources in the current scene (see `SceneSource`). */
interface SceneInventoryContextValue {
  readonly sources: readonly SceneSource[];
}

const SceneInventoryContext = createContext<SceneInventoryContextValue | null>(
  null,
);

/** Sources and descendants published by `SceneInventoryProvider`. */
export interface SceneInventoryProviderProps {
  sources: readonly SceneSource[];
  children: React.ReactNode;
}

/**
 * Publishes the set of data sources available in the current scene so
 * tiles and their settings can discover what they can render. Sits
 * above `PlaybackShell` (or inside it as a child) — the data is
 * read by tile components and by the episode stream bridge
 * to decide which tile kinds to register.
 */
export const SceneInventoryProvider: React.FC<SceneInventoryProviderProps> = ({
  sources,
  children,
}) => {
  const value = useMemo(() => ({ sources }), [sources]);
  return (
    <SceneInventoryContext.Provider value={value}>
      {children}
    </SceneInventoryContext.Provider>
  );
};

/**
 * Read the full scene inventory. Throws when called outside a
 * `SceneInventoryProvider` — the provider is the single source of
 * truth for what data exists in the scene.
 */
export function useSceneInventory(): readonly SceneSource[] {
  const ctx = useContext(SceneInventoryContext);
  if (!ctx) {
    throw new Error(
      "useSceneInventory must be used inside <SceneInventoryProvider>",
    );
  }
  return ctx.sources;
}

/**
 * Read the scene inventory when one is mounted, or an empty list when it
 * is not.
 *
 * For AMBIENT consumers only — components mounted unconditionally beside a
 * scene (e.g. the audio registrar) that have nothing to do when no
 * inventory exists. A component whose whole purpose depends on the
 * inventory should use `useSceneInventory()` and fail loudly instead.
 */
export function useOptionalSceneInventory(): readonly SceneSource[] {
  return useContext(SceneInventoryContext)?.sources ?? EMPTY_SOURCES;
}

const EMPTY_SOURCES: readonly SceneSource[] = [];

/**
 * Read the scene-inventory sources matching `type`. Filtered subset
 * of `useSceneInventory()` — convenient for tile settings that need
 * the dropdown options for their own kind.
 */
export function useSceneSourcesByType(type: string): readonly SceneSource[] {
  const sources = useSceneInventory();
  return useMemo(() => sources.filter((s) => s.type === type), [sources, type]);
}

/** `useSceneSourcesByType` for ambient consumers — see `useOptionalSceneInventory`. */
export function useOptionalSceneSourcesByType(
  type: string,
): readonly SceneSource[] {
  const sources = useOptionalSceneInventory();
  return useMemo(() => sources.filter((s) => s.type === type), [sources, type]);
}
