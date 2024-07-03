import { subscribe } from "@fiftyone/relay";
import Spotlight, { PageChange } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { Lookers } from "@fiftyone/state";
import React, { useEffect, useMemo } from "react";
import {
  atom,
  useRecoilCallback,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { v4 as uuid } from "uuid";
import useSpotlightPager from "../../useSpotlightPager";
import { pixels, spotlightLooker } from "./Grid.module.css";
import { gridCrop, gridPage, pageParameters } from "./recoil";
import useRefreshers from "./useRefreshers";
import useThreshold from "./useThreshold";

export const tileAtom = atom({
  key: "tileAtom",
  default: 3,
});

function Grid() {
  const id = useMemo(() => uuid(), []);
  const { page, store, records } = useSpotlightPager(pageParameters, gridCrop);
  const lookerOptions = fos.useLookerOptions(false);
  const lookerStore = useMemo(() => new WeakMap<symbol, Lookers>(), []);

  const createLooker = fos.useCreateLooker(false, true, lookerOptions);
  const getPage = useRecoilCallback(
    ({ snapshot }) =>
      () =>
        snapshot.getLoadable(gridPage).getValue(),
    []
  );

  const refreshers = useRefreshers();
  const setPage = useSetRecoilState(gridPage);
  const setSample = fos.useExpandSample(store);
  const threshold = useThreshold();
  const tile = useRecoilValue(tileAtom);

  const spotlight = useMemo(() => {
    refreshers;
    return new Spotlight<number, fos.Sample>({
      key: getPage(),
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
            selectSample.current(detail);
          });
          lookerStore.set(id, l);
          l.attach(element, dimensions);
        };

        if (!soft) {
          init(createLooker.current(result));
        }
      },
      scrollbar: true,
      spacing: tile,
    });
  }, [
    createLooker,
    getPage,
    lookerStore,
    page,
    refreshers,
    setSample,
    store,
    threshold,
    tile,
  ]);

  useEffect(() => {
    const element = document.getElementById(id);
    const pagechange = (e: PageChange<number>) => setPage(e.page);

    spotlight.attach(element);
    spotlight.addEventListener("pagechange", pagechange);
    spotlight.addEventListener("load", () => element.classList.remove(pixels));

    return () => {
      spotlight.removeEventListener("pagechange", pagechange);
      spotlight.destroy();
      element?.classList.add(pixels);
    };
  }, [id, setPage, spotlight]);

  useEffect(() => subscribe((_, { reset }) => reset(gridPage)), []);

  return (
    <div
      id={id}
      className={`${spotlightLooker} + ${pixels}`}
      data-cy="fo-grid"
    />
  );
}

export default React.memo(Grid);
