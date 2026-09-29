import type { ID } from "@fiftyone/spotlight";
import { useMemo } from "react";
import {
  atom,
  useReverbCallback,
  useReverbTransaction,
  useReverbValue,
} from "@fiftyone/reverb";
import { gridAt, gridOffset, gridPage } from "./atoms";

const gridJump = atom({
  key: "gridJump",
  default: 0,
});

/** Signals that the grid should rebuild at its newly requested location. */
export function useGridJumpRevision() {
  return useReverbValue(gridJump);
}

/** The sample and pixel offset at the start of a grid page. */
export interface ScrollLocation {
  at: ID;
  page: number;
  offset: number;
}

/** Saves, restores, and explicitly changes the grid's scroll anchor. */
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
            offset: snapshot.getLoadable(gridOffset).getValue(),
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
        set(gridOffset, location.offset);
      },
    [],
  );

  // Point the grid at a sample on a known page; the layout refresher sees
  // the jump and rebuilds the grid there, as it does after the modal closes.
  const jump = useReverbTransaction(
    ({ set }) =>
      ({ page, at }: { page: number; at: string }) => {
        set(gridPage, page);
        set(gridAt, at);
        set(gridOffset, 0);
        set(gridJump, (count) => count + 1);
      },
    [],
  );

  return { get, set, jump };
}
