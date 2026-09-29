import { pathCanBeOptimized } from "@fiftyone/state";
import { useEffect } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import { QP_WAIT, QueryPerformanceToastEvent } from "../QueryPerformanceToast";

export default function useQueryPerformanceTimeout(
  modal: boolean,
  path: string,
) {
  const shouldOptimize = useReverbValue(pathCanBeOptimized(path));
  useEffect(() => {
    if (modal || !shouldOptimize) {
      return;
    }

    const timeout = setTimeout(() => {
      window.dispatchEvent(
        new QueryPerformanceToastEvent(path, shouldOptimize.isFrameField),
      );
    }, QP_WAIT);

    return () => {
      clearTimeout(timeout);
    };
  }, [modal, path, shouldOptimize]);
}
