import type React from "react";
import { createEpisodeTileRegistry } from "./episode-tile-registry";

/**
 * One tile's settings registration. The sidebar owns the frame around
 * `content` (scroll container, tile-scope status strip); the tile supplies
 * controls only.
 */
export interface EpisodeTileSettingsRegistration {
  readonly content: React.ReactNode;
  /**
   * Streams that flow through the main playback stream, for the sidebar's
   * tile-status strip. Only stream-fed tiles (3D, image) may set this: the
   * stream-status store defaults unknown streams to "loading", so a tile
   * with its own read model (plot, raw, map, logs) would render a
   * permanent, false "Buffering" notice. Omit until non-stream health has
   * a model of its own.
   */
  readonly streamStreams?: readonly string[];
}

/**
 * Modal-scoped registry of tile settings, keyed by tile id.
 *
 * Successor to the tiling DOM-portal slot (`setSettingsSlotEl` +
 * `TileSettingsContent`): a tile registers its settings as a React element
 * and the sidebar renders it inside its own tree, so the settings UI is
 * ordinary composition — the sidebar can wrap it (status strips, scroll
 * containers) and React devtools match what is on screen. Tiles that still
 * portal keep working; the sidebar prefers a registration when the focused
 * tile has one and falls back to the slot otherwise.
 */
const registry = createEpisodeTileRegistry<EpisodeTileSettingsRegistration>(
  "EpisodeTileSettings",
);

export const EpisodeTileSettingsProvider = registry.Provider;

/**
 * Publishes a tile's settings for its mounted lifetime. Memoize the
 * registration so re-registrations track real settings changes, not
 * renders.
 */
export const useRegisterEpisodeTileSettings = registry.useRegister;

/** The focused tile's registration, or null to use the legacy slot. */
export function useEpisodeTileSettings(
  tileId: string | null | undefined,
): EpisodeTileSettingsRegistration | null {
  const entries = registry.useEntries();
  return (tileId ? entries.get(tileId) : null) ?? null;
}
