import type Spotlight from "@fiftyone/floodlight";
import type { Rejected } from "@fiftyone/floodlight";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { getEventBus } from "@fiftyone/events";
import { QP_WAIT, type QueryPerformanceEvents } from "@fiftyone/sidebar";

type Instance = Spotlight<number, fos.Sample>;

/**
 * Returns `wire`, which attaches a new instance's load and memory handlers
 * as it is built (a load served from memory can land before any effect
 * runs), and returns the matching cleanup.
 */
export default function useInstanceEvents(recommend: (zoom: number) => void) {
  return useCallback(
    (instance: Instance) => {
      const info = fos.getQueryPerformancePath();
      const timeout = setTimeout(() => {
        info &&
          getEventBus<QueryPerformanceEvents>().dispatch(
            "query-performance:slow",
            { path: info.path, isFrameField: info.isFrameField },
          );
      }, QP_WAIT);

      instance.addEventListener("load", () => clearTimeout(timeout));
      instance.addEventListener("rejected", (event: Rejected) => {
        clearTimeout(timeout);
        recommend(-event.recommendedRowAspectRatioThreshold);
      });

      return () => clearTimeout(timeout);
    },
    [recommend],
  );
}
