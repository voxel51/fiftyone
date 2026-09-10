/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import type { Rect } from "@fiftyone/lighter";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventBus,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback, useState } from "react";
import { useAnnotationLabelsReady } from "../Sidebar/Annotate/useLabels";

export const useSceneEventHandler = () => {
  const { scene } = useLighter();

  return useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );
};

export const useSceneEventBus = () => {
  const { scene } = useLighter();

  return useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );
};

/** The canonical media bounds once the image has loaded, else `null`. */
export const useCanonicalMediaBounds = () => {
  const [bounds, setBounds] = useState<Rect | null>(null);

  useSceneEventHandler()(
    "lighter:canonical-media-bounds-changed",
    useCallback(({ bounds }: { bounds: Rect }) => {
      setBounds(bounds);
    }, []),
    { once: true },
  );

  return bounds;
};

/**
 * Whether at least one spatial overlay is in the scene, re-checked on every
 * `lighter:overlay-added`. Always `true` when not `enabled`.
 */
export const useHasContent = (enabled: boolean) => {
  const { scene } = useLighter();
  const [hasContent, setHasContent] = useState(false);

  useSceneEventHandler()(
    "lighter:overlay-added",
    useCallback(() => {
      if (scene?.getContentBounds()) {
        setHasContent(true);
      }
    }, [scene]),
  );

  if (enabled && !hasContent && scene?.getContentBounds()) {
    setHasContent(true);
  }

  return enabled ? hasContent : true;
};

/** Whether the annotation label list is ready to read; see {@link useAnnotationLabelsReady}. */
export const useLabelsReady = () => useAnnotationLabelsReady();

/**
 * Whether the PixiJS renderer has finished async initialization. Gates
 * viewport operations that need the pixi-viewport to exist.
 */
export const useRendererReady = () => {
  const [ready, setReady] = useState(false);

  useSceneEventHandler()(
    "lighter:renderer-ready",
    useCallback(() => setReady(true), []),
    { once: true },
  );

  return ready;
};
