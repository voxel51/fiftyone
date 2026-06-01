import { useAnnotationEventHandler } from "@fiftyone/annotation";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventBus,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { atom, useStore } from "jotai";
import { useCallback } from "react";
import { editing } from "../../core/src/components/Modal/Sidebar/Annotate/Edit";

/**
 * IDs of overlays currently considered hovered.
 * Union of all hover signals: pointer-driven canvas hover
 * (`lighter:overlay-hover` / `:overlay-unhover`, bulk-cleared by
 * `:overlay-all-unhover`) plus programmatic sidebar-row hover
 * (`annotation:sidebarLabelHover` / `:sidebarLabelUnhover`).
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
  const channel = scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID;
  const useEventHandler = useLighterEventHandler(channel);
  const eventBus = useLighterEventBus(channel);

  const addHovered = useCallback(
    (id: string) => {
      const current = store.get(hoveredOverlayIds);
      if (current.has(id)) {
        return;
      }

      const next = new Set(current);
      next.add(id);

      store.set(hoveredOverlayIds, next);
    },
    [store]
  );

  const removeHovered = useCallback(
    (id: string) => {
      const current = store.get(hoveredOverlayIds);
      if (!current.has(id)) {
        return;
      }

      const next = new Set(current);
      next.delete(id);

      store.set(hoveredOverlayIds, next);
    },
    [store]
  );

  useEventHandler(
    "lighter:overlay-hover",
    useCallback((payload) => addHovered(payload.id), [addHovered])
  );

  useEventHandler(
    "lighter:overlay-unhover",
    useCallback((payload) => removeHovered(payload.id), [removeHovered])
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

  // Sidebar-row hover propagates to both the canvas (via `do-overlay-hover`,
  // so the overlay visually reacts) and the cross-decoration atom (so the
  // matching timeline track row lights up via `linkHovered`). We can't route
  // this through `lighter:overlay-hover` — that path is observed by the
  // tooltip handler, which would pop a stale-positioned tooltip on every
  // sidebar mouseover.
  useAnnotationEventHandler(
    "annotation:sidebarLabelHover",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        eventBus.dispatch("lighter:do-overlay-hover", {
          id: payload.id,
          tooltip: payload.tooltip ?? false,
        });

        addHovered(payload.id);
      },
      [scene, eventBus, addHovered]
    )
  );

  useAnnotationEventHandler(
    "annotation:sidebarLabelUnhover",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        eventBus.dispatch("lighter:do-overlay-unhover", { id: payload.id });

        removeHovered(payload.id);
      },
      [scene, eventBus, removeHovered]
    )
  );

  useEventHandler(
    "lighter:selection-changed",
    useCallback(
      (payload) => {
        // Explicit user pick → replace the atom. Otherwise stale
        // "remembered intent" entries (kept across transient overlay
        // removals) accumulate, because Lighter's auto-deselect only
        // sees what's currently in scene.
        if (!payload.ignoreSideEffects && payload.selectedIds.length > 0) {
          store.set(selectedOverlayIds, new Set(payload.selectedIds));
          return;
        }

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

  // Restore selection when a previously-selected overlay re-enters the
  // scene
  useEventHandler(
    "lighter:overlay-added",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        if (!store.get(selectedOverlayIds).has(payload.id)) {
          return;
        }

        const editingValue = store.get(editing);
        if (!editingValue || typeof editingValue === "string") {
          return;
        }

        const editingLabel = store.get(editingValue);
        if (editingLabel?.overlay?.id !== payload.id) {
          return;
        }

        scene.selectOverlay(payload.id);
      },
      [scene, store]
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
