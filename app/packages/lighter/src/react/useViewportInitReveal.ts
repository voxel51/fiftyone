/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { useCallback, useEffect, useState } from "react";
import type { Scene2D } from "../core/Scene2D";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "./useLighterEventHandler";

/** The minimal scene surface {@link dispatchAfterPaintSettle} needs. */
type SettleScene = Pick<Scene2D, "registerRenderCallback">;

/**
 * Run `dispatch` once the scene graph's CURRENT state has actually been
 * composited to the canvas.
 *
 * Because renderFrame is async, the renderOverlay() calls that mutate the
 * scene graph (adding Graphics objects to the Pixi stage) haven't run yet by
 * the time Pixi renders the next tick — they're suspended in a pending
 * microtask. So the first canvas paint after a viewport change shows nothing
 * (or whatever was there before); only the second tick composites the mutated
 * graph.
 *
 * HACK: a double-tick pattern covers this. A cleaner solution may be to make
 * Scene2D.renderFrame synchronous so scene graph mutations happen in the same
 * tick as Pixi's per-tick render. That would not work if an overlay awaited
 * some async task before mutating the scene graph, but there are no cases of
 * that behavior today.
 */
export function dispatchAfterPaintSettle(
  scene: SettleScene,
  dispatch: () => void,
): void {
  // Tick N: wait for the render loop to finish mutating the scene graph
  // (renderOverlay calls) before registering a second callback.
  const unregister1 = scene.registerRenderCallback({
    phase: "after",
    callback: () => {
      unregister1();

      // Tick N+1: by the time this fires, Pixi has composited the scene
      // graph mutations from tick N to the canvas.
      const unregister2 = scene.registerRenderCallback({
        phase: "after",
        callback: () => {
          unregister2();
          dispatch();
        },
      });
    },
  });
}

/** The minimal scene surface {@link useViewportInitReveal} needs. */
type RevealScene = Pick<Scene2D, "getEventChannel">;

/**
 * `true` once the scene has dispatched `lighter:viewport-init-complete` — the
 * signal that the initial viewport is applied and a settled frame (media +
 * overlays) has been composited, so the surface is safe to reveal. Hosts
 * should keep the scene's visual output `visibility: hidden` until then;
 * revealing earlier shows overlays mid-hydration jumping to their final
 * transform.
 *
 * `resetKey` re-hides when it changes (e.g. a re-minted scene id) until the
 * new scene's own init completes.
 */
export function useViewportInitReveal(
  scene: RevealScene | null | undefined,
  resetKey?: unknown,
): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [resetKey]);

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  useEventHandler(
    "lighter:viewport-init-complete",
    useCallback(() => setRevealed(true), []),
  );

  return revealed;
}
