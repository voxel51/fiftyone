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
import type { LabelData } from "@fiftyone/utilities";
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

type Bump = () => void;

/** Bump on a `TemporalOverlay` add or any overlay removal in the scene. */
const useSceneOverlayBumps = (scene: Scene2D | null, bump: Bump): void => {
  const useLighterEvent = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  useLighterEvent(
    "lighter:overlay-added",
    useCallback(
      (payload) => {
        if (payload.overlay instanceof TemporalOverlay) {
          bump();
        }
      },
      [bump],
    ),
  );

  // The removed payload carries only an id, so we can't tell a TD from a
  // detection by type — bump on ANY removal. Re-deriving the small TD set on an
  // unrelated detection delete is cheap, and never missing a TD removal keeps
  // the timeline rows in step.
  useLighterEvent(
    "lighter:overlay-removed",
    useCallback(() => bump(), [bump]),
  );
};

/** Opt-in: bump on a `TemporalDetection` label edit. Handler is a no-op when off. */
const useLabelEditBump = (enabled: boolean, bump: Bump): void => {
  useAnnotationEventHandler(
    "annotation:labelEdit",
    useCallback(
      (payload) => {
        if (!enabled) {
          return;
        }

        const cls = (payload.label as Partial<LabelData> | null)?._cls;
        if (cls === "TemporalDetection") {
          bump();
        }
      },
      [bump, enabled],
    ),
  );
};

/** Opt-in: emit a one-shot bump once `scene` becomes available. */
const useSceneReadyBump = (
  enabled: boolean,
  scene: Scene2D | null,
  bump: Bump,
): void => {
  useEffect(() => {
    if (enabled && scene) {
      bump();
    }
  }, [enabled, scene, bump]);
};

/**
 * A counter that bumps whenever the scene's `TemporalDetection` set could have
 * changed — a `TemporalOverlay` added to, or a `td-` overlay removed from, the
 * scene. Lets consumers re-derive scene-only TD state that a sample- or
 * sidebar-derived signature can't observe.
 *
 * Two opt-in extras via {@link TemporalOverlayVersionOptions} cover the
 * TD-track rebuild's needs; their handlers are always registered (no
 * conditional hooks) and no-op when the flag is off.
 */
export function useTemporalOverlayVersion(
  scene: Scene2D | null,
  {
    listenLabelEdit = false,
    bumpOnSceneReady = false,
  }: TemporalOverlayVersionOptions = {},
): number {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useSceneOverlayBumps(scene, bump);
  useLabelEditBump(listenLabelEdit, bump);
  useSceneReadyBump(bumpOnSceneReady, scene, bump);

  return version;
}
