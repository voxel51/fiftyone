import type { PaginateSamplesNode } from "@fiftyone/relay";
import type {
  ID,
  Iter as SpotlightIter,
  SpotlightConfig,
} from "@fiftyone/spotlight";

import { get } from "lodash";
import { useRecoilCallback } from "recoil";
import * as atoms from "../recoil/atoms";
import * as groupAtoms from "../recoil/groups";
import useSetExpandedSample from "./useSetExpandedSample";
import useSetModalState from "./useSetModalState";

export type Sample = Exclude<PaginateSamplesNode, null>;

/**
 * Builds the click-to-expand handler for a Spotlight grid.
 *
 * The returned function takes the standard `onItemClick` payload plus a
 * `getIter` callback that mints a fresh navigation iterator. `getIter` is
 * only invoked when the click opens the modal (skipped for ctrl/meta
 * multi-select clicks), and its result drives modal next/previous. The
 * iter's current focus becomes the seed sample for `modalSelector`.
 *
 * @param store - Per-cursor sample cache populated by the pager.
 */
export default (store: WeakMap<ID, { index: number; sample: Sample }>) => {
  const setExpandedSample = useSetExpandedSample();
  const setModalState = useSetModalState();

  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (
        {
          event,
          item,
        }: Parameters<SpotlightConfig<number, Sample>["onItemClick"]>["0"],
        getIter: () => SpotlightIter
      ) => {
        if (event.ctrlKey || event.metaKey) {
          set(atoms.selectedSamples, (selected) => {
            const newSelected = new Map(selected);
            if (newSelected.has(item.id.description)) {
              newSelected.delete(item.id.description);
            } else {
              newSelected.set(
                item.id.description,
                event.altKey ? "alt" : "default"
              );
            }

            return newSelected;
          });
          return;
        }

        // Mint a fresh iterator anchored to the currently focused item.
        // Spotlight's row handler already called `focus(item.id)` before
        // invoking the click callback, so the iter inherits that focus.
        const cursor = getIter();

        const hasGroupSlices = await snapshot.getPromise(
          groupAtoms.hasGroupSlices
        );
        const groupField = await snapshot.getPromise(groupAtoms.groupField);

        const resolve = async (request: Promise<ID | undefined>) => {
          const id = await request;
          const sample = store.get(id);

          if (!sample) {
            throw new Error("unable to paginate to next sample");
          }

          let groupId: string;
          if (hasGroupSlices) {
            groupId = get(sample.sample, groupField)._id as string;
          }

          return { id: id.description, groupId };
        };

        const next = async (offset = 1) => {
          const nextId = await cursor.next(offset);
          const nextCheckId = await cursor.next(offset, true);

          const result = await resolve(Promise.resolve(nextId));
          return {
            hasNext: Boolean(nextCheckId),
            hasPrevious: true,
            ...result,
          };
        };

        const previous = async (offset: number) => {
          const prevId = await cursor.next(-1 * offset);
          const prevCheckId = await cursor.next(-1 * offset, true);

          const result = await resolve(Promise.resolve(prevId));
          return {
            hasNext: true,
            hasPrevious: Boolean(prevCheckId),
            ...result,
          };
        };

        const hasNext = Boolean(await cursor.next(1, true));
        const hasPrevious = Boolean(await cursor.next(-1, true));

        setModalState({
          next,
          previous,
        })
          .then(() => resolve(Promise.resolve(item.id)))
          .then((data) => setExpandedSample({ ...data, hasNext, hasPrevious }));
      },
    [setExpandedSample, setModalState]
  );
};
