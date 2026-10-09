import type Spotlight from "@fiftyone/floodlight";
import type { Rejected } from "@fiftyone/floodlight";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useSetReverbState } from "@fiftyone/reverb";
import { MANAGING_GRID_MEMORY } from "@fiftyone/core/src/utils/links";
import {
  QP_WAIT,
  QueryPerformanceToastEvent,
} from "@fiftyone/core/src/components/QueryPerformanceToast";
import { recommendedGridZoom } from "./atoms";

type Instance = Spotlight<number, fos.Sample>;

/**
 * Returns `wire`, which attaches a new instance's load and memory handlers
 * as it is built (a load served from memory can land before any effect
 * runs), and returns the matching cleanup.
 */
export default function useInstanceEvents() {
  const handleAutosize = useSetReverbState(fos.snackbarLink);
  const setRecommendedZoom = useSetReverbState(recommendedGridZoom);

  return useCallback(
    (instance: Instance) => {
      const info = fos.getQueryPerformancePath();
      const timeout = setTimeout(() => {
        info &&
          window.dispatchEvent(
            new QueryPerformanceToastEvent(info.path, info.isFrameField),
          );
      }, QP_WAIT);

      instance.addEventListener("load", () => clearTimeout(timeout));
      instance.addEventListener("rejected", (event: Rejected) => {
        clearTimeout(timeout);
        setRecommendedZoom(-event.recommendedRowAspectRatioThreshold);
        instance.loaded &&
          handleAutosize({
            link: MANAGING_GRID_MEMORY,
            message: "That's a lot of data! We've zoomed in a bit",
          });
      });

      return () => clearTimeout(timeout);
    },
    [handleAutosize, setRecommendedZoom],
  );
}
