import Spotlight, { PageChange } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { Lookers } from "@fiftyone/state";
import React, { useEffect, useMemo, useRef } from "react";
import {
  atom,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { commitLocalUpdate } from "relay-runtime";
import { v4 as uuid } from "uuid";
import useSpotlightPager, { Sample } from "../../useSpotlightPager";
import { pixels, spotlightLooker } from "./Grid.module.css";
import {
  gridCrop,
  gridPage,
  pageParameters,
  rowAspectRatioThreshold,
  showGridPixels,
} from "./recoil";

export const tileAtom = atom({
  key: "tileAtom",
  default: 3,
});

let timeout;

function Grid() {
  const id = useMemo(() => uuid(), []);
  const threshold = useRecoilValue(rowAspectRatioThreshold);
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

  const [showPixels, setShowPixels] = useRecoilState(showGridPixels);

  const tile = useRecoilValue(tileAtom);
  const setPage = useSetRecoilState(gridPage);
  const setSample = fos.useExpandSample(store);

  const spotlight = useMemo(() => {
    if (showPixels) {
      return undefined;
    }

    return new Spotlight<number, Sample>({
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
    showPixels,
    store,
    threshold,
    tile,
  ]);

  const select = fos.useSelectFlashlightSample();
  const selectSample = useRef(select);
  selectSample.current = select;

  useEffect(() => {
    if (!spotlight) {
      return undefined;
    }

    const pagechange = (e: PageChange<number>) => setPage(e.page);

    const element = document.getElementById(id);
    let width;
    const observer = new ResizeObserver(() => {
      if (!width) {
        width = element.getBoundingClientRect().width;
        return;
      }
      if (width !== element.getBoundingClientRect().width) {
        setShowPixels(true);
        observer.unobserve(element);
        timeout && clearTimeout(timeout);
        timeout = setTimeout(() => {
          timeout = undefined;
          setShowPixels(false);
        }, 1000);
      }
    });

    spotlight.attach(element);
    spotlight.addEventListener("pagechange", pagechange);
    spotlight.addEventListener("load", () => element.classList.remove(pixels));

    observer.observe(element);

    return () => {
      spotlight.removeEventListener("pagechange", pagechange);
      spotlight.destroy();
      element?.classList.add(pixels);
    };
  }, [
    id,
    spotlight,
    page,
    fos.stringifyObj(useRecoilValue(fos.filters)),
    useRecoilValue(fos.datasetName),
    useRecoilValue(fos.cropToContent(false)),
    fos.filterView(useRecoilValue(fos.view)),
    useRecoilValue(fos.groupSlice),
    useRecoilValue(fos.refresher),
    useRecoilValue(fos.similarityParameters),
    useRecoilValue(fos.extendedStagesUnsorted),
    useRecoilValue(fos.extendedStages),
    useRecoilValue(fos.shouldRenderImaVidLooker),
  ]);

  const { init, deferred } = fos.useDeferrer();

  const selected = useRecoilValue(fos.selectedSamples);
  useEffect(() => {
    deferred(() => {
      spotlight?.updateItems((id) => {
        lookerStore.get(id)?.updateOptions({
          ...lookerOptions,
          selected: selected.has(id.description),
        });
      });
    });
  }, [deferred, spotlight, lookerOptions, lookerStore, selected]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);

  useEffect(() => {
    const current = records.current;
    return () => {
      commitLocalUpdate(fos.getCurrentEnvironment(), (store) => {
        for (const id of Array.from(current)) store.get(id).invalidateRecord();
      });
    };
  }, [records, useRecoilValue(fos.refresher)]);

  return (
    <div
      id={id}
      className={`${spotlightLooker} + ${pixels}`}
      data-cy="fo-grid"
    />
  );
}

export default React.memo(Grid);
