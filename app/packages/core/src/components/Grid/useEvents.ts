import styles from "./Grid.module.css";

import { freeVideos } from "@fiftyone/looker";
import type Spotlight from "@fiftyone/spotlight";
import type { Rejected } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useLayoutEffect } from "react";
import { useSetRecoilState } from "recoil";
import { QP_WAIT, QueryPerformanceToastEvent } from "../QueryPerformanceToast";
import { recommendedGridZoom } from "./recoil";
import type { LookerCache } from "./types";
import type { AtInterface } from "./useAt";

export default ({
  id,
  cache,
  pixels,
  resizing,
  set,
  spotlight,
}: {
  id: string;
  cache: LookerCache;
  pixels: string;
  resizing: boolean;
  set: (at: AtInterface) => void;
  spotlight?: Spotlight<number, fos.Sample>;
}) => {
  const handleError = useSetRecoilState(fos.snackbarErrors);
  const setRecommendedGridZoomRange = useSetRecoilState(recommendedGridZoom);
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
      cache.unfreeze();
      clearTimeout(timeout);
      document.getElementById(pixels)?.classList.add(styles.hidden);
      document.dispatchEvent(new CustomEvent("grid-mount"));
    };

    const rejected = (event: Rejected) => {
      clearTimeout(timeout);
      setRecommendedGridZoomRange(
        11 - event.recommendedRowAspectRatioThreshold
      );
      spotlight.loaded &&
        handleError(["That's a lot of data! We've zoomed in a bit"]);
    };

    element && spotlight.attach(element);
    spotlight.addEventListener("load", mount);
    spotlight.addEventListener("rejected", rejected);
    spotlight.addEventListener("rowchange", set);

    return () => {
      clearTimeout(timeout);
      freeVideos();
      document.dispatchEvent(new CustomEvent("grid-unmount"));
      document.getElementById(pixels)?.classList.remove(styles.hidden);
      spotlight.removeEventListener("load", mount);
      spotlight.removeEventListener("rowchange", set);
      spotlight.destroy();
    };
  }, [
    cache,
    id,
    handleError,
    pixels,
    resizing,
    set,
    setRecommendedGridZoomRange,
    spotlight,
  ]);
};
