import { ID } from "@fiftyone/spotlight";
import { useMemo } from "react";
import { useRecoilCallback, useRecoilTransaction_UNSTABLE } from "recoil";
import { gridAt, gridOffset, gridPage } from "./recoil";

export default function useAt(refreshers: object) {
  const getPage = useRecoilCallback(
    ({ snapshot }) =>
      () => {
        return snapshot.getLoadable(gridPage).getValue();
      },
    []
  );
  const getKey = useMemo(() => {
    refreshers;
    let page = 0;

    return () => {
      if (page === 0) {
        page = null;
        return "reset";
      }

      return getPage();
    };
  }, [getPage, refreshers]);

  const get = useRecoilCallback(
    ({ snapshot }) =>
      () => {
        const key = getKey();
        return {
          at:
            key !== "reset"
              ? {
                  description: snapshot.getLoadable(gridAt).getValue(),
                  offset: snapshot.getLoadable(gridOffset).getValue(),
                }
              : { description: undefined, offset: undefined },
          key: key === "reset" ? 0 : key,
        };
      },
    [getKey]
  );
  const set = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      ({ at, page, offset }: { at: ID; page: number; offset: number }) => {
        set(gridPage, page);
        set(gridAt, at.description);
        set(gridOffset, offset);
      },
    []
  );

  return { get, set };
}
