import type { ID } from "@fiftyone/floodlight";
import { useMemo } from "react";
import { useReverbCallback, useReverbTransaction } from "@fiftyone/reverb";
import { gridAt, gridFraction, gridPage } from "./atoms";
import usePanelMemo from "./panelMemory";

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

  // the first read after new data starts at the top; a remount in the same
  // panel (returning from a sample's page) keeps its place
  const marker = usePanelMemo("scrollMarker", pageReset, () => ({
    current: -1 as number | null,
  }));
  const getKey = useMemo(() => {
    const ref = marker;

    return () => {
      if (ref.current === -1) {
        ref.current = null;
        return "reset";
      }

      getPage(ref);

      return ref.current;
    };
  }, [getPage, marker]);

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
