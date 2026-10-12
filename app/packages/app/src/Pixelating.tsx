/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Global loading screen component — rendered by {@link Renderer} during
 * initial page load only.
 *
 * @module Pixelating
 */

import { Loading } from "@fiftyone/components";
import { getEventBus } from "@fiftyone/events";
import React, { useEffect } from "react";

/**
 * e2e specs count the global loading screen: it should mount once per page
 * load, and a second mount means suspension escaped to the top-level
 * Suspense boundary
 */
type GlobalLoadingScreenE2EEvents = {
  "e2e:app:global-loading-screen": undefined;
};

/** Renders the "Pixelating..." global loading screen. */
const Pixelating = React.memo(() => {
  useEffect(() => {
    getEventBus<GlobalLoadingScreenE2EEvents>().dispatch(
      "e2e:app:global-loading-screen",
    );
  }, []);

  return <Loading>Pixelating...</Loading>;
});

Pixelating.displayName = "Pixelating";

export default Pixelating;
