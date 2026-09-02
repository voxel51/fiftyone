/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { overlayToSelectedLabel } from "../../Actions/Selected/hooks";

/**
 * Turns clicks on a Lighter overlay into `fos.selectedLabels`.
 *
 * This is the restoration of what `use-looker.ts` wired for every looker
 * surface — `useEventHandler(looker, "select", fos.useOnSelectLabel())`. Video
 * Explore paints through Lighter and mounts no looker, so without this the
 * atom every label action reads stays empty however many boxes the user
 * clicks: the Tag button counts the whole sample instead of the selection, and
 * "Clear selected labels" / "Hide selected labels" never appear.
 *
 * Semantics match the looker's: each click TOGGLES one label and leaves the
 * rest alone, so a selection accumulates. On the canvas side that is
 * `SelectionManager`'s multi-select mode plus the toggle in
 * `InteractionManager` — see `Scene2D.setMultipleSelection`, which
 * `LighterVideo` turns on for `explore`. This hook only mirrors what the scene
 * decided; it never selects anything itself, so the two cannot disagree about
 * which boxes are highlighted.
 *
 * Explore only, and for the same reason as the tooltip handler beside it: on
 * the annotation surfaces a selection is the target of the next edit and is
 * owned by the annotation engine's active handles, not by this atom.
 */
export const useLighterSelectionEventHandler = (scene: Scene2D | null) => {
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  const applyDelta = fos.useApplySelectedLabelsDelta();
  const sampleId = fos.useModalSampleId();

  useEventHandler(
    "lighter:selection-changed",
    useCallback(
      ({
        selectedIds,
        deselectedIds,
        ignoreSideEffects,
      }: {
        selectedIds: string[];
        deselectedIds: string[];
        ignoreSideEffects?: boolean;
      }) => {
        // Flagged payloads are not user intent, and both producers have
        // already settled the atom themselves or must not touch it:
        //
        // - the "Manage selected" menu applies its choice to the scene with
        //   `ignoreSideEffects` after writing recoil, so acting here would
        //   re-toggle every label it just selected;
        // - removing an overlay drops its selection as a side effect of
        //   removal. A track leaving the current frame must NOT deselect its
        //   label, or scrubbing past a box would silently empty a selection
        //   the user built up.
        if (ignoreSideEffects || !scene) {
          return;
        }

        // The overlay is still registered at deselect time — the manager flips
        // its state and emits before anything unregisters it — so its label id
        // is readable, and it is the label id (not the overlay's instance id)
        // these atoms key by.
        const remove = deselectedIds
          .map((id) => scene.getOverlay(id))
          .filter((overlay) => !!overlay)
          .map((overlay) => overlayToSelectedLabel(overlay, sampleId).labelId);

        const add = selectedIds
          .map((id) => scene.getOverlay(id))
          .filter((overlay) => !!overlay)
          .map((overlay) => overlayToSelectedLabel(overlay, sampleId));

        applyDelta({ add, remove });
      },
      [applyDelta, sampleId, scene],
    ),
  );
};

/**
 * The other direction: `fos.selectedLabels` -> the canvas.
 *
 * Clicks are not the only thing that changes the selection. The "Manage
 * selected" menu writes the atom, tagging RESETS it on success
 * (`Tag.tsx`), hiding labels resets it, and an operator can set it outright.
 * None of those know a canvas exists, so without this each one leaves the
 * boxes painted as they were — most visibly after a tag, where the labels you
 * just tagged stay highlighted while the Tag button's count drops to zero.
 *
 * Fixing those one at a time is how the same bug keeps coming back, so this
 * makes the atom the surface's single source of truth for what is selected and
 * lets everything else converge on it. Paired with
 * {@link useLighterSelectionEventHandler}, which carries the canvas's own
 * gestures the other way, the two settle rather than fight: each writes only
 * what the other would already agree with, and both resolve a label's identity
 * through the same `overlayToSelectedLabel`, so they cannot disagree about
 * which overlay is which label.
 *
 * The scene calls are deliberately UNFLAGGED. That is what carries the change
 * on to the annotation engine, whose active set is what repaints an overlay
 * that leaves the frame and comes back — so a selection made through the menu
 * survives scrubbing exactly like a clicked one.
 */
export const useSelectedLabelsSceneSync = (scene: Scene2D | null) => {
  const selectedLabelIds = fos.useSelectedLabelIds();
  const sampleId = fos.useModalSampleId();

  useEffect(() => {
    if (!scene) {
      return;
    }

    for (const overlay of scene.getAllOverlays()) {
      // label overlays carry a field; the canonical media does not, and is not
      // selectable
      if (!overlay.field) {
        continue;
      }

      const { labelId } = overlayToSelectedLabel(overlay, sampleId);
      const shouldBeSelected = selectedLabelIds.has(labelId);

      // Not on `BaseOverlay` — only the selectable overlays define it — so
      // feature-detect rather than widen the base type, the way `Scene2D`'s
      // own `applyReadOnlyTo` probes for the move affordances. An overlay that
      // cannot answer is one that cannot be selected either, and falls through
      // to the calls below, which no-op on anything unregistered.
      const selectable = overlay as Partial<{ isSelected(): boolean }>;

      if (selectable.isSelected?.() === shouldBeSelected) {
        continue;
      }

      if (shouldBeSelected) {
        scene.selectOverlay(overlay.id);
      } else {
        scene.deselectOverlay(overlay.id);
      }
    }
  }, [scene, selectedLabelIds, sampleId]);
};
