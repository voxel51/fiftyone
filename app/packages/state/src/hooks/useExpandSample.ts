import type { PaginateSamplesNode } from "@fiftyone/relay";
import type { ID, SpotlightConfig } from "@fiftyone/spotlight";

import { get } from "lodash";
import { useReverbCallback } from "@fiftyone/reverb";
import * as atoms from "../atoms/atoms";
import * as groupAtoms from "../atoms/groups";
import useSetExpandedSample from "./useSetExpandedSample";
import {
  createSampleNavigator,
  type SamplePage,
  type SamplePosition,
} from "../navigation/sampleNavigator";
import useSetModalState from "./useSetModalState";

export type Sample = Exclude<PaginateSamplesNode, null>;

type PagedSample = { id: ID; data: Sample };

/** The pages a grid shows, and where a sample sits in them. */
export interface ExpandSamplePages {
  get: (key: number) => Promise<SamplePage<number, PagedSample>>;
  positionOf: (id: string) => SamplePosition<number> | undefined;
}

export default (pages: ExpandSamplePages) => {
  const setExpandedSample = useSetExpandedSample();
  const setModalState = useSetModalState();

  return useReverbCallback(
    ({ snapshot, set }) =>
      async ({
        event,
        item,
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

        const [hasGroupSlices, groupField] = await Promise.all([
          snapshot.getPromise(groupAtoms.hasGroupSlices),
          snapshot.getPromise(groupAtoms.groupField),
        ]);

        const selectorOf = ({ id, data }: PagedSample) => ({
          id: id.description,
          groupId: hasGroupSlices
            ? (get(data.sample, groupField)._id as string)
            : undefined,
        });

        // navigation walks the grid's pages, not the grid, so it outlives it
        const at = pages.positionOf(item.id.description);
        const navigator = at && createSampleNavigator({ at, get: pages.get });

        const step = async (offset: number) => {
          const found = await navigator?.step(offset);
          if (!found) {
            throw new Error("unable to paginate to next sample");
          }
          const [hasNext, hasPrevious] = await Promise.all([
            navigator?.peek(1),
            navigator?.peek(-1),
          ]);
          return {
            ...selectorOf(found),
            hasNext: Boolean(hasNext),
            hasPrevious: Boolean(hasPrevious),
          };
        };

        const next = (offset = 1) => step(offset);
        const previous = (offset = 1) => step(-offset);
        const peek = async (offset: number) => {
          const found = await navigator?.peek(offset);
          return found
            ? { id: found.id.description, sample: found.data }
            : null;
        };

        const [hasNext, hasPrevious] = await Promise.all([
          navigator?.peek(1),
          navigator?.peek(-1),
        ]);

        await setModalState(navigator ? { next, peek, previous } : undefined);

        await setExpandedSample({
          ...selectorOf(item),
          hasNext: Boolean(hasNext),
          hasPrevious: Boolean(hasPrevious),
        });
      },
    [pages, setExpandedSample, setModalState],
  );
};
