/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Global loading screen component — rendered by {@link Renderer} during
 * initial page load only.
 *
 * Dispatches a {@link GlobalLoadingScreenEvent} on `document` on mount so
 * that tests can assert the global loading screen fires exactly once. Any
 * subsequent fire indicates that suspension has escaped to the top-level
 * Suspense boundary, which is a regression.
 *
 * @module Pixelating
 */

import { Loading } from "@fiftyone/components";
import React, { useEffect } from "react";

/**
 * Fired on `document` each time the global loading screen mounts.
 * Should be dispatched exactly once, on initial page load.
 */
export class GlobalLoadingScreenEvent extends Event {
  static readonly eventName = "global-loading-screen" as const;

  constructor() {
    super(GlobalLoadingScreenEvent.eventName);
  }
}

/**
 * Renders the "Pixelating..." global loading screen and signals each mount via
 * a {@link GlobalLoadingScreenEvent} on `document`. Should only ever mount
 * once, on initial page load.
 */
const Pixelating = React.memo(() => {
  useEffect(() => {
    document.dispatchEvent(new GlobalLoadingScreenEvent());
  }, []);

  return <Loading>Pixelating...</Loading>;
});

Pixelating.displayName = "Pixelating";

export default Pixelating;
