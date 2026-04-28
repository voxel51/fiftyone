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
import { useAtomValue } from "jotai";
import { activeLabelSchemas } from "../Sidebar/Annotate/state";
import { LabelsState, labelsState } from "../Sidebar/Annotate/useLabels";
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
 * Returns `true` once label schemas have been fetched from the backend
 * (`activeLabelSchemas` is non-null) AND the initial label-load cycle has
 * completed (`labelsState === COMPLETE`).
 *
 * Both conditions are necessary: schemas arrive asynchronously via the
 * `get_label_schemas` operator, so `labelsState` can transiently reach
 * COMPLETE with zero results while schemas are still loading. Requiring
 * non-null schemas ensures that COMPLETE reflects a real, schema-aware fetch.
 */
const useLabelsReady = () => {
  const schemasLoaded = useAtomValue(activeLabelSchemas) !== null;
  const labelsComplete = useAtomValue(labelsState) === LabelsState.COMPLETE;
  return schemasLoaded && labelsComplete;
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

  const labelsLoaded = useLabelsReady();

  useEffect(() => {
    if (
      !mediaBounds ||
      !scene ||
      !rendererReady ||
      !labelsLoaded ||
      appliedRef.current
    )
      return;

    const complete = () => {
      appliedRef.current = true;

      /*
       * The goal is to reveal after the image AND all overlays have been painted to the canvas.
       * On the first tick, Pixi renders the canvas from the current state of its scene graph.
       * Because renderFrame is async, the renderOverlay() calls that mutate the scene graph (adding
       * bounding box Graphics objects to the Pixi stage) haven't run yet by the time Pixi renders,
       * they're suspended in a pending microtask. So the first canvas paint shows nothing (or whatever
       * was there before). On the second tick, Pixi renders the now-mutated scene graph and the overlays appear.
       *
       * HACK: We use a double-tick pattern to ensure the reveal is after the image and all overlays
       * have been painted to the canvas. A cleaner solution may be to make Scene2D.renderFrame
       * synchronous which would cause scene graph mutations to happen in the same tick as
       * Pixi's per-tick render. This will not work if an overlay awaits some async task before
       * mutating the scene graph, but there are no cases of that behavior today.
       *
       * Tick N: wait for the render loop to finish mutating the scene graph
       * (renderOverlay calls) before registering a second callback.
       */
      const unregister1 = scene.registerRenderCallback({
        phase: "after",
        callback: () => {
          unregister1();

          // Tick N+1: by the time this fires, Pixi has composited the scene
          // graph mutations from tick N to the canvas. Now it is safe to reveal.
          const unregister2 = scene.registerRenderCallback({
            phase: "after",
            callback: () => {
              unregister2();
              eventBus.dispatch("lighter:viewport-init-complete", {});
            },
          });
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
    labelsLoaded,
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
