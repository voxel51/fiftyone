import type { ID } from "@fiftyone/floodlight";
import { useMemo } from "react";
import { useReverbCallback, useReverbTransaction } from "@fiftyone/reverb";
import { gridAt, gridFraction, gridPage } from "./atoms";

export interface ScrollLocation {
  at: ID;
  page: number;
  fraction: number;
}

export default function useScrollLocation(pageReset: string) {
  const getPage = useReverbTransaction(
    ({ get }) =>
      (ref: { current: number | null }) => {
        ref.current = get(gridPage);
      },
    [],
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

  const get = useReverbCallback(
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
            fraction: snapshot.getLoadable(gridFraction).getValue(),
          },
          key,
        };
      },
    [getKey],
  );

  // when scrolling ends, use set to save the grid location to the store
  const set = useReverbTransaction(
    ({ set }) =>
      (location: ScrollLocation) => {
        set(gridPage, location.page);
        set(gridAt, location.at.description);
        set(gridFraction, location.fraction);
      },
    [],
  );

  return { get, set };
}
