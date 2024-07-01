import { FlashlightConfig } from "@fiftyone/flashlight";
import { get } from "lodash";
import { useRecoilCallback } from "recoil";
import * as atoms from "../recoil/atoms";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as groupAtoms from "../recoil/groups";
import { getSanitizedGroupByExpression } from "../recoil/utils";
import { LookerStore, Lookers } from "./useLookerStore";
import useSetExpandedSample from "./useSetExpandedSample";
import useSetModalState from "./useSetModalState";

export default <T extends Lookers>(store: LookerStore<T>) => {
  const setExpandedSample = useSetExpandedSample();
  const setModalState = useSetModalState();

  return useRecoilCallback<
    Parameters<NonNullable<FlashlightConfig<number>["onItemClick"]>>,
    void
  >(
    ({ snapshot, set }) =>
      async (next, sampleId, itemIndexMap, event) => {
        if (event.ctrlKey || event.metaKey) {
          set(atoms.selectedSamples, (selected) => {
            const newSelected = new Set([...selected]);
            if (newSelected.has(sampleId)) {
              newSelected.delete(sampleId);
            } else {
              newSelected.add(sampleId);
            }

            return newSelected;
          });
          return;
        }
        const clickedIndex = itemIndexMap[sampleId];
        const hasGroupSlices = await snapshot.getPromise(
          groupAtoms.hasGroupSlices
        );
        const groupField = await snapshot.getPromise(groupAtoms.groupField);
        const dynamicGroupParameters = await snapshot.getPromise(
          dynamicGroupAtoms.dynamicGroupParameters
        );

        const getItemAtIndex = async (index: number) => {
          if (!store.indices.has(index)) await next();

          const id = store.indices.get(index);

          if (!id) {
            throw new Error(
              `unable to paginate to next sample, index = ${index}`
            );
          }

          const sample = store.samples.get(id);

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

          return { id, groupId, groupByFieldValue };
        };

        setModalState(getItemAtIndex).then(() =>
          setExpandedSample(clickedIndex)
        );
      },
    [setExpandedSample, setModalState, store]
  );
};
