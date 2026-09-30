/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useEffect } from "react";
import type { LighterEventGroup } from "../events";
import { useLighterEventBus } from "./useLighterEventBus";
import { UNDEFINED_LIGHTER_SCENE_ID } from "./useLighterEventHandler";

/** Lighter events re-dispatched on `document`, where `EventUtils` can arm on them. */
const FORWARDED_EVENTS: (keyof LighterEventGroup)[] = [
  "lighter:overlay-click",
  "lighter:overlay-removed",
  "lighter:keypoint-point-added",
  "lighter:keypoint-point-moved",
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
 * E2E affordance: re-dispatch a scene's Lighter events on `document`. Lighter
 * events live on the scene's event bus, which a Playwright spec cannot
 * observe. A read-only probe: it never drives app behavior.
 *
 * @param scene The scene whose events to forward
 */
export const useForwardSceneEventsForTest = (
  scene: { getEventChannel(): string } | null | undefined,
): void => {
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
};
