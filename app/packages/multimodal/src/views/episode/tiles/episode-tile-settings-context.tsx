import type React from "react";
import { createEpisodeTileRegistry } from "../interaction/registry";

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
 * Modal-scoped registry of tile settings, keyed by tile id. A tile registers
 * its settings as a React element and the sidebar renders it inside its own
 * tree, where it can add status strips and scroll containers.
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

/** The focused tile's settings registration, or null when none is mounted. */
export function useEpisodeTileSettings(
  tileId: string | null | undefined,
): EpisodeTileSettingsRegistration | null {
  const entries = registry.useEntries();
  return (tileId ? entries.get(tileId) : null) ?? null;
}
