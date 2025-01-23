import styles from "./Grid.module.css";

import { freeVideos } from "@fiftyone/looker";
import type Spotlight from "@fiftyone/spotlight";
import type { Rejected } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useLayoutEffect } from "react";
import { useSetRecoilState } from "recoil";
import { QP_WAIT, QueryPerformanceToastEvent } from "../QueryPerformanceToast";
import { gridZoomRange } from "./recoil";
import type { AtInterface } from "./useAt";
import type useRefreshers from "./useRefreshers";

export default ({
  id,
  lookerCache,
  pixels,
  resizing,
  set,
  setMinimum,
  spotlight,
}: {
  id: string;
  lookerCache: ReturnType<typeof useRefreshers>["lookerCache"];
  pixels: string;
  resizing: boolean;
  set: (at: AtInterface) => void;
  setMinimum: (min: number) => void;
  spotlight?: Spotlight<number, fos.Sample>;
}) => {
  const setRange = useSetRecoilState(gridZoomRange);
  const handleError = useSetRecoilState(fos.snackbarErrors);
  useLayoutEffect(() => {
    if (resizing || !spotlight) {
      return undefined;
    }

    const element = document.getElementById(id);

    const info = fos.getQueryPerformancePath();
    const timeout = setTimeout(() => {
      if (info) {
        window.dispatchEvent(
          new QueryPerformanceToastEvent(info.path, info.isFrameField)
        );
      }
    }, QP_WAIT);

    const mount = () => {
      clearTimeout(timeout);
      document.getElementById(pixels)?.classList.add(styles.hidden);
      document.dispatchEvent(new CustomEvent("grid-mount"));
    };

    const rejected = (event: Rejected) => {
      clearTimeout(timeout);
      setMinimum(11 - event.recommendedRowAspectRatioThreshold);
      setRange(([_, max]) => [
        11 - event.recommendedRowAspectRatioThreshold,
        max,
      ]);
      handleError(["sample density too high, grid resized"]);
    };

    element && spotlight.attach(element);
    spotlight.addEventListener("load", mount);
    spotlight.addEventListener("rejected", rejected);
    spotlight.addEventListener("rowchange", set);

    return () => {
      clearTimeout(timeout);
      freeVideos();
      spotlight.removeEventListener("load", mount);
      spotlight.removeEventListener("rowchange", set);
      spotlight.destroy();
      lookerCache.hide();
      document.getElementById(pixels)?.classList.remove(styles.hidden);
      document.dispatchEvent(new CustomEvent("grid-unmount"));
    };
  }, [
    id,
    handleError,
    lookerCache,
    pixels,
    resizing,
    set,
    setMinimum,
    setRange,
    spotlight,
  ]);
};
