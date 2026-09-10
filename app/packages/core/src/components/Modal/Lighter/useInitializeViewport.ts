/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { DEFAULT_ZOOM_PAD, dispatchAfterPaintSettle } from "@fiftyone/lighter";
import type { Rect } from "@fiftyone/lighter";
import { useLighter } from "@fiftyone/lighter";
import type { ModalViewportState } from "@fiftyone/state";
import { useEffect, useRef } from "react";
import {
  useHasContent,
  useLabelsReady,
  useRendererReady,
  useSceneEventBus,
} from "./useViewportReadiness";

/**
 * Apply the initial viewport once media bounds, renderer, and labels are
 * ready, then dispatch `lighter:viewport-init-complete`. A saved viewport is
 * restored, zoom fits to content once it exists, and otherwise nothing moves.
 */
export const useInitializeViewport = (
  savedViewport: ModalViewportState | null,
  effectiveZoom: boolean,
  mediaBounds: Rect | null,
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

      // reveal only after the image and all overlays have been composited
      dispatchAfterPaintSettle(scene, () =>
        eventBus.dispatch("lighter:viewport-init-complete", {}),
      );
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
