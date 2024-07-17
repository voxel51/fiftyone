import type { ID } from "@fiftyone/spotlight";
import { useMemo } from "react";
import { useRecoilCallback, useRecoilTransaction_UNSTABLE } from "recoil";
import { gridAt, gridOffset, gridPage } from "./recoil";

export default function useAt(pageReset: string) {
  const getPage = useRecoilTransaction_UNSTABLE(
    ({ get }) =>
      (ref: { current: number }) => {
        ref.current = get(gridPage);
      },
    []
  );

  const getKey = useMemo(() => {
    pageReset;
    const ref = { current: -1 };

    return () => {
      if (ref.current === -1) {
        ref.current = null;
        return "reset";
      }

      getPage(ref);

      return ref.current;
    };
  }, [getPage, pageReset]);

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
