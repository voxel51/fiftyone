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
 * Run `dispatch` once the scene graph's current state has been composited to
 * the canvas. HACK: `renderFrame` is async, so the first tick after a change
 * paints the stale graph; the second tick composites the mutations.
 */
export function dispatchAfterPaintSettle(
  scene: SettleScene,
  dispatch: () => void,
): void {
  // tick N: the render loop finishes mutating the scene graph
  const unregister1 = scene.registerRenderCallback({
    phase: "after",
    callback: () => {
      unregister1();

      // tick N+1: Pixi has composited tick N's mutations
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
 * `true` once the scene has dispatched `lighter:viewport-init-complete`, so
 * hosts can keep the surface hidden until a settled frame is on canvas. A
 * change of `resetKey` re-hides until the new scene's own init completes.
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
