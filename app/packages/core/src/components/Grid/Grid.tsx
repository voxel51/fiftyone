import styles from "./Grid.module.css";

import { freeVideos } from "@fiftyone/looker";
import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";
import { gridCrop, gridSpacing, pageParameters } from "./recoil";
import useAt from "./useAt";
import useEscape from "./useEscape";
import useFontSize from "./useFontSize";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useSelect from "./useSelect";
import useSelectSample from "./useSelectSample";
import useSpotlightPager from "./useSpotlightPager";
import useThreshold from "./useThreshold";

function Grid() {
  const id = useMemo(() => uuid(), []);
  const spacing = useRecoilValue(gridSpacing);
  const selectSample = useRef<ReturnType<typeof useSelectSample>>();
  const { lookerStore, pageReset, reset } = useRefreshers();
  const [resizing, setResizing] = useState(false);
  const threshold = useThreshold();

  const records = useRecords(pageReset);
  const { page, store } = useSpotlightPager({
    clearRecords: pageReset,
    pageSelector: pageParameters,
    records,
    zoomSelector: gridCrop,
  });
  const { get, set } = useAt(pageReset);

  const lookerOptions = fos.useLookerOptions(false);
  const createLooker = fos.useCreateLooker(false, true, lookerOptions);
  const setSample = fos.useExpandSample(store);
  const getFontSize = useFontSize(id);

  const spotlight = useMemo(() => {
    /** SPOTLIGHT REFRESHER */
    reset;
    /** SPOTLIGHT REFRESHER */

    if (resizing) {
      return undefined;
    }

    return new Spotlight<number, fos.Sample>({
      ...get(),
      destroy: (id) => {
        const looker = lookerStore.get(id.description);
        looker?.destroy();
        lookerStore.delete(id.description);
      },
      onItemClick: setSample,
      retainItems: true,
      rowAspectRatioThreshold: threshold,
      get: (next) => page(next),
      render: (id, element, dimensions, soft, hide) => {
        if (lookerStore.has(id.description)) {
          const looker = lookerStore.get(id.description);
          hide ? looker?.disable() : looker?.attach(element, dimensions);

          return;
        }

        const result = store.get(id);

        if (!createLooker.current || !result) {
          throw new Error("bad data");
        }

        if (soft) {
          // we are scrolling fast, skip creation
          return;
        }

        const looker = createLooker.current?.(
          { ...result, symbol: id },
          {
            fontSize: getFontSize(),
          }
        );
        looker.addEventListener("selectthumbnail", ({ detail }) =>
          selectSample.current?.(detail)
        );
        lookerStore.set(id.description, looker);
        looker.attach(element, dimensions);
      },
      scrollbar: true,
      spacing,
    });
  }, [
    createLooker,
    get,
    getFontSize,
    lookerStore,
    page,
    reset,
    resizing,
    setSample,
    spacing,
    store,
    threshold,
  ]);
  selectSample.current = useSelectSample(records);
  useSelect(getFontSize, lookerOptions, lookerStore, spotlight);

  useLayoutEffect(() => {
    if (resizing || !spotlight) {
      return undefined;
    }

    const element = document.getElementById(id);
    const mount = () => {
      document.dispatchEvent(new CustomEvent("grid-mount"));
    };

    element && spotlight.attach(element);
    spotlight.addEventListener("load", mount);
    spotlight.addEventListener("rowchange", set);

    return () => {
      freeVideos();
      spotlight.removeEventListener("load", mount);
      spotlight.removeEventListener("rowchange", set);
      spotlight.destroy();
      document.dispatchEvent(new CustomEvent("grid-unmount"));
    };
  }, [id, resizing, set, spotlight]);

  useEffect(() => {
    let width: number;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const el = () => document.getElementById(id)?.parentElement;
    const observer = new ResizeObserver(() => {
      const element = el();
      if (element && width === undefined) {
        width = element.getBoundingClientRect().width;
        return;
      }

      const newWidth = el()?.getBoundingClientRect().width;
      if (newWidth === width) {
        return;
      }

      setResizing(true);
      timeout && clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = undefined;
        if (element) {
          width = element?.getBoundingClientRect().width;
        }

        setResizing(false);
      }, 500);
    });

    const element = el();
    element && observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [id]);

  useEscape();

  return <div id={id} className={styles.spotlightGrid} data-cy="fo-grid" />;
}

export default React.memo(Grid);
