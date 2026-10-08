import { useEventBus } from "@fiftyone/events";
import { pathCanBeOptimized } from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { QP_WAIT, type QueryPerformanceEvents } from "../QueryPerformanceToast";

export default function useQueryPerformanceTimeout(
  modal: boolean,
  path: string,
) {
  const shouldOptimize = useRecoilValue(pathCanBeOptimized(path));
  const bus = useEventBus<QueryPerformanceEvents>();
  useEffect(() => {
    if (modal || !shouldOptimize) {
      return;
    }

    const timeout = setTimeout(() => {
      bus.dispatch("query-performance:slow", {
        path,
        isFrameField: shouldOptimize.isFrameField,
      });
    }, QP_WAIT);

    return () => {
      clearTimeout(timeout);
    };
  }, [bus, modal, path, shouldOptimize]);
}
