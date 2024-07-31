import type { ID } from "@fiftyone/spotlight";
import { useMemo } from "react";
import { useRecoilCallback, useRecoilTransaction_UNSTABLE } from "recoil";
import { gridAt, gridOffset, gridPage } from "./recoil";

export default function useAt(pageReset: string) {
  const getPage = useRecoilTransaction_UNSTABLE(
    ({ get }) =>
      (ref: { current: number | null }) => {
        ref.current = get(gridPage);
      },
    []
  );

  const getKey = useMemo(() => {
    pageReset;
    const ref: { current: number | null } = { current: -1 };

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

        const description = snapshot.getLoadable(gridAt).getValue();
        if (!description || key === "reset" || key === null) {
          return { key: 0 };
        }

        return {
          at: {
            description,
            offset: snapshot.getLoadable(gridOffset).getValue(),
          },
          key,
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
