/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  UNDEFINED_LIGHTER_SCENE_ID,
  dispatchAfterPaintSettle,
  useLighterEventBus,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback, useEffect, useState } from "react";
import type { LighterScene } from "./sceneSetupHooks";

/**
 * Reset the viewport to the identity frame once the renderer and the canonical
 * media's real bounds are both ready; bounds arrive after layout, so
 * renderer-ready alone races a zero-size scene. Once the reset settles
 * on-canvas, dispatches `lighter:viewport-init-complete` so tiles stay hidden
 * until overlays paint at their final transform.
 */
export function useViewportReset(scene: LighterScene, sceneId: string): void {
  // Readiness is recorded per scene id: a re-minted scene starts over, so a
  // signal the previous scene raised can never open the new one early
  const [rendererReadyFor, setRendererReadyFor] = useState<string | null>(null);
  const [mediaBoundsReadyFor, setMediaBoundsReadyFor] = useState<string | null>(
    null,
  );
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  useEventHandler(
    "lighter:renderer-ready",
    useCallback(() => setRendererReadyFor(sceneId), [sceneId]),
  );

  useEventHandler(
    "lighter:canonical-media-bounds-changed",
    useCallback(() => setMediaBoundsReadyFor(sceneId), [sceneId]),
  );

  useEffect(() => {
    if (
      !scene ||
      rendererReadyFor !== sceneId ||
      mediaBoundsReadyFor !== sceneId
    ) {
      return;
    }

    if (scene.getSceneId() !== sceneId) {
      return;
    }

    scene.resetZoomPan();
    dispatchAfterPaintSettle(scene, () =>
      eventBus.dispatch("lighter:viewport-init-complete", {}),
    );
  }, [scene, sceneId, rendererReadyFor, mediaBoundsReadyFor, eventBus]);
}
