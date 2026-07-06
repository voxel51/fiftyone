import type { PaginateSamplesNode } from "@fiftyone/relay";
import type { ID, SpotlightConfig } from "@fiftyone/spotlight";

import { get } from "lodash";
import { useRecoilCallback } from "recoil";
import * as atoms from "../recoil/atoms";
import * as groupAtoms from "../recoil/groups";
import useSetExpandedSample from "./useSetExpandedSample";
import useSetModalState from "./useSetModalState";

export type Sample = Exclude<PaginateSamplesNode, null>;

export default (store: WeakMap<ID, { index: number; sample: Sample }>) => {
  const setExpandedSample = useSetExpandedSample();
  const setModalState = useSetModalState();

  return useRecoilCallback(
    ({ snapshot, set }) =>
      async ({
        event,
        item,
        iter: cursor,
      }: Parameters<SpotlightConfig<number, Sample>["onItemClick"]>["0"]) => {
        if (event.ctrlKey || event.metaKey) {
          set(atoms.selectedSamples, (selected) => {
            const newSelected = new Map(selected);
            if (newSelected.has(item.id.description)) {
              newSelected.delete(item.id.description);
            } else {
              newSelected.set(
                item.id.description,
                event.altKey ? "alt" : "default",
              );
            }

            return newSelected;
          });
          return;
        }

        const hasGroupSlices = await snapshot.getPromise(
          groupAtoms.hasGroupSlices,
        );
        const groupField = await snapshot.getPromise(groupAtoms.groupField);

        const iter = async (request: Promise<ID | undefined>) => {
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

          const result = await iter(Promise.resolve(nextId));
          return {
            hasNext: Boolean(nextCheckId),
            hasPrevious: true,
            ...result,
          };
        };

        const previous = async (offset: number) => {
          const prevId = await cursor.next(-1 * offset);
          const prevCheckId = await cursor.next(-1 * offset, true);

          const result = await iter(Promise.resolve(prevId));
          return {
            hasNext: true,
            hasPrevious: Boolean(prevCheckId),
            ...result,
          };
        };

        // Read-ahead: resolve the sample at `offset` WITHOUT moving the cursor
        // (the `true` flag is the soft/peek mode in spotlight's Iter.next).
        // Used to prefetch neighbors; returns null when out of range or not yet
        // paged into the store (iter throws in that case).
        const peek = async (offset: number) => {
          const peekId = await cursor.next(offset, true);
          if (!peekId) {
            return null;
          }
          try {
            return await iter(Promise.resolve(peekId));
          } catch {
            return null;
          }
        };

        const hasNext = Boolean(await cursor.next(1, true));
        const hasPrevious = Boolean(await cursor.next(-1, true));

        setModalState({
          next,
          previous,
          peek,
        })
          .then(() => iter(Promise.resolve(item.id)))
          .then((data) => setExpandedSample({ ...data, hasNext, hasPrevious }));
      },
    [setExpandedSample, setModalState],
  );
};
