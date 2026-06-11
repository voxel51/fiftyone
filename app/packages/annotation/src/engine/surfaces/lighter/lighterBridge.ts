/**
 * The Lighter surface bridge: kind-agnostic plumbing between the
 * engine's read-half loop and a `Scene2D`. Methods close over the scene; the
 * engine never holds a scene reference.
 */

import type { BaseOverlay, OverlayFactory, Scene2D } from "@fiftyone/lighter";

import type { SurfaceBridge } from "../../bridge/types";
import type { LighterDescriptor } from "./adapters";

export interface LighterBridgeDeps {
  scene: Scene2D;
  overlayFactory: OverlayFactory;
  /** The sample the scene renders; scopes the engine change stream. */
  sample: string;
}

export const createLighterBridge = ({
  scene,
  overlayFactory,
  sample,
}: LighterBridgeDeps): SurfaceBridge<BaseOverlay, LighterDescriptor> => ({
  surface: "lighter",
  sample,

  resolveHandle: (ref) => {
    const overlay = scene.getOverlay(ref.instanceId);

    if (!overlay || overlay.field !== ref.path) {
      return undefined;
    }

    return overlay;
  },

  refOf: (overlay) => ({ path: overlay.field, instanceId: overlay.id }),

  mount: (descriptor) => {
    const overlay = overlayFactory.create<
      LighterDescriptor["options"],
      BaseOverlay
    >(descriptor.factoryKey, descriptor.options);
    scene.addOverlay(overlay);
    return overlay;
  },

  unmount: (overlay) => {
    scene.removeOverlay(overlay.id);
  },

  clear: () => {
    // Only engine-owned (persistable) overlays: UX-only overlays (the image
    // plane, drafts, cursors) are surface-owned transients.
    for (const overlay of scene.getAllOverlays()) {
      if (overlay.isPersistent) {
        scene.removeOverlay(overlay.id);
      }
    }
  },

  // silent interaction application: overlay flags are render state;
  // the engine's InteractionState is the cross-surface truth
  applySelected: (overlay, selected) => {
    const selectable = overlay as BaseOverlay & {
      setSelected?: (selected: boolean) => void;
    };
    selectable.setSelected?.(selected);
  },

  applyHovered: (overlay, hovered) => {
    if (hovered) {
      overlay.forceHoverEnter();
      return;
    }

    overlay.forceHoverLeave();
  },
});
