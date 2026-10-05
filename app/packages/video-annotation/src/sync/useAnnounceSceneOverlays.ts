/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getEventBus } from "@fiftyone/events";
import type { BaseOverlay, useLighterSetupWithPixi } from "@fiftyone/lighter";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback, useRef } from "react";

type Scene = ReturnType<typeof useLighterSetupWithPixi>["scene"];

export const OVERLAYS_SHOWN_EVENT = "e2e:video-annotation:overlays-shown";
export const OVERLAY_SHOWN_EVENT = "e2e:video-annotation:overlay-shown";

export type SceneOverlaysShown = {
  /** the fields the scene's overlays belong to, space separated */
  fields: string;
  /** the overlay ids, space separated */
  ids: string;
};

export type OverlayShown = {
  id: string;
  field: string;
  type: string;
  /** relative `x,y` vertices joined by `;`; empty for overlays without points */
  points: string;
};

type SceneOverlaysE2EEvents = {
  [OVERLAYS_SHOWN_EVENT]: SceneOverlaysShown;
  [OVERLAY_SHOWN_EVENT]: OverlayShown;
};

type WithRelativePoints = {
  getRelativePoints?: () => [number, number][];
};

/** The overlay set a scene shows, in primitive fields */
export const describeSceneOverlays = (
  overlays: readonly BaseOverlay[],
): SceneOverlaysShown => ({
  fields: Array.from(new Set(overlays.map((o) => o.field))).join(" "),
  ids: overlays.map((o) => o.id).join(" "),
});

/** One overlay as drawn, in primitive fields */
export const describeOverlay = (overlay: BaseOverlay): OverlayShown => ({
  id: overlay.id,
  field: overlay.field,
  type: overlay.getOverlayType(),
  points:
    (overlay as unknown as WithRelativePoints)
      .getRelativePoints?.()
      .map(([x, y]) => `${x},${y}`)
      .join(";") ?? "",
});

/**
 * After each frame that paints an overlay change, dispatches
 * {@link OVERLAYS_SHOWN_EVENT} when the scene's overlay set changed, and
 * {@link OVERLAY_SHOWN_EVENT} for each overlay whose drawn state changed.
 */
export const useAnnounceSceneOverlays = (scene: Scene): void => {
  const on = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );
  const shownSet = useRef<string | null>(null);
  const shownOverlays = useRef(new Map<string, string>());
  const shownScene = useRef(scene);
  if (shownScene.current !== scene) {
    // a new scene announces its overlays afresh, even the same set
    shownScene.current = scene;
    shownSet.current = null;
    shownOverlays.current = new Map();
  }

  on(
    "lighter:overlays-painted",
    useCallback(() => {
      if (!scene) return;
      const bus = getEventBus<SceneOverlaysE2EEvents>();
      const overlays = scene.getAllOverlays();
      for (const overlay of overlays) {
        const shown = describeOverlay(overlay);
        const key = `${shown.field}|${shown.type}|${shown.points}`;
        if (shownOverlays.current.get(shown.id) === key) continue;
        shownOverlays.current.set(shown.id, key);
        bus.dispatch(OVERLAY_SHOWN_EVENT, shown);
      }
      const set = describeSceneOverlays(overlays);
      const setKey = `${set.fields}|${set.ids}`;
      if (shownSet.current === setKey) return;
      shownSet.current = setKey;
      bus.dispatch(OVERLAYS_SHOWN_EVENT, set);
    }, [scene]),
  );
};
