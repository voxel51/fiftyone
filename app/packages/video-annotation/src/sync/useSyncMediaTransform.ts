/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import type { RefObject } from "react";
import { useCallback } from "react";

/**
 * Locks the canonical-media element (the `<video>` / frame `<canvas>` layered
 * behind the Lighter canvas) to the scene's zoom/pan, so scroll-zoom scales
 * the picture together with the overlays instead of just the boxes.
 *
 * Lighter draws overlays through the pixi-viewport transform; the external
 * media element is a plain DOM node that never receives it. The viewport maps
 * a world point `w` to screen as `pan + scale·w`, and at rest (scale 1, pan 0)
 * the media element's local coordinates already equal world coordinates — both
 * are container CSS pixels, and `object-fit: contain` letterboxes into the same
 * rect the coordinate system uses. So mirroring the viewport onto the element
 * is exactly `translate(panX, panY) scale(scale)` about a top-left origin (set
 * in CSS). Applied imperatively rather than via state so a wheel/drag stream
 * doesn't rerender the tile per frame.
 */
export const useSyncMediaTransform = <T extends HTMLElement>(
  scene: Scene2D | null,
  mediaRef: RefObject<T | null>
): void => {
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const apply = useCallback(
    (panX: number, panY: number, scale: number) => {
      const el = mediaRef.current;
      if (!el) {
        return;
      }

      el.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    },
    [mediaRef]
  );

  useEventHandler(
    "lighter:viewport-moved",
    useCallback((p) => apply(p.x, p.y, p.scale), [apply])
  );

  // Seed the resting transform once the renderer is ready — the pixi
  // viewport is initialized by then, so reading its state is safe (reading
  // it on mere `scene` presence races viewport init and throws). The
  // post-`fitToContent` framing then arrives as a `viewport-moved`. Fires
  // per scene, so remounts re-seed.
  useEventHandler(
    "lighter:renderer-ready",
    useCallback(() => {
      if (!scene) {
        return;
      }

      const { panX, panY, scale } = scene.getViewportState();
      apply(panX, panY, scale);
    }, [scene, apply])
  );
};
