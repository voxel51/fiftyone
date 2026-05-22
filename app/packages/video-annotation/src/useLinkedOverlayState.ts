import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { atom, useStore } from "jotai";
import { useCallback } from "react";

/**
 * IDs of overlays currently in hover state on the live Lighter scene.
 * Reflects the set of `lighter:overlay-hover` / `:overlay-unhover`
 * events; cleared in bulk by `lighter:overlay-all-unhover`.
 */
export const hoveredOverlayIds = atom<Set<string>>(new Set<string>());

/**
 * IDs the user has *intentionally* selected. Mirrors the scene's
 * selection set but filters out removal-driven deselects so the row
 * decoration outlives a tracked instance exiting frame.
 *
 * Driven by `:selection-changed`. Deselect entries are applied only
 * when the payload's `ignoreSideEffects` flag is false — that flag is
 * set by `SelectionManager.removeSelectable`, which we treat as "the
 * overlay went away, not a user action".
 */
export const selectedOverlayIds = atom<Set<string>>(new Set<string>());

/**
 * Link hover and selection states between overlays and object tracks.
 *
 * The video-annotation timeline relies on track.id == overlay.id for
 * tracked instances (both are `track-${index}`), so a hovered/selected
 * label lights up its row and vice versa with no extra mapping.
 *
 * Mount once near the top of the video-annotation surface. Re-mounts
 * automatically follow the active scene through `useLighter()`. Uses
 * `useStore()` rather than `getDefaultStore()` so writes land in the
 * same store consumers read from — `TilingProvider` mounts its own
 * Jotai `<Provider>`, and reads inside that subtree would otherwise
 * miss writes made to the default store.
 */
export function useLinkedOverlayState(): void {
  const { scene } = useLighter();
  const store = useStore();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  useEventHandler(
    "lighter:overlay-hover",
    useCallback(
      (payload) => {
        const current = store.get(hoveredOverlayIds);
        if (current.has(payload.id)) {
          return;
        }

        const next = new Set(current);
        next.add(payload.id);

        store.set(hoveredOverlayIds, next);
      },
      [store]
    )
  );

  useEventHandler(
    "lighter:overlay-unhover",
    useCallback(
      (payload) => {
        const current = store.get(hoveredOverlayIds);
        if (!current.has(payload.id)) {
          return;
        }

        const next = new Set(current);
        next.delete(payload.id);

        store.set(hoveredOverlayIds, next);
      },
      [store]
    )
  );

  useEventHandler(
    "lighter:overlay-all-unhover",
    useCallback(() => {
      if (store.get(hoveredOverlayIds).size === 0) {
        return;
      }

      store.set(hoveredOverlayIds, new Set<string>());
    }, [store])
  );

  useEventHandler(
    "lighter:selection-changed",
    useCallback(
      (payload) => {
        const prev = store.get(selectedOverlayIds);
        let mutated = false;
        const next = new Set(prev);
        for (const id of payload.selectedIds) {
          if (!next.has(id)) {
            next.add(id);
            mutated = true;
          }
        }

        // Skip deselects flagged as side-effect-only — those fire when
        // the overlay is removed from the scene (e.g. a tracked
        // instance exiting frame) and the user-intent atom should
        // carry through.
        if (!payload.ignoreSideEffects) {
          for (const id of payload.deselectedIds) {
            if (next.has(id)) {
              next.delete(id);
              mutated = true;
            }
          }
        }

        if (mutated) {
          store.set(selectedOverlayIds, next);
        }
      },
      [store]
    )
  );

  useEventHandler(
    "lighter:selection-cleared",
    useCallback(
      (payload) => {
        if (payload.ignoreSideEffects) {
          return;
        }

        if (store.get(selectedOverlayIds).size === 0) {
          return;
        }

        store.set(selectedOverlayIds, new Set<string>());
      },
      [store]
    )
  );
}

/**
 * When the user selects an overlay, bring its matching track row into
 * view. Relies on `data-track-id={id}` rendered by {@link TimelineTrack}
 * (track id == overlay id for our datasets).
 *
 * Pinned tracks appear twice in the DOM (the header copy when the
 * drawer is closed, the body copy when open). `querySelector` returns
 * the first match — usually the visible copy — and `scrollIntoView`
 * with `block: "nearest"` no-ops when the row is already visible, so
 * pinned rows generate no scroll. Only off-screen unpinned rows move.
 */
export function useScrollTrackOnSelect(): void {
  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  useEventHandler(
    "lighter:overlay-select",
    useCallback((payload) => {
      // Defer to the next frame so any layout shift triggered by the
      // selection itself settles before scrolling.
      requestAnimationFrame(() => {
        const row = document.querySelector(
          `[data-track-id="${CSS.escape(payload.id)}"]`
        );

        row?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      });
    }, [])
  );
}
