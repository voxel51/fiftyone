import Spotlight, { PageChange } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { Lookers } from "@fiftyone/state";
import { animated, useSpring } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  atom,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { commitLocalUpdate } from "relay-runtime";
import styled from "styled-components";
import { v4 as uuid } from "uuid";
import useSpotlightPager, { Sample } from "../../useSpotlightPager";
import { pixels, spotlightLooker } from "./SpotlightGrid.module.css";
import { gridCrop, pageParameters, rowAspectRatioThreshold } from "./recoil";

const Contain = styled.div`
  position: relative;
  display: block;
  height: 100%;
  width: 100%;
`;

const Drag = styled(animated.div)`
  z-index: 10000000;
  width: 100%;
  background: ${({ theme }) => theme.primary.plainColor};
  height: 4px;
  position: absolute;
  right: 0;
  cursor: pointer;
  box-shadow: rgb(26, 26, 26) 0px 2px 20px;
  border-radius: 3px 0 0 3px;
  cursor: row-resize;
  width: 30px;

  &:hover {
    width: 40px;
    height: 6px;
    margin-top: -1px;
  }

  transition-property: margin-top, height, width;
  transition-duration: 0.25s;
  transition-timing-function: ease-in-out;
`;

const sessionPage = fos.sessionAtom({
  key: "sessionPage",
  default: 0,
});

const showGridPixels = atom({ key: "showGridPixels", default: true });

export const tileAtom = atom({
  key: "tileAtom",
  default: 3,
});

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
        snapshot.getLoadable(sessionPage).getValue(),
    []
  );

  const showPixels = useRecoilValue(showGridPixels);

  const tile = useRecoilValue(tileAtom);
  const setPage = useSetRecoilState(sessionPage);
  const setSample = fos.useExpandSpotlightSample(store);

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
    spotlight.attach(id);
    spotlight.addEventListener("pagechange", pagechange);
    spotlight.addEventListener("load", () => {
      document.getElementById(id)?.classList.remove(pixels);
    });

    return () => {
      spotlight.removeEventListener("pagechange", pagechange);
      spotlight.destroy();
      document.getElementById(id)?.classList.add(pixels);
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
const Bar = ({ height }) => {
  const [page, setPage] = useRecoilState(sessionPage);
  const count = useRecoilValue(fos.datasetSampleCount);

  const [{ y }, api] = useSpring(() => ({
    y: ((page * 20) / count) * (height - 48) + 48,
  }));

  if (page * 20 >= count) {
    throw new Error("WRONG");
  }

  const setDragging = useSetRecoilState(showGridPixels);

  const bind = useDrag(({ down, movement: [_, my] }) => {
    setDragging(down && my !== 0);

    const base = ((page * 20) / count) * (height - 48);
    api.start({
      y: down ? my + base + 48 : base + 48,
      immediate: down,
    });

    !down && setPage(Math.floor((((base + my) / (height - 48)) * count) / 20));
  });

  useEffect(() => {
    api.start({ y: ((page * 20) / count) * (height - 48) + 48 });
  }, [api, count, page, height]);

  return <Drag {...bind()} style={{ top: y, right: 0 }} />;
};

const Wrap = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>();
  const set = useSetRecoilState(showGridPixels);

  const observer = useMemo(() => {
    let timeout: ReturnType<typeof setTimeout>;
    return new ResizeObserver(() => {
      timeout && clearTimeout(timeout);
      timeout = setTimeout(() => {
        setHeight(ref.current?.getBoundingClientRect().height);
        set(false);
      }, 1000);
    });
  }, [set]);

  useEffect(() => {
    if (!ref.current) {
      return () => null;
    }

    const el = ref.current;
    observer.observe(el);

    return () => {
      observer.unobserve(el);
    };
  }, [observer]);

  return (
    <Contain ref={ref}>
      <Grid key={"grid"} />
      {height && <Bar height={height} key={"bar"} />}
    </Contain>
  );
};

export default React.memo(Wrap);
