import styles from "./Grid.module.css";

import type { Lookers } from "@fiftyone/state";

import Spotlight, { type ID } from "@fiftyone/spotlight";
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
import useRefreshers from "./useRefreshers";
import useSelect from "./useSelect";
import useSelectSample from "./useSelectSample";
import useSpotlightPager from "./useSpotlightPager";
import useThreshold from "./useThreshold";

function Grid() {
  const id = useMemo(() => uuid(), []);
  const lookerStore = useMemo(() => new WeakMap<ID, Lookers>(), []);
  const selectSample = useRef<ReturnType<typeof useSelectSample>>();
  const [resizing, setResizing] = useState(false);

  const spacing = useRecoilValue(gridSpacing);

  const { pageReset, reset } = useRefreshers();
  const { get, set } = useAt(pageReset);
  const threshold = useThreshold();

  const { page, records, store } = useSpotlightPager({
    pageSelector: pageParameters,
    zoomSelector: gridCrop,
  });

  const lookerOptions = fos.useLookerOptions(false);
  const createLooker = fos.useCreateLooker(false, true, lookerOptions);
  const setSample = fos.useExpandSample(store);

  const spotlight = useMemo(() => {
    reset;
    if (resizing) {
      return undefined;
    }

    return new Spotlight<number, fos.Sample>({
      ...get(),
      onItemClick: setSample,
      rowAspectRatioThreshold: threshold,
      get: (next) => page(next),
      render: (id, element, dimensions, soft, hide) => {
        if (lookerStore.has(id)) {
          const looker = lookerStore.get(id);
          hide ? looker?.disable() : looker?.attach(element, dimensions);

          return;
        }

        const result = store.get(id);

        if (!createLooker.current || !result) {
          throw new Error("bad data");
        }

        const init = (l) => {
          l.addEventListener("selectthumbnail", ({ detail }: CustomEvent) => {
            selectSample.current?.(records, detail);
          });
          lookerStore.set(id, l);
          l.attach(element, dimensions);
        };

        if (!soft) {
          init(createLooker.current?.({ ...result, symbol: id }));
        }
      },
      scrollbar: true,
      spacing,
    });
  }, [
    createLooker,
    get,
    lookerStore,
    page,
    records,
    reset,
    resizing,
    setSample,
    spacing,
    store,
    threshold,
  ]);
  selectSample.current = useSelectSample();
  useSelect(lookerOptions, lookerStore, spotlight);

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

  return <div id={id} className={styles.spotlightLooker} data-cy="fo-grid" />;
}

export default React.memo(Grid);
