/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEventHandler } from "@fiftyone/annotation";
import {
  type Scene2D,
  TemporalOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback, useEffect, useState } from "react";

interface TemporalOverlayVersionOptions {
  /**
   * Bump on `annotation:labelEdit` for a `TemporalDetection` label.
   * Default `false`.
   */
  listenLabelEdit?: boolean;
  /**
   * Emit a one-shot bump once `scene` becomes available, so TDs that
   * `useTemporalOverlaySync` added before this hook's handlers registered are
   * still picked up. Default `false`.
   */
  bumpOnSceneReady?: boolean;
}

/**
 * A counter that bumps whenever the scene's `TemporalDetection` set could have
 * changed — a `TemporalOverlay` added to, or a `td-` overlay removed from, the
 * scene. Lets consumers re-derive scene-only TD state that a sample- or
 * sidebar-derived signature can't observe.
 *
 * Two opt-in extras via {@link TemporalOverlayVersionOptions} cover the
 * TD-track rebuild's needs without forking the hook; their handlers are always
 * registered (no conditional hooks) and no-op when the flag is off.
 */
export function useTemporalOverlayVersion(
  scene: Scene2D | null,
  {
    listenLabelEdit = false,
    bumpOnSceneReady = false,
  }: TemporalOverlayVersionOptions = {}
): number {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const useLighterEvent = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  useLighterEvent(
    "lighter:overlay-added",
    useCallback(
      (payload) => {
        if (payload.overlay instanceof TemporalOverlay) {
          bump();
        }
      },
      [bump]
    )
  );

  useLighterEvent(
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        if (payload.id?.startsWith("td-")) {
          bump();
        }
      },
      [bump]
    )
  );

  // Always registered to keep hook order stable; no-ops unless opted in.
  useAnnotationEventHandler(
    "annotation:labelEdit",
    useCallback(
      (payload) => {
        if (!listenLabelEdit) {
          return;
        }
        const cls = (payload.label as { _cls?: string } | null)?._cls;
        if (cls === "TemporalDetection") {
          bump();
        }
      },
      [bump, listenLabelEdit]
    )
  );

  useEffect(() => {
    if (bumpOnSceneReady && scene) {
      bump();
    }
  }, [bumpOnSceneReady, scene, bump]);

  return version;
}
