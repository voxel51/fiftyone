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
import { useCallback, useMemo } from "react";

import type { AnnotationEngine } from "../../core/engine";
import { toLabelRef } from "../../identity/ref";
import { useSurfaceBridge } from "../../react/useSurfaceBridge";
import { lighterAdapters } from "./adapters";
import type { LighterBridgeDeps } from "./lighterBridge";
import { createLighterBridge } from "./lighterBridge";

export const useLighterEngineBridge = ({
  engine,
  sample,
  resolveMediaUrl,
}: {
  engine: AnnotationEngine;
  sample: string;
  /**
   * Maps raw media sub-field values (e.g. `mask_path`) to fetchable URLs for
   * gated mounts — the modal wiring owns the sample's `sources` map.
   */
  resolveMediaUrl?: LighterBridgeDeps["resolveMediaUrl"];
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
            readLabel: (ref) => engine.getLabel(toLabelRef(sample, ref)),
            resolveMediaUrl,
          })
        : undefined,
    [engine, scene, overlayFactory, sample, resolveMediaUrl]
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

  // interaction write-half
  on(
    "lighter:overlay-select",
    useCallback(
      (event: { id: string; isShiftPressed?: boolean }) => {
        surface.selectHandle((scene as Scene2D).getOverlay(event.id), {
          additive: event.isShiftPressed,
        });
      },
      [scene, surface]
    )
  );

  on(
    "lighter:overlay-deselect",
    useCallback(
      (event: { id: string }) => {
        const overlay = (scene as Scene2D).getOverlay(event.id);

        if (overlay) {
          surface.toggleActive(
            { path: overlay.field, instanceId: overlay.id },
            false
          );
        }
      },
      [scene, surface]
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
};
