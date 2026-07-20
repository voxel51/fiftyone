import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useEffect, useMemo } from "react";
import type { SceneSource } from "../../scene-inventory";

/**
 * Which image source each mounted image tile currently displays
 * (tile id → source id). Every image tile publishes its binding here
 * (see `usePublishEpisodeImageTileBinding`), so spawn points can answer
 * "which streams are already on screen": the add-tile menu checks and
 * focuses instead of duplicating, and a freshly spawned tile defaults
 * to the best stream nobody is showing yet.
 *
 * Lives in the tiling shell's per-instance Jotai store, so bindings are
 * scoped to one modal and vanish with it.
 */
export const episodeImageTileBindingsAtom = atom<
  Readonly<Record<string, string>>
>({});

/** Subscribe to the current tile→source bindings map. */
export function useEpisodeImageTileBindings(): Readonly<
  Record<string, string>
> {
  return useAtomValue(episodeImageTileBindingsAtom);
}

/**
 * Publish the surrounding image tile's bound source into
 * {@link episodeImageTileBindingsAtom} while the tile is mounted, tracking
 * rebinds and cleaning up on unmount.
 */
export function usePublishEpisodeImageTileBinding(sourceId: string): void {
  const tileId = useTileId();
  const store = useStore();
  // This effect mirrors the tile's current binding into the shared map —
  // an external (cross-tile) store, so an effect is the right tool.
  useEffect(() => {
    if (!tileId || !sourceId) return undefined;
    store.set(episodeImageTileBindingsAtom, (prev) => ({
      ...prev,
      [tileId]: sourceId,
    }));
    return () => {
      store.set(episodeImageTileBindingsAtom, (prev) => {
        if (prev[tileId] !== sourceId) return prev;
        const next = { ...prev };
        delete next[tileId];
        return next;
      });
    };
  }, [sourceId, store, tileId]);
}

/**
 * Image source id the pointer is currently over (hovering an image
 * tile's content). The 3D tile highlights the matching camera frustum,
 * answering "which camera is this?" from either direction.
 */
export const episodeHoveredImageStreamAtom = atom<string | null>(null);

/** Subscribe to the hovered image source id. */
export function useEpisodeHoveredImageStream(): string | null {
  return useAtomValue(episodeHoveredImageStreamAtom);
}

/** Image stream whose textured 3D camera frustum is currently hovered. */
const episodeHoveredFrustumImageStreamAtom = atom<string | null>(null);

/** Subscribe to the image stream hovered from the 3D camera surface. */
export function useEpisodeHoveredFrustumImageStream(): string | null {
  return useAtomValue(episodeHoveredFrustumImageStreamAtom);
}

/** Domain operations for publishing hover from a 3D camera frustum. */
export function useEpisodeFrustumImageHover(): {
  readonly clearIfCurrent: (stream: string) => boolean;
  readonly setHovered: (stream: string) => void;
} {
  const store = useStore();
  return useMemo(
    () => ({
      clearIfCurrent: (stream: string) => {
        if (store.get(episodeHoveredFrustumImageStreamAtom) !== stream) {
          return false;
        }
        store.set(episodeHoveredFrustumImageStreamAtom, null);
        return true;
      },
      setHovered: (stream: string) => {
        store.set(episodeHoveredFrustumImageStreamAtom, stream);
      },
    }),
    [store],
  );
}

/**
 * Pointer handlers an image tile spreads on its content to publish
 * hover into {@link episodeHoveredImageStreamAtom}. Cleans up after itself
 * on unmount/rebind so a closed tile can't leave a frustum glowing.
 */
export function useEpisodeImageTileHoverProps(sourceId: string): {
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
} {
  const store = useStore();
  // This effect releases a still-published hover when the tile unmounts
  // or rebinds to another source.
  useEffect(
    () => () => {
      store.set(episodeHoveredImageStreamAtom, (current) =>
        current === sourceId ? null : current,
      );
    },
    [sourceId, store],
  );
  return useMemo(
    () => ({
      onPointerEnter: () => {
        if (sourceId) store.set(episodeHoveredImageStreamAtom, sourceId);
      },
      onPointerLeave: () => {
        store.set(episodeHoveredImageStreamAtom, (current) =>
          current === sourceId ? null : current,
        );
      },
    }),
    [sourceId, store],
  );
}

/**
 * Default source for an image tile that wasn't assigned one: the best
 * ranked stream no other tile is displaying, so "split" and "add tile"
 * walk through the recording's cameras instead of piling onto the same
 * default. When every stream is already on screen, fall back to the top-ranked
 * source (a second view of it is legitimate).
 */
export function chooseNextImageStream(
  rankedImages: readonly SceneSource[],
  bindings: Readonly<Record<string, string>>,
): string {
  const displayed = new Set(Object.values(bindings));
  return (
    rankedImages.find((source) => !displayed.has(source.id))?.id ??
    rankedImages[0]?.id ??
    ""
  );
}
