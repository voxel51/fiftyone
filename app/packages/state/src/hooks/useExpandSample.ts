import type * as foq from "@fiftyone/relay";
import type { SpotlightConfig } from "@fiftyone/spotlight";
import type { ResponseFrom } from "../utils";

import { get } from "lodash";
import { useRecoilCallback } from "recoil";
import * as atoms from "../recoil/atoms";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as groupAtoms from "../recoil/groups";
import { getSanitizedGroupByExpression } from "../recoil/utils";
import useSetExpandedSample from "./useSetExpandedSample";
import useSetModalState from "./useSetModalState";

export type Sample = Exclude<
  Exclude<
    ResponseFrom<foq.paginateSamplesQuery>["samples"]["edges"][0]["node"],
    {
      readonly __typename: "%other";
    }
  >,
  null
>;

export default (store: WeakMap<symbol, { index: number; sample: Sample }>) => {
  const setExpandedSample = useSetExpandedSample();
  const setModalState = useSetModalState();
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async ({
        event,
        item,
        next: cursor,
      }: Parameters<SpotlightConfig<number, Sample>["onItemClick"]>["0"]) => {
        if (event.ctrlKey || event.metaKey) {
          set(atoms.selectedSamples, (selected) => {
            const newSelected = new Set([...selected]);
            if (newSelected.has(item.id.description)) {
              newSelected.delete(item.id.description);
            } else {
              newSelected.add(item.id.description);
            }

            return newSelected;
          });
          return;
        }

        const hasGroupSlices = await snapshot.getPromise(
          groupAtoms.hasGroupSlices
        );
        const groupField = await snapshot.getPromise(groupAtoms.groupField);
        const dynamicGroupParameters = await snapshot.getPromise(
          dynamicGroupAtoms.dynamicGroupParameters
        );

        const iter = async (request: Promise<symbol | undefined>) => {
          const id = await request;
          const sample = store.get(id);

          if (!sample) {
            throw new Error("unable to paginate to next sample");
          }

          let groupId: string;
          if (hasGroupSlices) {
            groupId = get(sample.sample, groupField)._id as string;
          }

          let groupByFieldValue: string;
          if (dynamicGroupParameters?.groupBy) {
            groupByFieldValue = String(
              get(
                sample.sample,
                getSanitizedGroupByExpression(dynamicGroupParameters.groupBy)
              )
            );
          }

          return { id: id.description, groupId, groupByFieldValue };
        };

        const next = async () => {
          return {
            hasNext: Boolean(await cursor(2, true)),
            hasPrevious: true,
            ...(await iter(cursor(1))),
          };
        };

        const previous = async () => {
          return {
            hasNext: true,
            hasPrevious: Boolean(await cursor(-2, true)),
            ...(await iter(cursor(-1))),
          };
        };

        const hasNext = Boolean(await cursor(1, true));
        const hasPrevious = Boolean(await cursor(-1, true));

        setModalState({
          next,
          previous,
        })
          .then(() => iter(Promise.resolve(item.id)))
          .then((data) => setExpandedSample({ ...data, hasNext, hasPrevious }));
      },
    [setExpandedSample, setModalState]
  );
};
