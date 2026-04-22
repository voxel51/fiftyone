/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { DEFAULT_ZOOM_PAD } from "@fiftyone/lighter";
import type { Rect } from "@fiftyone/lighter";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventBus,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { modalBridge, useModalLookerOptions } from "@fiftyone/state";
import type { ModalViewportState } from "@fiftyone/state";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const useSceneEventHandler = () => {
  const { scene } = useLighter();

  return useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
};

const useSceneEventBus = () => {
  const { scene } = useLighter();

  return useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
};

/**
 * Listens for the `lighter:canonical-media-bounds-changed` event
 * and returns the bounds. We use this to know when the image has loaded
 * and its bounds are known.
 */
const useCanonicalMediaBounds = () => {
  const [bounds, setBounds] = useState<Rect | null>(null);

  useSceneEventHandler()(
    "lighter:canonical-media-bounds-changed",
    useCallback(({ bounds }: { bounds: Rect }) => {
      setBounds(bounds);
    }, []),
    { once: true }
  );

  return bounds;
};

/**
 * Waits for at least one spatial overlay to be present in the scene.
 * Returns `true` once `scene.getContentBounds()` is non-null.
 *
 * On each `lighter:overlay-added` event the check is re-evaluated so we react
 * as soon as the first label overlay lands (added asynchronously by useLabels).
 */
const useHasContent = (enabled: boolean) => {
  const { scene } = useLighter();
  const [hasContent, setHasContent] = useState(false);

  useSceneEventHandler()(
    "lighter:overlay-added",
    useCallback(() => {
      if (scene?.getContentBounds()) {
        setHasContent(true);
      }
    }, [scene])
  );

  if (enabled && !hasContent && scene?.getContentBounds()) {
    setHasContent(true);
  }

  return enabled ? hasContent : true;
};

/**
 * Returns `true` once the PixiJS renderer has finished async initialization
 * and the render loop has started. This gates viewport operations that require
 * the pixi-viewport to exist (e.g. setViewportState, fitToRect).
 */
const useRendererReady = () => {
  const [ready, setReady] = useState(false);

  useSceneEventHandler()(
    "lighter:renderer-ready",
    useCallback(() => setReady(true), []),
    { once: true }
  );

  return ready;
};

/**
 * Applies the initial viewport once prerequisites are met, then dispatches
 * `lighter:viewport-init-complete` to signal that the scene is safe to reveal.
 *
 * All paths wait for both `mediaBounds` (image loaded) and `rendererReady`
 * (PixiJS initialized) before acting. This prevents silently calling
 * setViewportState on a renderer whose pixi-viewport doesn't exist yet.
 *
 * Three paths:
 *  - savedViewport: calls scene.setViewportState()
 *  - effectiveZoom: waits for content overlays, then calls scene.fitToContent()
 *  - default: signals immediately (no viewport action)
 */
const useInitializeViewport = (
  savedViewport: ModalViewportState | null,
  effectiveZoom: boolean,
  mediaBounds: Rect | null
) => {
  const { scene } = useLighter();
  const appliedRef = useRef(false);
  const eventBus = useSceneEventBus();
  const rendererReady = useRendererReady();

  const hasContent = useHasContent(effectiveZoom);

  useEffect(() => {
    if (!mediaBounds || !scene || !rendererReady || appliedRef.current) return;

    const complete = () => {
      appliedRef.current = true;

      // Defer the reveal signal until after the next Pixi render tick so
      // the canvas has actually painted all pending overlays before the
      // container flips to visible.
      const unregister = scene.registerRenderCallback({
        phase: "after",
        callback: () => {
          unregister();
          eventBus.dispatch("lighter:viewport-init-complete", {});
        },
      });
    };

    if (savedViewport) {
      scene.setViewportState(savedViewport);
      complete();
    } else if (effectiveZoom && hasContent) {
      scene.fitToContent(DEFAULT_ZOOM_PAD);
      complete();
    } else if (!effectiveZoom) {
      complete();
    }
  }, [
    mediaBounds,
    scene,
    rendererReady,
    savedViewport,
    effectiveZoom,
    hasContent,
    eventBus,
  ]);
};

/**
 * Drives viewport initialization for a lighter scene.
 *
 * Determines the correct init path from the current sample's saved viewport
 * and the active looker options (zoom), then waits for the canonical media
 * bounds to be known before applying. Returns `ready` to signal that the
 * viewport has been applied (or that no viewport action was needed).
 *
 * @param sampleId - The ID of the sample being displayed, used to match
 *   the saved viewport to the correct sample.
 */
const useViewport = (sampleId: string | undefined) => {
  const options = useModalLookerOptions();

  const [initConditions, setInitConditions] = useState<{
    savedViewport: ModalViewportState | null;
    effectiveZoom: boolean;
  } | null>(null);

  // Read the saved viewport during the commit phase so it runs after the
  // unmounting component's useLayoutEffect cleanup has saved to the atom.
  useLayoutEffect(() => {
    if (initConditions) return;

    const savedViewportState = modalBridge.getModalViewport();
    const savedViewport =
      sampleId && savedViewportState?.sampleId === sampleId
        ? savedViewportState
        : null;
    const optionsZoom = ("zoom" in options && options.zoom) as
      | boolean
      | undefined;
    const effectiveZoom = !!optionsZoom && !savedViewport;
    setInitConditions({ savedViewport, effectiveZoom });
  }, []);

  const mediaBounds = useCanonicalMediaBounds();

  useInitializeViewport(
    initConditions?.savedViewport ?? null,
    initConditions?.effectiveZoom ?? false,
    initConditions ? mediaBounds : null
  );
};

export default useViewport;
