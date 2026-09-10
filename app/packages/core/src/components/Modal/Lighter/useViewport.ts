/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { modalBridge, useModalLookerOptions } from "@fiftyone/state";
import type { ModalViewportState } from "@fiftyone/state";
import { useLayoutEffect, useState } from "react";
import { useInitializeViewport } from "./useInitializeViewport";
import { useCanonicalMediaBounds } from "./useViewportReadiness";

/**
 * Drive viewport initialization for a lighter scene from the sample's saved
 * viewport and the active looker options.
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
    initConditions ? mediaBounds : null,
  );
};

export default useViewport;
