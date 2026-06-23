/**
 * The Lighter wiring hook: registers the bridge (the engine
 * derives the whole read-half) and routes Lighter's finalize/select/hover
 * gesture events into the surface controller. Surface code carries only
 * gesture vocabulary — dispatch, refs, transactions, reconcile, identity, and
 * persistence are all the engine's.
 *
 * Lighter mints durable ObjectIds for draft overlays (`overlay.id ===
 * label._id` from birth), so establish commits through the same upsert path
 * as edits — no re-id / evict-re-add cycle exists to avoid.
 */

import type { Scene2D } from "@fiftyone/lighter";
import {
  DetectionOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { AnnotationEngine } from "../../core/engine";
import { encodeEntityId } from "../../identity/entityId";
import { stampFrame, toLabelRef } from "../../identity/ref";
import { useSurfaceBridge } from "../../react/useSurfaceBridge";
import { GEOMETRY_SIGNAL, type GeometrySignal } from "../../signals/geometry";
import { lighterAdapters } from "./adapters";
import type { LighterInteractionPolicy } from "./interactionPolicy";
import type { LighterBridgeDeps } from "./lighterBridge";
import { createLighterBridge } from "./lighterBridge";

export interface UseLighterEngineBridgeArgs {
  engine: AnnotationEngine;
  sample: string;
  /** Ambient dataset — the `EntityId` namespace for signal keys. */
  dataset: string;
  /** Active label paths — the bridge's partial-projection scope. A new set
   *  re-creates the bridge: the outgoing one clears, registration rehydrates. */
  paths?: ReadonlySet<string>;
  /**
   * Maps raw media sub-field values (e.g. `mask_path`) to fetchable URLs for
   * gated mounts — the modal wiring owns the sample's `sources` map.
   */
  resolveMediaUrl?: LighterBridgeDeps["resolveMediaUrl"];
  interactionPolicy?: LighterInteractionPolicy;
  /**
   * Frame-locked surfaces (the video canvas) supply the playhead's current
   * frame for an overlay's PATH; the bridge stamps it onto the ref so
   * writes/selection address `(instanceId, frame)`. Returns `undefined` for a
   * sample-level path (a temporal detection sharing the video scene) so its ref
   * stays frame-agnostic and matches the sidebar / timeline. MUST be
   * referentially stable (a new identity re-creates the bridge). Omitted by
   * image/3D — refs stay frame-agnostic.
   */
  frameOf?: (path: string) => number | undefined;
  /**
   * Called right after a freshly-drawn overlay is committed + selected, with its
   * overlay id and the gesture `undoKey` the commit landed under. A surface uses
   * it to fold a follow-up write into the draw's single undo unit (the video
   * auto-extend), keyed by overlay id. Omitted by image/3D.
   */
  onEstablishCommit?: (overlayId: string, undoKey: string) => void;
  /**
   * Gate the whole surface off without violating hook order: a disabled bridge
   * registers nothing AND binds its gesture handlers to the inert sentinel
   * channel, so a shared scene (the video tile sets the global `lighterSceneAtom`
   * the image sidebar also reads) never routes its events through the wrong
   * surface. Default on.
   */
  enabled?: boolean;
}

export const useLighterEngineBridge = ({
  engine,
  sample,
  dataset,
  paths,
  resolveMediaUrl,
  interactionPolicy,
  frameOf,
  onEstablishCommit,
  enabled = true,
}: UseLighterEngineBridgeArgs): void => {
  const { scene, overlayFactory } = useLighter();
  // disabled → bind to the inert channel so handlers never fire on a scene this
  // surface doesn't own (rules-of-hooks safe: the hook is always called)
  const on = useLighterEventHandler(
    enabled && scene ? scene.getEventChannel() : UNDEFINED_LIGHTER_SCENE_ID
  );

  const bridge = useMemo(
    () =>
      enabled && scene
        ? createLighterBridge({
            scene,
            overlayFactory,
            sample,
            paths,
            // the gated-mask discard probe; on a frame-locked surface getLabel
            // needs the playhead's frame (the FrameStore is frame-keyed), but
            // only for frame-scoped paths — a sample-level path stays frame-less
            readLabel: (ref) =>
              engine.getLabel(toLabelRef(sample, stampFrame(ref, frameOf))),
            resolveMediaUrl,
            frameOf,
          })
        : undefined,
    [
      enabled,
      engine,
      scene,
      overlayFactory,
      sample,
      paths,
      resolveMediaUrl,
      frameOf,
    ]
  );

  // a replaced bridge (scope/scene/sample change) clears its overlays on the
  // way out; the successor's registration mounts the new scope by reconcile
  useEffect(
    () => () => {
      if (bridge && !scene?.isDestroyed) {
        bridge.clear();
      }
    },
    [bridge, scene]
  );

  const surface = useSurfaceBridge({
    engine,
    bridge,
    adapters: lighterAdapters,
  });

  const commitOverlay = useCallback(
    (event: { overlayId: string }) => {
      surface.commit((scene as Scene2D).getOverlay(event.overlayId));
    },
    [scene, surface]
  );

  // Gesture coalescing: drawing a masked detection commits in several steps —
  // establish (create) + paint-end (geometry) synchronously, then a re-commit of
  // the encoded mask in a later tick (the encode is async — see
  // DetectionOverlay.paintEnd). Each would otherwise land as its own undo entry.
  // A gesture spans from its first finalize until the async mask tail resolves:
  // we mint one key on the first finalize and REUSE it for every commit until the
  // tail (overlay-commit-requested) consumes and clears it, so all share one undoKey
  // and a single Ctrl-Z reverts the whole draw. A later edit (no in-flight key)
  // mints a fresh key, so independent edits stay separate undo units.
  const gestureEpoch = useRef(0);
  const pendingMaskKey = useRef(new Map<string, string>());

  // `retain` = a mask tail is still coming for this overlay (the async
  // overlay-commit-requested). Only then do we keep the key in `pendingMaskKey`
  // for the tail to consume. A maskless draw retains nothing, so a LATER mask
  // edit (init/remove) on the same overlay can't pick up a stale key and
  // over-merge into the draw's undo unit.
  const gestureKeyFor = useCallback((overlayId: string, retain: boolean) => {
    const inFlight = pendingMaskKey.current.get(overlayId);

    if (inFlight) {
      return inFlight;
    }

    const key = `${overlayId}:${(gestureEpoch.current += 1)}`;

    if (retain) {
      pendingMaskKey.current.set(overlayId, key);
    }

    return key;
  }, []);

  const commitWithMaskTail = useCallback(
    (event: { overlayId: string }) => {
      const overlay = (scene as Scene2D).getOverlay(event.overlayId);
      // A mask tail follows only when the overlay has a mask (establish fires for
      // both a plain box and a painted segmentation — InteractionManager's
      // SETTING/PAINTING cases — so the overlay, not the event, is the signal).
      const expectsMaskTail =
        overlay instanceof DetectionOverlay && overlay.hasMask();
      const key = gestureKeyFor(event.overlayId, expectsMaskTail);
      surface.commit(overlay, { undoKey: key });
      return key;
    },
    [gestureKeyFor, scene, surface]
  );

  const commitMaskTail = useCallback(
    (event: { overlayId: string; gestureId?: string }) => {
      // A gestureId on the event correlates this commit to a multi-commit gesture
      // (e.g. a merge stamps it on the events mergeFrom emits) — only the
      // gesture's own writes carry it, so unrelated writes never coalesce. Else
      // fall back to the in-flight per-overlay paint key (consume-once); a plain
      // label-updated finds neither and stays its own undo unit.
      const key =
        event.gestureId ?? pendingMaskKey.current.get(event.overlayId);
      pendingMaskKey.current.delete(event.overlayId);
      surface.commit(
        (scene as Scene2D).getOverlay(event.overlayId),
        key ? { undoKey: key } : undefined
      );
    },
    [scene, surface]
  );

  // Establish = a freshly drawn overlay finalizing. Commit it, then route its
  // selection THROUGH the engine so the new label enters interaction `active`
  // (anchor ∈ active) and the scene's visual selection becomes engine-owned.
  // Without this the draw is selected only in the scene (createNew selects it
  // with ignoreSideEffects / interactive mode), so exit's `setActive([])` is a
  // no-op and the overlay keeps its handles after the form closes.
  const establishOverlay = useCallback(
    (event: { overlayId: string }) => {
      const undoKey = commitWithMaskTail(event);
      const overlay = (scene as Scene2D).getOverlay(event.overlayId);

      if (overlay) {
        surface.selectHandle(overlay);
      }

      // hand the gesture key to surfaces that fold a follow-up write into the
      // draw's undo unit (video auto-extend), keyed by overlay id
      onEstablishCommit?.(event.overlayId, undoKey);
    },
    [commitWithMaskTail, onEstablishCommit, scene, surface]
  );

  // WRITE-HALF: finalize events → commit (upsert by the overlay's durable id).
  // establish + paint-end produce an async mask tail, so they coalesce; drag /
  // resize / keypoint are single synchronous commits (no tail) and stay plain.
  on("lighter:overlay-drag-end", commitOverlay);
  on("lighter:overlay-resize-end", commitOverlay);
  on("lighter:overlay-paint-end", commitWithMaskTail);
  on("lighter:overlay-establish", establishOverlay);
  on("lighter:keypoint-point-added", commitOverlay);
  on("lighter:keypoint-point-moved", commitOverlay);
  on("lighter:keypoint-point-deleted", commitOverlay);
  // MASK-COMMIT CHANNEL: an overlay whose mask was mutated locally
  // (paint/merge/restore/init/remove, or an applied agent label) requests a
  // commit here — including the async re-emit after a mask finishes encoding,
  // which carries the gesture key so the encoded mask folds into the same undo
  // unit as the synchronous finalize. The sidebar does NOT route through this;
  // it writes the engine directly (Position/Field `scoped.updateLabel`).
  on("lighter:overlay-commit-requested", commitMaskTail);

  // LIVE GEOMETRY: republish mid-drag bounds as a signal so observers (the
  // sidebar position panel) preview the gesture without subscribing to Lighter.
  // Render-only — the committed write still happens at drag/resize-end above.
  const publishGeometry = useCallback(
    (event: { id: string }) => {
      const overlay = (scene as Scene2D)?.getOverlay(event.id);

      if (!(overlay instanceof DetectionOverlay) || !overlay.hasValidBounds()) {
        return;
      }

      // publish the data-model RELATIVE bounds — the observer renders them
      // directly; no pixel conversion (it both needs the scene and round-trips
      // with float drift)
      const b = overlay.relativeBounds;
      const key = encodeEntityId(dataset, {
        sample,
        path: overlay.field,
        instanceId: overlay.id,
      });

      engine.publishSignal<GeometrySignal>(GEOMETRY_SIGNAL, key, {
        kind: "2d",
        bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
      });
    },
    [dataset, engine, sample, scene]
  );

  on("lighter:overlay-drag-move", publishGeometry);
  on("lighter:overlay-resize-move", publishGeometry);

  // interaction write-half
  on(
    "lighter:overlay-select",
    useCallback(
      (event: {
        id: string;
        isShiftPressed?: boolean;
        ignoreSideEffects?: boolean;
      }) => {
        // flagged events are programmatic echoes (silent applies, teardown),
        // not gestures — and may fire inside the engine's dispatch window
        if (event.ignoreSideEffects) {
          return;
        }

        if (interactionPolicy?.interceptSelect?.(event.id)) {
          return;
        }

        surface.selectHandle((scene as Scene2D).getOverlay(event.id), {
          additive: event.isShiftPressed,
        });
      },
      [interactionPolicy, scene, surface]
    )
  );

  on(
    "lighter:overlay-deselect",
    useCallback(
      (event: { id: string; ignoreSideEffects?: boolean }) => {
        if (event.ignoreSideEffects) {
          return;
        }

        if (interactionPolicy?.interceptDeselect?.(event.id)) {
          return;
        }

        const overlay = (scene as Scene2D).getOverlay(event.id);

        if (overlay) {
          // frame-stamp on a frame-locked surface so the ref matches the
          // frame-keyed active entry (refKey includes frame); a sample-level
          // path stays frame-less (frameOf returns undefined for it)
          surface.toggleActive(
            stampFrame(
              { path: overlay.field, instanceId: overlay.id },
              frameOf
            ),
            false
          );
        }
      },
      [interactionPolicy, scene, surface, frameOf]
    )
  );

  on(
    "lighter:overlay-hover",
    useCallback(
      (event: { id: string }) => {
        const overlay = (scene as Scene2D).getOverlay(event.id);

        if (overlay) {
          surface.hoverHandle(overlay, true);
        }
      },
      [scene, surface]
    )
  );

  on(
    "lighter:overlay-unhover",
    useCallback(
      (event: { id: string }) => {
        const overlay = (scene as Scene2D).getOverlay(event.id);

        if (overlay) {
          surface.hoverHandle(overlay, false);
        }
      },
      [scene, surface]
    )
  );

  // the pointer left the canvas — release every hover THIS surface holds,
  // leaving other surfaces' hover state (e.g. a linked 3D slice) untouched.
  // Ownership = the ref is for this sample and resolves to an overlay this
  // scene renders; we never reach across surfaces to clear hover wholesale.
  on(
    "lighter:overlay-all-unhover",
    useCallback(() => {
      const owned = engine.interaction
        .getHovered()
        .filter(
          (ref) =>
            ref.sample === sample &&
            !!(scene as Scene2D).getOverlay(ref.instanceId)
        );

      engine.interaction.pruneHovered(owned);
    }, [engine, sample, scene])
  );
};
