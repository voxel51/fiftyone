import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useEffect, useMemo } from "react";
import type { SceneSource } from "../../../scene-inventory";

/**
 * Which image source each mounted image tile currently displays
 * (tile id → source id). Every image tile publishes its binding here
 * (see `usePublishMcapImageTileBinding`), so spawn points can answer
 * "which streams are already on screen": the add-tile menu checks and
 * focuses instead of duplicating, and a freshly spawned tile defaults
 * to the best stream nobody is showing yet.
 *
 * Lives in the tiling shell's per-instance Jotai store, so bindings are
 * scoped to one modal and vanish with it.
 */
export const mcapImageTileBindingsAtom = atom<Readonly<Record<string, string>>>(
  {},
);

/** Subscribe to the current tile→source bindings map. */
export function useMcapImageTileBindings(): Readonly<Record<string, string>> {
  return useAtomValue(mcapImageTileBindingsAtom);
}

/**
 * Publish the surrounding image tile's bound source into
 * {@link mcapImageTileBindingsAtom} while the tile is mounted, tracking
 * rebinds and cleaning up on unmount.
 */
export function usePublishMcapImageTileBinding(sourceId: string): void {
  const tileId = useTileId();
  const store = useStore();
  // This effect mirrors the tile's current binding into the shared map —
  // an external (cross-tile) store, so an effect is the right tool.
  useEffect(() => {
    if (!tileId || !sourceId) return undefined;
    store.set(mcapImageTileBindingsAtom, (prev) => ({
      ...prev,
      [tileId]: sourceId,
    }));
    return () => {
      store.set(mcapImageTileBindingsAtom, (prev) => {
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
export const mcapHoveredImageTopicAtom = atom<string | null>(null);

/** Subscribe to the hovered image source id. */
export function useMcapHoveredImageTopic(): string | null {
  return useAtomValue(mcapHoveredImageTopicAtom);
}

/** Image topic whose textured 3D camera frustum is currently hovered. */
export const mcapHoveredFrustumImageTopicAtom = atom<string | null>(null);

/** Subscribe to the image topic hovered from the 3D camera surface. */
export function useMcapHoveredFrustumImageTopic(): string | null {
  return useAtomValue(mcapHoveredFrustumImageTopicAtom);
}

/**
 * Pointer handlers an image tile spreads on its content to publish
 * hover into {@link mcapHoveredImageTopicAtom}. Cleans up after itself
 * on unmount/rebind so a closed tile can't leave a frustum glowing.
 */
export function useMcapImageTileHoverProps(sourceId: string): {
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
} {
  const store = useStore();
  // This effect releases a still-published hover when the tile unmounts
  // or rebinds to another source.
  useEffect(
    () => () => {
      store.set(mcapHoveredImageTopicAtom, (current) =>
        current === sourceId ? null : current,
      );
    },
    [sourceId, store],
  );
  return useMemo(
    () => ({
      onPointerEnter: () => {
        if (sourceId) store.set(mcapHoveredImageTopicAtom, sourceId);
      },
      onPointerLeave: () => {
        store.set(mcapHoveredImageTopicAtom, (current) =>
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
export function chooseNextImageTopic(
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
