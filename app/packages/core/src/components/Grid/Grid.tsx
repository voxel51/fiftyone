import Flashlight, { PageChange } from "@fiftyone/flashlight";
import * as fos from "@fiftyone/state";
import { sessionAtom } from "@fiftyone/state";
import { useLayoutEffect, useMemo } from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import { v4 as uuid } from "uuid";
import useFlashlightPager from "../../useFlashlightPager";
import { flashlightLooker } from "./Grid.module.css";
import { pageParameters, rowAspectRatioThreshold } from "./recoil";

const sessionPage = sessionAtom({
  key: "sessionPage",
  default: 0,
});

function Grid() {
  const id = useMemo(() => uuid(), []);

  const threshold = useRecoilValue(rowAspectRatioThreshold);
  const page = useFlashlightPager(pageParameters);
  const lookerOptions = fos.useLookerOptions(false);

  const createLooker = fos.useCreateLooker(false, true, lookerOptions);
  const getPage = useRecoilCallback(
    ({ snapshot }) =>
      () =>
        snapshot.getLoadable(sessionPage).getValue(),
    []
  );

  const setPage = useSetRecoilState(sessionPage);
  useLayoutEffect(() => {
    const flashlight = new Flashlight<number>({
      key: getPage(),
      rowAspectRatioThreshold: threshold,
      get: (next) => page.current(next),
      render: (id, element, dimensions, soft, hide) => {},
    });
    const pagechange = (e: PageChange<number>) => setPage(e.page);

    flashlight.addEventListener("pagechange", pagechange);
    flashlight.attach(id);

    return () => {
      flashlight.removeEventListener("pagechange", pagechange);
      flashlight.detach();
    };
  }, [getPage, id, page, setPage, threshold]);

  return <div id={id} className={flashlightLooker} data-cy="fo-grid"></div>;
}

export default Grid;
