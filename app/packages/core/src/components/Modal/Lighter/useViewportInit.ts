/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { modalBridge, useModalLookerOptions } from "@fiftyone/state";

/**
 * Computes the viewport initialization parameters for a given sample.
 *
 * Returns:
 *   - `effectiveZoom`  — true when the zoom option is active and there is no
 *     saved viewport to restore. When true, `queueInitialZoom` will be called
 *     in the `onInitialized` callback and the container starts hidden until
 *     `lighter:viewport-initialized` fires.
 *   - `initialViewport` — a saved { scale, panX, panY, sampleId } snapshot to
 *     restore, or null if none exists for this sample.
 */
const useViewportInit = (id: string) => {
  const options = useModalLookerOptions();

  const savedViewportState = modalBridge.getModalViewport();
  const initialViewport =
    savedViewportState?.sampleId === id ? savedViewportState : null;

  // Zoom to content only when options.zoom is set and there is no saved
  // viewport to restore. Restoring a viewport takes precedence over auto-zoom.
  const optionsZoom = ("zoom" in options && options.zoom) as
    | boolean
    | undefined;
  const effectiveZoom = !!optionsZoom && !initialViewport;

  return { effectiveZoom, initialViewport };
};

export default useViewportInit;
