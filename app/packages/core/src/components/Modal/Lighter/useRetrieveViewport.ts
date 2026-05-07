import { Scene2D } from "@fiftyone/lighter";
import { useSaveModalViewport } from "@fiftyone/state";
import { useLayoutEffect } from "react";

/**
 * Captures the zoom/pan state before this component is removed from the DOM
 * so the state can be restored when EXPLORE mode (Looker) remounts.
 */
const useRetrieveViewport = (
  scene: Scene2D | null,
  sampleId: string | undefined
) => {
  const setViewportState = useSaveModalViewport();

  useLayoutEffect(() => {
    return () => {
      if (scene && !scene.isDestroyed && sampleId) {
        setViewportState({
          sampleId,
          ...scene.getViewportState(),
        });
      }
    };
  }, [scene, sampleId]);
};

export default useRetrieveViewport;
