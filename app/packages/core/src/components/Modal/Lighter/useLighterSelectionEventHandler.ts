/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import {
  useCurrentPublishedFrame,
  useCurrentPublishedFrameGetter,
} from "@fiftyone/playback";
import * as fos from "@fiftyone/state";
import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import {
  overlayToSelectedLabel,
  type SelectableOverlay,
} from "../../Actions/Selected/hooks";

/**
 * Set while {@link useSelectedLabelsSceneSync} is applying the atom to the
 * scene, so {@link useLighterSelectionEventHandler} can tell the scene's echo
 * apart from a user gesture.
 *
 * The sync's `selectOverlay` / `deselectOverlay` calls are deliberately
 * UNFLAGGED — that is what carries the change on to the annotation engine,
 * whose active set is what repaints an overlay that leaves the frame and comes
 * back — so `ignoreSideEffects` is not available as the discriminator here.
 * Without a guard the echo would write straight back into the atom, and the
 * per-frame reconciliation below would erase a selection the moment the
 * playhead moved off its frame.
 *
 * A plain ref is enough because Lighter dispatches synchronously
 * (`events/dispatch/dispatcher.ts` invokes handlers inline), so the echo
 * arrives inside the window the sync brackets.
 */
export type SelectionSyncGuard = MutableRefObject<boolean>;

/**
 * Both directions of video Explore's label selection, sharing one guard.
 *
 * The two halves are a pair by construction — each writes only what the other
 * would already agree with — so they are mounted together rather than
 * separately. Callers should prefer this over the two hooks below.
 */
export const useLighterSelectionBridge = (scene: Scene2D | null) => {
  const syncing = useRef(false);

  useLighterSelectionEventHandler(scene, syncing);
  useSelectedLabelsSceneSync(scene, syncing);
};

/**
 * Turns clicks on a Lighter overlay into `fos.selectedLabels`.
 *
 * Video Explore paints through Lighter and mounts no looker, so without this
 * the atom every label action reads stays empty however many boxes the user
 * clicks: the Tag button counts the whole sample instead of the selection, and
 * "Clear selected labels" / "Hide selected labels" never appear.
 *
 * Semantics match the video looker's: each click TOGGLES ONE OCCURRENCE and
 * leaves the rest alone, so a selection accumulates. On the canvas side that
 * is `SelectionManager`'s multi-select mode plus the toggle in
 * `InteractionManager` — see `Scene2D.setMultipleSelection`, which
 * `LighterVideo` turns on for `explore`.
 *
 * An occurrence, NOT a track: the scene holds one overlay per track and swaps
 * the label it carries as the playhead moves (`frameStore.ts`, `adapters.ts`'s
 * `updateHandle`), so the overlay's identity and its label's identity are
 * different questions. The atom keys by the label — which is what the server's
 * `select_labels` matches — so the frame has to be stamped alongside it, and
 * the reconciliation below has to re-run when the playhead moves.
 *
 * Explore only, and for the same reason as the tooltip handler beside it: on
 * the annotation surfaces a selection is the target of the next edit and is
 * owned by the annotation engine's active handles, not by this atom.
 */
export const useLighterSelectionEventHandler = (
  scene: Scene2D | null,
  syncing?: SelectionSyncGuard,
) => {
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  const applyDelta = fos.useApplySelectedLabelsDelta();
  const sampleId = fos.useModalSampleId();
  // A getter, not the reactive value: this callback is registered on an event
  // channel, so taking a new identity every frame would mean a full
  // unsubscribe / subscribe cycle per frame for a value only read on click.
  const getFrame = useCurrentPublishedFrameGetter();

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
        //
        // `syncing` covers the third producer, which cannot be flagged: this
        // hook's own counterpart reconciling the atom onto the canvas.
        if (ignoreSideEffects || syncing?.current || !scene) {
          return;
        }

        const frameNumber = getFrame();

        // The overlay is still registered at deselect time — the manager flips
        // its state and emits before anything unregisters it — so its label is
        // readable. Both directions resolve identity through the same
        // `overlayToSelectedLabel` at the same frame, which is what keeps them
        // from disagreeing about which occurrence an overlay is showing.
        const remove = deselectedIds
          .map((id) => scene.getOverlay(id))
          .filter((overlay) => !!overlay)
          .map(
            (overlay) =>
              overlayToSelectedLabel(overlay, sampleId, frameNumber).labelId,
          );

        const add = selectedIds
          .map((id) => scene.getOverlay(id))
          .filter((overlay) => !!overlay)
          .map((overlay) =>
            overlayToSelectedLabel(overlay, sampleId, frameNumber),
          );

        applyDelta({ add, remove });
      },
      [applyDelta, getFrame, sampleId, scene, syncing],
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
 * lets everything else converge on it.
 *
 * Re-runs on the PLAYHEAD as well as the atom, because a selection addresses
 * one occurrence: the same overlay shows a different label on the next frame,
 * so a highlight that stayed put would be pointing at a label nobody selected.
 * The video looker behaved the same way — it repainted from each frame's own
 * labels and highlighted whichever of them were in the atom, so a box lit up
 * only on the frame it was selected on.
 *
 * The scene calls are deliberately UNFLAGGED. That is what carries the change
 * on to the annotation engine, whose active set is what repaints an overlay
 * that leaves the frame and comes back. The echo that allows is suppressed by
 * {@link SelectionSyncGuard} rather than by a flag, which the engine would
 * also honor.
 */
