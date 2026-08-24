/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Scene2D } from "@fiftyone/lighter";
import { useEffect } from "react";

declare global {
  interface Window {
    /**
     * E2E affordance: the canonical media's current screen-space bounds (page
     * coordinates), or `null` before the media mounts. The media is PIXI (not
     * DOM), so this is the only handle a Playwright spec has to address image
     * points — the annotation top bar above the canvas means the modal
     * column's box no longer approximates the media region. Read live;
     * removed when the surface unmounts.
     */
    __FO_PLAYWRIGHT_MEDIA_SCREEN_BOUNDS?: () => {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
  }
}

/**
 * Publish the canonical media's screen bounds on `window` for e2e coordinate
 * mapping. A read-only probe — it never drives app behavior; the hook owns
 * the global's lifecycle and clears it on scene change / unmount.
 */
export const useExposeMediaBoundsForTest = (
  scene: Scene2D | null | undefined,
): void => {
  useEffect(() => {
    if (!scene) {
      return undefined;
    }

    window.__FO_PLAYWRIGHT_MEDIA_SCREEN_BOUNDS = () => {
      const media = scene.getCanonicalMedia();

      if (!media) {
        return null;
      }

      const world = media.getRenderedBounds();

      if (!world.width || !world.height) {
        return null;
      }

      // The viewport's own transform floats, applied exactly as the
      // renderer's world↔screen mapping does — a numerically derived
      // transform (e.g. inverting screenToWorld samples) carries ~1e-8
      // noise, which surfaces in geometry that specs assert exactly.
      const { scale, panX, panY } = scene.getViewportState();
      const canvas = scene.getCanvasBounds();

      return {
        x: canvas.x + world.x * scale + panX,
        y: canvas.y + world.y * scale + panY,
        width: world.width * scale,
        height: world.height * scale,
      };
    };

    return () => {
      delete window.__FO_PLAYWRIGHT_MEDIA_SCREEN_BOUNDS;
    };
  }, [scene]);
};
