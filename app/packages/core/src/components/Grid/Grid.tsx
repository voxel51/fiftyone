import Flashlight, { PageChange } from "@fiftyone/flashlight";
import * as fos from "@fiftyone/state";
import { sessionAtom } from "@fiftyone/state";
import { animated, useSpring } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  atom,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import { v4 as uuid } from "uuid";
import useFlashlightPager from "../../useFlashlightPager";
import { flashlightLooker, pixels } from "./Grid.module.css";
import { pageParameters, rowAspectRatioThreshold } from "./recoil";

const Contain = styled.div`
  position: relative;
  display: block;

  height: 100%;
  width: 100%;
`;

const BarContain = styled.div`
  width: 100px;

  height: 100%;
  position: absolute;
  right 0;
  top: 0;
`;

const Drag = styled(animated.div)`
  z-index: 10000000;
  width: 100%;
  background: orange;
  height: 10px;
  position: absolute;
  right: 0;
  cursor: pointer;
`;

const sessionPage = sessionAtom({
  key: "sessionPage",
  default: 0,
});

const dra = atom({ key: "dra", default: false });

function Grid() {
  const id = useMemo(() => uuid(), []);

  const threshold = useRecoilValue(rowAspectRatioThreshold);
  const { page, store } = useFlashlightPager(pageParameters);
  const lookerOptions = fos.useLookerOptions(false);
  const lookerStore = useMemo(() => new WeakMap<symbol, Lookers>(), []);

  const createLooker = fos.useCreateLooker(false, true, lookerOptions);
  const getPage = useRecoilCallback(
    ({ snapshot }) =>
      () =>
        snapshot.getLoadable(sessionPage).getValue(),
    []
  );

  const d = useRecoilValue(dra);

  const setPage = useSetRecoilState(sessionPage);
  useLayoutEffect(() => {
    if (d) {
      document.getElementById(id)?.classList.add(pixels);
      return;
    }

    const flashlight = new Flashlight<number, object>({
      key: getPage(),
      rowAspectRatioThreshold: threshold,
      get: (next) => page.current(next),
      render: (id, element, dimensions, soft, hide) => {
        if (lookerStore.has(id)) {
          const looker = lookerStore.get(id);
          hide ? looker?.disable() : looker.attach(element, dimensions);

          return;
        }

        const result = store.get(id);

        if (!createLooker.current || !result) {
          throw new Error("bad data");
        }

        const init = (l) => {
          lookerStore.set(id, l);
          l.attach(element, dimensions);
        };

        if (!soft) {
          init(createLooker.current(result));
        }
      },
    });
    const pagechange = (e: PageChange<number>) => setPage(e.page);

    flashlight.addEventListener("pagechange", pagechange);
    flashlight.attach(id);
    flashlight.addEventListener("load", () => {
      rr?.classList.remove(pixels);
    });

    const rr = document.getElementById(id);

    return () => {
      rr?.classList.add(pixels);
      flashlight.removeEventListener("pagechange", pagechange);
      flashlight.detach();
    };
  }, [
    d,
    getPage,
    id,
    page,
    setPage,
    store,
    threshold,
    lookerStore,
    createLooker,
  ]);

  return (
    <div
      id={id}
      className={flashlightLooker + " " + pixels}
      data-cy="fo-grid"
    />
  );
}
const Bar = () => {
  const [{ y }, api] = useSpring(() => ({ y: 0 }));

  // Set the drag hook and define component movement based on gesture data
  const bind = useDrag(({ down, movement: [_, my] }) => {
    api.start({ y: down ? my : 0, immediate: down });
  });

  const page = useRecoilValue(sessionPage);
  const ref = useRef<HTMLDivElement>(undefined);

  const count = useRecoilValue(fos.datasetSampleCount);

  const [height, setHeight] = useState<DOMRect>();
  useLayoutEffect(() => {
    ref.current && setHeight(ref.current.getBoundingClientRect());
  }, [ref]);
  const [dragging, setDragging] = useRecoilState(dra);
  const set = useSetRecoilState(sessionPage);

  return (
    <BarContain ref={ref}>
      <Drag {...bind()} style={{ top: y }} />
    </BarContain>
  );
};

const Wrap = () => {
  return (
    <Contain>
      <Grid />
      <Bar />
    </Contain>
  );
};

export default Wrap;

/**
 * () => {
          down.current = true;
          const rrr = () => {
            setDragging(false);
            document.removeEventListener("mouseup", rrr);
            document.removeEventListener("mousemove", move);
            const pa = Math.floor(
              ((parseInt(rref.current.style.top) / height?.height) * count) / 20
            );
            console.log(pa);
            set(pa);
          };
          const move = (e) => {
            if (!down.current) {
              return;
            }
            console.log(e);
            !dragging && setDragging(true);
            rref.current.style.top =
              parseInt(rref.current.style.top) + e.movementY + "px";
          };
          document.addEventListener("mousemove", move);
          document.addEventListener("mouseup", rrr);
        }
 */
