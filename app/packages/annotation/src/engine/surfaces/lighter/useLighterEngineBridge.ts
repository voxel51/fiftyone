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
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback, useEffect, useMemo } from "react";

import type { AnnotationEngine } from "../../core/engine";
import { encodeEntityId } from "../../identity/entityId";
import { toLabelRef } from "../../identity/ref";
import { useSurfaceBridge } from "../../react/useSurfaceBridge";
import { GEOMETRY_SIGNAL, type GeometrySignal } from "../../signals/geometry";
import { lighterAdapters } from "./adapters";
import type { LighterInteractionPolicy } from "./interactionPolicy";
import type { LighterBridgeDeps } from "./lighterBridge";
import { createLighterBridge } from "./lighterBridge";

export const useLighterEngineBridge = ({
  engine,
  sample,
  dataset,
  paths,
  resolveMediaUrl,
  interactionPolicy,
}: {
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
}): void => {
  const { scene, overlayFactory } = useLighter();
  const on = useLighterEventHandler(scene?.getEventChannel());

  const bridge = useMemo(
    () =>
      scene
        ? createLighterBridge({
            scene,
            overlayFactory,
            sample,
            paths,
            readLabel: (ref) => engine.getLabel(toLabelRef(sample, ref)),
            resolveMediaUrl,
          })
        : undefined,
    [engine, scene, overlayFactory, sample, paths, resolveMediaUrl]
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

  // WRITE-HALF: finalize events → commit (upsert by the overlay's durable id)
  on("lighter:overlay-drag-end", commitOverlay);
  on("lighter:overlay-resize-end", commitOverlay);
  on("lighter:overlay-paint-end", commitOverlay);
  on("lighter:overlay-establish", commitOverlay);
  on("lighter:keypoint-point-added", commitOverlay);
  on("lighter:keypoint-point-moved", commitOverlay);
  on("lighter:keypoint-point-deleted", commitOverlay);
  // TRANSITIONAL: the legacy sidebar-attr route (sidebar → overlay → engine).
  // End state: the sidebar writes the engine directly and this retires.
  on("lighter:overlay-label-updated", commitOverlay);

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
          surface.toggleActive(
            { path: overlay.field, instanceId: overlay.id },
            false
          );
        }
      },
      [interactionPolicy, scene, surface]
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
