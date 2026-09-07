import { atom, useAtomValue } from "jotai";
import { useMemo } from "react";

/**
 * Where each 2D-media tile draws its stream, and the episode's media
 * commands — published by the view layer, read by features hosted outside
 * this package that overlay a tile's media or send the episode back to a
 * stream and a moment. Open source publishes and reads nothing back.
 *
 * Entries live in the tiling shell's per-instance jotai store, so they are
 * scoped to one episode modal and vanish with it; a consumer outside any
 * episode modal reads an empty registry and a null episode.
 */

/** Stable, recording-independent identity of a displayed stream. */
export type TileMediaSurfaceSource = {
  /** Semantic family, e.g. `"image"`. */
  type: string;
  /** Format-native stream name, e.g. `"CAM_FRONT"`. */
  name: string;
};

/** Where a tile currently draws its media, in element-local CSS pixels. */
export type TileMediaRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type TileMediaSurface = {
  tileId: string;
  source: TileMediaSurfaceSource;
  /** The tile's media viewport element — overlays portal into it. */
  element: HTMLElement;
  /**
   * Displayed-media rect in element-local px, or null before the media has
   * loaded. Reads live layout — safe to call once per animation frame.
   */
  getMediaRect: () => TileMediaRect | null;
  /** Absolute content time (integer ns) of the displayed frame, or null. */
  getContentTimeNs: () => bigint | null;
};

/** Internal — published by `useRegisterTileMediaSurface` (views). */
export const tileMediaSurfacesAtom = atom<
  Readonly<Record<string, TileMediaSurface>>
>({});

/** Every mounted 2D-media tile surface. */
export function useTileMediaSurfaces(): readonly TileMediaSurface[] {
  const surfaces = useAtomValue(tileMediaSurfacesAtom);
  return useMemo(() => Object.values(surfaces), [surfaces]);
}

/**
 * Episode-level media commands. Unlike the per-tile registry these work for
 * streams whose tile is currently closed — e.g. reopening the tile a
 * persisted reference points at.
 */
export type TileMediaEpisode = {
  /** Focus the tile showing the stream, or open one; no-op if unknown. */
  openTileForSource: (source: TileMediaSurfaceSource) => void;
  /** Pause playback and move the playhead to an absolute content time. */
  seekToTimeNs: (timeNs: bigint) => void;
  /**
   * Timeline seconds a seek to this content time lands on, or null before
   * the timeline index exists — the number the playhead readout will show,
   * so labels formatted with it match what clicking them produces.
   */
  secondsForTimestamp: (timeNs: bigint) => number | null;
  pause: () => void;
};

/** Internal — published by `TileMediaEpisodePublisher` (views). */
export const tileMediaEpisodeAtom = atom<TileMediaEpisode | null>(
  null as TileMediaEpisode | null,
);

/** The mounted episode's media commands, or null outside an episode modal. */
export function useTileMediaEpisode(): TileMediaEpisode | null {
  return useAtomValue(tileMediaEpisodeAtom);
}
