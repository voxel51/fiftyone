/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useLighterSetupWithPixi } from "@fiftyone/lighter";
import { useModalLookerOptions } from "@fiftyone/state";
import { type DependencyList, type RefObject, useMemo } from "react";
import {
  type Dimensions,
  type LighterScene,
  useAttachedSingletonCanvas,
  useCanonicalMediaInstall,
  useSceneColorScheme,
  useSceneInteractionFlags,
} from "./useLighterSceneSetup";
import { useViewportReset } from "./useViewportReset";

export { useViewportReset };

/**
 * Owns the Lighter scene lifecycle shared by both video-annotation tiles:
 * attaches the singleton canvas, sets up the pixi scene under a fresh scene
 * id, syncs the color scheme, installs a canonical-media overlay sized to
 * `dims`, and resets the viewport once renderer + media are ready.
 *
 * `dims` is injected so the hook stays agnostic to how the tile discovered
 * them. `sceneIdDeps` recompute the scene id (the video tile re-mints per
 * source; pass nothing for a once-per-mount scene).
 *
 * Returns the scene plus whether its canonical media is installed; feed
 * `canonicalMediaReady` into {@link useVideoAnnotationSyncBundle}.
 */
export function useLighterMediaScene({
  hostRef,
  dims,
  sceneIdPrefix,
  sceneIdDeps = [],
  readOnly = false,
  multipleSelection = false,
  filterLabels = false,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  dims: Dimensions | null;
  sceneIdPrefix: string;
  sceneIdDeps?: DependencyList;
  /**
   * Block geometry mutation while keeping selection and hover. Explore sets
   * this: it renders labels it has no way to save, so an accidental drag
   * would otherwise commit a silent edit.
   */
  readOnly?: boolean;
  /**
   * Let the user build up a selection of several overlays at once, each click
   * toggling one in or out. Explore sets this: selecting labels IS the
   * interaction there (it feeds tagging), where on the annotation surfaces a
   * selection is the target of the next edit and only one can be.
   */
  multipleSelection?: boolean;
  /**
   * Apply the sidebar's confidence / label / tag filters and hidden-labels
   * set to the canvas, the way the looker's `Overlay.isShown` did. Off by
   * default (and for Annotate) for the same reason `useModalLookerOptions`
   * itself defaults `withFilter` to `false`: computing it costs a Recoil
   * read on every filter change, worth paying only where a hidden label is
   * actually meant to disappear rather than stay editable.
   */
  filterLabels?: boolean;
}): {
  scene: LighterScene;
  canonicalMediaReady: boolean;
} {
  const canvas = useAttachedSingletonCanvas(hostRef);

  // Modal options so activePaths / showOverlays / alpha (and, for Explore,
  // the sidebar filter) match the sidebar.
  const options = useModalLookerOptions(filterLabels);

  // Fresh scene id whenever `sceneIdDeps` change, so a new source gets its
  // own scene.
  const sceneId = useMemo(
    () => `${sceneIdPrefix}-${Math.random().toString(36).slice(2, 9)}`,
    // caller-supplied dep list; exhaustive-deps can't statically verify it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    sceneIdDeps,
  );

  const { scene } = useLighterSetupWithPixi(canvas, options, sceneId);

  useSceneInteractionFlags(scene, sceneId, { readOnly, multipleSelection });
  useSceneColorScheme(scene, sceneId);
  const canonicalMediaReady = useCanonicalMediaInstall(scene, sceneId, dims);
  useViewportReset(scene, sceneId);

  return { scene, canonicalMediaReady };
}
