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
import { useLighter, useLighterEventHandler } from "@fiftyone/lighter";
import { useCallback, useEffect, useMemo } from "react";

import type { AnnotationEngine } from "../../core/engine";
import { toLabelRef } from "../../identity/ref";
import { useSurfaceBridge } from "../../react/useSurfaceBridge";
import { lighterAdapters } from "./adapters";
import type { LighterBridgeDeps } from "./lighterBridge";
import { createLighterBridge } from "./lighterBridge";

export const useLighterEngineBridge = ({
  engine,
  sample,
  paths,
  resolveMediaUrl,
  interactionRoutes = true,
}: {
  engine: AnnotationEngine;
  sample: string;
  /** Active label paths — the bridge's partial-projection scope. A new set
   *  re-creates the bridge: the outgoing one clears, registration rehydrates. */
  paths?: ReadonlySet<string>;
  /**
   * Maps raw media sub-field values (e.g. `mask_path`) to fetchable URLs for
   * gated mounts — the modal wiring owns the sample's `sources` map.
   */
  resolveMediaUrl?: LighterBridgeDeps["resolveMediaUrl"];
  /**
   * TRANSITIONAL: when false, the select/hover gesture routes are not
   * wired — legacy focus/hover handlers own interaction policy (the
   * single-edit lock) until the sidebar form migrates. Finalize commits are
   * always routed.
   */
  interactionRoutes?: boolean;
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

  // interaction write-half (skipped while legacy handlers own the policy)
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
        if (!interactionRoutes || event.ignoreSideEffects) return;

        surface.selectHandle((scene as Scene2D).getOverlay(event.id), {
          additive: event.isShiftPressed,
        });
      },
      [interactionRoutes, scene, surface]
    )
  );

  on(
    "lighter:overlay-deselect",
    useCallback(
      (event: { id: string; ignoreSideEffects?: boolean }) => {
        if (!interactionRoutes || event.ignoreSideEffects) return;

        const overlay = (scene as Scene2D).getOverlay(event.id);

        if (overlay) {
          surface.toggleActive(
            { path: overlay.field, instanceId: overlay.id },
            false
          );
        }
      },
      [interactionRoutes, scene, surface]
    )
  );

  on(
    "lighter:overlay-hover",
    useCallback(
      (event: { id: string }) => {
        if (!interactionRoutes) return;

        const overlay = (scene as Scene2D).getOverlay(event.id);

        if (overlay) {
          surface.hoverHandle(overlay, true);
        }
      },
      [interactionRoutes, scene, surface]
    )
  );

  on(
    "lighter:overlay-unhover",
    useCallback(
      (event: { id: string }) => {
        if (!interactionRoutes) return;

        const overlay = (scene as Scene2D).getOverlay(event.id);

        if (overlay) {
          surface.hoverHandle(overlay, false);
        }
      },
      [interactionRoutes, scene, surface]
    )
  );
};
