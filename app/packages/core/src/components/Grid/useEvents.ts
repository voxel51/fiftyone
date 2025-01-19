import styles from "./Grid.module.css";

import { freeVideos } from "@fiftyone/looker";
import type Spotlight from "@fiftyone/spotlight";
import type { Rejected } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useLayoutEffect } from "react";
import { QP_WAIT, QueryPerformanceToastEvent } from "../QueryPerformanceToast";
import { AtInterface } from "./useAt";
import useRefreshers from "./useRefreshers";

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
      setMinimum(event.recommendedRowAspectRatioThreshold);
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
  }, [id, lookerCache, pixels, resizing, set, setMinimum, spotlight]);
};
