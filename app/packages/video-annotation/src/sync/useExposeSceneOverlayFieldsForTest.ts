/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { useLighterSetupWithPixi } from "@fiftyone/lighter";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { isE2E } from "@fiftyone/utilities";
import { useCallback, useEffect } from "react";

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

    /**
     * E2E affordance: the live GEOMETRY of the overlays mounted on the video
     * annotation scene, as the canvas currently holds it — not as the engine
     * stores it. The two can disagree (a projection that never reached the
     * overlay), and PIXI overlays have no DOM a spec could inspect, so this is
     * the only way to assert what is actually drawn. Read live.
     */
    __FO_PLAYWRIGHT_SCENE_OVERLAY_GEOMETRY?: () => Array<{
      id: string;
      field: string;
      type: string;
      /** Relative [x, y] vertices, for point-bearing overlays. */
      points?: [number, number][];
    }>;
  }
}

/**
 * The DOM mirror of the scene's overlay set: `data-cy-scene-overlay-fields`
 * and `data-cy-scene-overlay-ids` (space separated) on the surface element, so
 * a spec can assert what the canvas paints with a locator instead of a poll.
 */
const stampSceneOverlays = (scene: NonNullable<Scene>) => {
  const surface = document.querySelector(
    '[data-cy="video-annotation-surface"]',
  );
  if (!surface) {
    return;
  }

  const overlays = scene.getAllOverlays();
  surface.setAttribute(
    "data-cy-scene-overlay-fields",
    Array.from(new Set(overlays.map((o) => o.field))).join(" "),
  );
  surface.setAttribute(
    "data-cy-scene-overlay-ids",
    overlays.map((o) => o.id).join(" "),
  );
};

/**
 * Under browser automation only, publish the scene's live overlay fields on
 * `window` and mirror the overlay set onto the surface's DOM attributes. A
 * read-only probe that never drives app behavior; it clears the globals on
 * scene change / unmount.
 */
export const useExposeSceneOverlayFieldsForTest = (scene: Scene): void => {
  const on = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  // after the scene has applied the add/remove, not during its dispatch
  const stamp = useCallback(() => {
    if (scene && isE2E()) {
      queueMicrotask(() => stampSceneOverlays(scene));
    }
  }, [scene]);

  on("lighter:overlay-added", stamp);
  on("lighter:overlay-removed", stamp);

  useEffect(() => {
    if (!scene || !isE2E()) {
      return undefined;
    }

    stampSceneOverlays(scene);

    window.__FO_PLAYWRIGHT_SCENE_OVERLAY_FIELDS = () =>
      Array.from(new Set(scene.getAllOverlays().map((o) => o.field)));

    window.__FO_PLAYWRIGHT_SCENE_OVERLAY_GEOMETRY = () =>
      scene.getAllOverlays().map((overlay) => {
        const withPoints = overlay as unknown as {
          getRelativePoints?: () => [number, number][];
        };

        return {
          id: overlay.id,
          field: overlay.field,
          type: overlay.getOverlayType?.() ?? "unknown",
          points: withPoints.getRelativePoints?.(),
        };
      });

    return () => {
      delete window.__FO_PLAYWRIGHT_SCENE_OVERLAY_FIELDS;
      delete window.__FO_PLAYWRIGHT_SCENE_OVERLAY_GEOMETRY;
      // a surface that outlives its scene must not report the old overlays
      const surface = document.querySelector(
        '[data-cy="video-annotation-surface"]',
      );
      surface?.removeAttribute("data-cy-scene-overlay-fields");
      surface?.removeAttribute("data-cy-scene-overlay-ids");
    };
  }, [scene]);
};
