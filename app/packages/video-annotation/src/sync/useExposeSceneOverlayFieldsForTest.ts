/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { useLighterSetupWithPixi } from "@fiftyone/lighter";
import { useEffect } from "react";

type Scene = ReturnType<typeof useLighterSetupWithPixi>["scene"];

declare global {
  interface Window {
    /**
     * E2E affordance: the distinct fields of the overlays currently mounted on
     * the video annotation scene. Canvas overlays are PIXI (not DOM), so this
     * is the only handle a Playwright spec has to assert that the canvas honors
     * the active schema (deactivating a field hides its overlays). Read live;
     * removed when the surface unmounts.
     */
    __FO_PLAYWRIGHT_SCENE_OVERLAY_FIELDS?: () => string[];
  }
}

/**
 * Publish the scene's live overlay fields on `window` for e2e assertions. A
 * read-only probe — it never drives app behavior; the hook owns the global's
 * lifecycle and clears it on scene change / unmount.
 */
export const useExposeSceneOverlayFieldsForTest = (scene: Scene): void => {
  useEffect(() => {
    if (!scene) {
      return undefined;
    }

    window.__FO_PLAYWRIGHT_SCENE_OVERLAY_FIELDS = () =>
      Array.from(new Set(scene.getAllOverlays().map((o) => o.field)));

    return () => {
      delete window.__FO_PLAYWRIGHT_SCENE_OVERLAY_FIELDS;
    };
  }, [scene]);
};
