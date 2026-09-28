/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventBus,
  type LighterEventGroup,
  type useLighterSetupWithPixi,
} from "@fiftyone/lighter";
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

/** Lighter events re-dispatched on `document`, where `EventUtils` can arm on them. */
const FORWARDED_EVENTS: (keyof LighterEventGroup)[] = [
  "lighter:overlay-click",
  "lighter:overlay-removed",
];

// payloads can hold live overlays, which don't serialize to Playwright
const primitiveFields = (payload: unknown): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries((payload ?? {}) as Record<string, unknown>).filter(
      ([, value]) =>
        value === null ||
        (typeof value !== "object" && typeof value !== "function"),
    ),
  );

/**
 * Publish the scene's live overlay fields on `window` for e2e assertions. A
 * read-only probe — it never drives app behavior; the hook owns the global's
 * lifecycle and clears it on scene change / unmount.
 */
export const useExposeSceneOverlayFieldsForTest = (scene: Scene): void => {
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  useEffect(() => {
    const offs = FORWARDED_EVENTS.map((event) =>
      eventBus.on(event, (payload: unknown) => {
        document.dispatchEvent(
          new CustomEvent(event, { detail: primitiveFields(payload) }),
        );
      }),
    );

    return () => offs.forEach((off) => off());
  }, [eventBus]);

  useEffect(() => {
    if (!scene) {
      return undefined;
    }

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
    };
  }, [scene]);
};