export const useSelectedLabelsSceneSync = (
  scene: Scene2D | null,
  syncing?: SelectionSyncGuard,
) => {
  const selectedLabelIds = fos.useSelectedLabelIds();
  const sampleId = fos.useModalSampleId();
  const frameNumber = useCurrentPublishedFrame();

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  /** Bring ONE overlay into line with the atom. */
  const reconcile = useCallback(
    (overlay: SelectableOverlay) => {
      if (!scene) {
        return;
      }

      // label overlays carry a field; the canonical media does not, and is
      // not selectable
      if (!overlay.field) {
        return;
      }

      const { labelId } = overlayToSelectedLabel(
        overlay,
        sampleId,
        frameNumber,
      );
      const shouldBeSelected = selectedLabelIds.has(labelId);

      // Not on `BaseOverlay` — only the selectable overlays define it — so
      // feature-detect rather than widen the base type, the way `Scene2D`'s
      // own `applyReadOnlyTo` probes for the move affordances. An overlay
      // that cannot answer is one that cannot be selected either, and falls
      // through to the calls below, which no-op on anything unregistered.
      const selectable = overlay as Partial<{ isSelected(): boolean }>;

      if (selectable.isSelected?.() === shouldBeSelected) {
        return;
      }

      if (syncing) {
        syncing.current = true;
      }

      try {
        if (shouldBeSelected) {
          scene.selectOverlay(overlay.id);
        } else {
          scene.deselectOverlay(overlay.id);
        }
      } finally {
        if (syncing) {
          syncing.current = false;
        }
      }
    },
    [frameNumber, sampleId, scene, selectedLabelIds, syncing],
  );

  // Whether the scene might still hold a selected overlay the atom disagrees
  // with — the fast path below's only state. Starts TRUE: a freshly-mounted
  // scene can already have overlays selected (the engine's own active-set
  // rehydration, `bridgeLoop.ts`'s `applyInteraction` on every mount), and
  // that is exactly the staleness S2 exists to catch, so the first walk must
  // always run rather than assume a clean slate. Once a walk confirms the
  // atom is empty, subsequent walks are skipped until the atom holds
  // something again.
  //
  // Playback publishes a new `frameNumber` on every frame, and that must
  // keep re-running this walk for as long as something IS selected (a
  // different occurrence of the track needs highlighting each frame); the
  // overwhelmingly common case, though, is nothing selected at all, where
  // the scene has nothing to reconcile and every one of those walks — and
  // every overlay object it touches — is pure waste on a dense-detection
  // clip playing back at frame rate.
  const anySelectedRef = useRef(true);

  // A new `scene` (a sample switch — `LighterVideo` persists across samples;
  // only its scene is re-minted) is a fresh unknown, not a continuation of
  // the previous one's steady state — re-arm the "might be dirty" guard so
  // its first walk isn't wrongly skipped.
  useEffect(() => {
    anySelectedRef.current = true;
  }, [scene]);

  useEffect(() => {
    if (!scene) {
      return;
    }

    if (selectedLabelIds.size === 0 && !anySelectedRef.current) {
      return;
    }

    for (const overlay of scene.getAllOverlays()) {
      reconcile(overlay);
    }

    anySelectedRef.current = selectedLabelIds.size > 0;
  }, [reconcile, scene, selectedLabelIds]);

  // The mount drain below reads `reconcile` through a ref so its handler can
  // keep a stable identity: the handler is registered on an event channel, and
  // `reconcile` changes identity on every frame (it closes over the playhead),
  // which would otherwise mean an unsubscribe / subscribe cycle per frame.
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;

  /**
   * ...and again whenever an overlay MOUNTS, which the effect above cannot
   * see: its dependencies are the atom and the playhead, and neither changes
   * when a track re-enters the projection.
   *
   * Without this the annotation engine's active set is a third copy of the
   * selection that nothing reconciles. Every mount re-applies
   * `interaction.isActive(ref)` (`bridgeLoop.ts`'s `applyInteraction`), and it
   * does so FLAGGED (`lighterBridge.ts`'s `applySelected`), so leaving a frame
   * unmounts with a flagged deselect the engine ignores — it keeps the ref.
   * A label cleared, tagged, or hidden while its track was off-frame would
   * therefore come back highlighted when the user scrubbed to it, with the
   * atom empty and the Tag count reading zero.
   *
   * DEFERRED to a microtask, which is load-bearing rather than tidy-up.
   * `mountFresh` calls `bridge.mount(...)` and only THEN
   * `applyInteraction(handle, ref)` (`bridgeLoop.ts`), and Lighter dispatches
   * synchronously — so this event arrives INSIDE `bridge.mount`, before the
   * engine has applied its own idea of the selection. Reconciling here and now
   * would simply be overwritten a few statements later by the stale flagged
   * apply. Draining after the current synchronous block puts this last, which
   * is the only order in which the atom wins.
   *
   * Batched into one drain for the same reason it is deferred: a frame with N
   * labels mounts N overlays in one synchronous block, and this collapses that
   * into a single pass over just those overlays rather than N passes or a full
   * scene walk.
   */
  const pendingMounts = useRef(new Set<string>());
  const drainScheduled = useRef(false);

  useEventHandler(
    "lighter:overlay-added",
    useCallback(
      ({ overlay }: { overlay: SelectableOverlay }) => {
        pendingMounts.current.add(overlay.id);

        if (drainScheduled.current) {
          return;
        }

        drainScheduled.current = true;

        queueMicrotask(() => {
          drainScheduled.current = false;

          const ids = [...pendingMounts.current];
          pendingMounts.current.clear();

          if (!scene) {
            return;
          }

          for (const id of ids) {
            // Re-resolve rather than closing over the overlay: between the
            // event and this drain the scene may have dropped it (a scrub
            // past the frame it belongs to).
            const current = scene.getOverlay(id);

            if (current) {
              reconcileRef.current(current);
            }
          }
        });
      },
      [scene],
    ),
  );
};
