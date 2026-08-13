import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import type { SceneSource } from "../../../scene-inventory";

type ImageTileBindings = Readonly<Record<string, string>>;

/**
 * Which image source each mounted image tile currently displays
 * (tile id → source id). Every image tile publishes its binding here
 * (see `usePublishImageTileBinding`), so spawn points can answer
 * "which streams are already on screen": the add-tile menu checks and
 * focuses instead of duplicating, and a freshly spawned tile defaults
 * to the best stream nobody is showing yet.
 *
 * Lives in the tiling shell's per-instance Jotai store, so bindings are
 * scoped to one modal and vanish with it.
 */
export const imageTileBindingsAtom = atom<ImageTileBindings>({});

/**
 * Durable preferred source per image tile. Unlike the mounted registry above,
 * entries survive temporary source unavailability and tile-body unmounts;
 * ModalLayoutPersistence snapshots them per dataset.
 */
export const persistedImageTileBindingsAtom = atom<ImageTileBindings>({});

/** Subscribe to the current tile→source bindings map. */
export function useImageTileBindings(): Readonly<Record<string, string>> {
  return useAtomValue(imageTileBindingsAtom);
}

/**
 * Publish the surrounding image tile's bound source into
 * {@link imageTileBindingsAtom} while the tile is mounted, tracking
 * rebinds and cleaning up on unmount.
 */
export function usePublishImageTileBinding(sourceId: string): void {
  const tileId = useTileId();
  const store = useStore();
  // This effect mirrors the tile's current binding into the shared map —
  // an external (cross-tile) store, so an effect is the right tool.
  useEffect(() => {
    if (!tileId || !sourceId) return undefined;
    store.set(imageTileBindingsAtom, (prev) => ({
      ...prev,
      [tileId]: sourceId,
    }));
    return () => {
      store.set(imageTileBindingsAtom, (prev) => {
        if (prev[tileId] !== sourceId) return prev;
        const next = { ...prev };
        delete next[tileId];
        return next;
      });
    };
  }, [sourceId, store, tileId]);
}

/**
 * Initialize a new image pane's durable source preference and return the
 * setter used by intentional source selection. Later automatic fallbacks do
 * not overwrite an existing preference.
 */
export function usePersistImageTileBinding(
  sourceId: string,
): (sourceId: string) => void {
  const tileId = useTileId();
  const store = useStore();

  // This effect records pane creation/duplication in durable modal state.
  useEffect(() => {
    if (!tileId || !sourceId) return;
    store.set(persistedImageTileBindingsAtom, (previous) =>
      previous[tileId]
        ? previous
        : {
            ...previous,
            [tileId]: sourceId,
          },
    );
  }, [sourceId, store, tileId]);

  return useCallback(
    (nextSourceId: string) => {
      if (!tileId || !nextSourceId) return;
      store.set(persistedImageTileBindingsAtom, (previous) =>
        previous[tileId] === nextSourceId
          ? previous
          : { ...previous, [tileId]: nextSourceId },
      );
    },
    [store, tileId],
  );
}

/**
 * Image source id the pointer is currently over (hovering an image
 * tile's content). The 3D tile highlights the matching camera frustum,
 * answering "which camera is this?" from either direction.
 */
export const hoveredImageStreamAtom = atom<string | null>(null);

/** Subscribe to the hovered image source id. */
export function useHoveredImageStream(): string | null {
  return useAtomValue(hoveredImageStreamAtom);
}

/** Image stream whose textured 3D camera frustum is currently hovered. */
const hoveredFrustumImageStreamAtom = atom<string | null>(null);

/** Subscribe to the image stream hovered from the 3D camera surface. */
export function useHoveredFrustumImageStream(): string | null {
  return useAtomValue(hoveredFrustumImageStreamAtom);
}

/** Domain operations for publishing hover from a 3D camera frustum. */
export function useFrustumImageHover(): {
  readonly clearIfCurrent: (stream: string) => boolean;
  readonly setHovered: (stream: string) => void;
} {
  const store = useStore();
  return useMemo(
    () => ({
      clearIfCurrent: (stream: string) => {
        if (store.get(hoveredFrustumImageStreamAtom) !== stream) {
          return false;
        }
        store.set(hoveredFrustumImageStreamAtom, null);
        return true;
      },
      setHovered: (stream: string) => {
        store.set(hoveredFrustumImageStreamAtom, stream);
      },
    }),
    [store],
  );
}

/**
 * Pointer handlers an image tile spreads on its content to publish
 * hover into {@link hoveredImageStreamAtom}. Cleans up after itself
 * on unmount/rebind so a closed tile can't leave a frustum glowing.
 */
export function useImageTileHoverProps(sourceId: string): {
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
} {
  const store = useStore();
  // This effect releases a still-published hover when the tile unmounts
  // or rebinds to another source.
  useEffect(
    () => () => {
      store.set(hoveredImageStreamAtom, (current) =>
        current === sourceId ? null : current,
      );
    },
    [sourceId, store],
  );
  return useMemo(
    () => ({
      onPointerEnter: () => {
        if (sourceId) store.set(hoveredImageStreamAtom, sourceId);
      },
      onPointerLeave: () => {
        store.set(hoveredImageStreamAtom, (current) =>
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

/**
 * Reconcile the pane's displayed source with a changing sample inventory.
 * A returning durable preference wins; otherwise an available current
 * fallback remains stable, and only an unavailable display is replaced.
 */
export function resolveAvailableImageStream(
  currentSourceId: string,
  preferredSourceId: string | undefined,
  availableImages: readonly SceneSource[],
  rankedFallbackImages: readonly SceneSource[],
  mountedBindings: ImageTileBindings,
): string {
  const available = new Set(availableImages.map((source) => source.id));
  if (preferredSourceId && available.has(preferredSourceId)) {
    return preferredSourceId;
  }
  if (currentSourceId && available.has(currentSourceId)) {
    return currentSourceId;
  }
  return chooseNextImageStream(rankedFallbackImages, mountedBindings);
}
