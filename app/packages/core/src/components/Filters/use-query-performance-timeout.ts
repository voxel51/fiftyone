import { pathCanBeOptimized } from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { QP_WAIT, QueryPerformanceToastEvent } from "../QueryPerformanceToast";

export default function useQueryPerformanceTimeout(
  modal: boolean,
  path: string
) {
  const shouldOptimize = useRecoilValue(pathCanBeOptimized(path));
  useEffect(() => {
    if (modal || !shouldOptimize) {
      return;
    }

    /** TMP TESTING */
    window.dispatchEvent(
      new QueryPerformanceToastEvent(path, shouldOptimize.isFrameField)
    );
    /** TMP TESTING */

    const timeout = setTimeout(() => {
      window.dispatchEvent(
        new QueryPerformanceToastEvent(path, shouldOptimize.isFrameField)
      );
    }, QP_WAIT);

    return () => {
      clearTimeout(timeout);
    };
  }, [modal, path, shouldOptimize]);
}
