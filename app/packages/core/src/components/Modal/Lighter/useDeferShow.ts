import { modalBridge, useModalLookerOptions } from "@fiftyone/state";

const useDeferShow = (id: string) => {
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

export default useDeferShow;
