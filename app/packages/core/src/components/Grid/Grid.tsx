import type { Lookers } from "@fiftyone/state";

import { subscribe } from "@fiftyone/relay";
import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
} from "recoil";
import { v4 as uuid } from "uuid";
import useSpotlightPager from "../../useSpotlightPager";
import {
  gridAt,
  gridCrop,
  gridPage,
  gridSpacing,
  pageParameters,
} from "./recoil";
import useRefreshers from "./useRefreshers";
import useSelect from "./useSelect";
import useThreshold from "./useThreshold";

import { pixels, spotlightLooker } from "./Grid.module.css";
import useSelectSample from "./useSelectSample";

function Grid() {
  const id = useMemo(() => uuid(), []);
  const { page, store } = useSpotlightPager(pageParameters, gridCrop);
  const lookerOptions = fos.useLookerOptions(false);
  const lookerStore = useMemo(() => new WeakMap<symbol, Lookers>(), []);

  const createLooker = fos.useCreateLooker(false, true, lookerOptions);
  const getAt = useRecoilCallback(
    ({ snapshot }) =>
      () => {
        return {
          at: snapshot.getLoadable(gridAt).getValue(),
          key: snapshot.getLoadable(gridPage).getValue(),
        };
      },
    []
  );
  const [resizing, setResizing] = useState(false);

  const refreshers = useRefreshers();
  const setAt = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      ({ page, at }: { page: number; at: symbol }) => {
        set(gridPage, page);
        set(gridAt, at.description);
      },
    []
  );
  const setSample = fos.useExpandSample(store);
  const threshold = useThreshold();
  const spacing = useRecoilValue(gridSpacing);
  const selectSample = useRef<ReturnType<typeof useSelectSample>>();

  const spotlight = useMemo(() => {
    refreshers;
    if (resizing) {
      return undefined;
    }

    return new Spotlight<number, fos.Sample>({
      ...getAt(),
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
            selectSample.current(store, detail);
          });
          lookerStore.set(id, l);
          l.attach(element, dimensions);
        };

        if (!soft) {
          init(createLooker.current({ ...result, symbol: id }));
        }
      },
      scrollbar: true,
      spacing,
    });
  }, [
    createLooker,
    getAt,
    lookerStore,
    page,
    refreshers,
    resizing,
    setSample,
    spacing,
    store,
    threshold,
  ]);
  selectSample.current = useSelectSample();
  useSelect(lookerOptions, lookerStore, spotlight);

  useEffect(() => {
    if (resizing) {
      return undefined;
    }

    const element = document.getElementById(id);

    spotlight.attach(element);
    spotlight.addEventListener("rowchange", setAt);
    spotlight.addEventListener("load", () => element.classList.remove(pixels));

    return () => {
      spotlight.removeEventListener("rowchange", setAt);

      spotlight.destroy();
      element?.classList.add(pixels);
    };
  }, [id, resizing, setAt, spotlight]);

  useEffect(() => subscribe((_, { reset }) => reset(gridPage)), []);

  useEffect(() => {
    let width: number = undefined;
    let timeout: ReturnType<typeof setTimeout> = undefined;
    const el = () => document.getElementById(id).parentElement;
    const observer = new ResizeObserver(() => {
      if (width === undefined) {
        width = el().getBoundingClientRect().width;
        return;
      }

      const newWidth = el().getBoundingClientRect().width;
      if (newWidth === width) {
        return;
      }

      setResizing(true);
      timeout && clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = undefined;
        width = el().getBoundingClientRect().width;

        setResizing(false);
      }, 500);
    });

    observer.observe(el());

    return () => {
      observer.disconnect();
    };
  }, [id]);

  return (
    <div
      id={id}
      className={`${spotlightLooker} + ${pixels}`}
      data-cy="fo-grid"
    />
  );
}

export default React.memo(Grid);
