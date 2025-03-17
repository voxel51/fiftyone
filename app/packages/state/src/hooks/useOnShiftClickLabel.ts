import { LabelData, LabelToggledEvent } from "@fiftyone/looker";
import { useRecoilCallback } from "recoil";
import { hoveredInstances, jotaiStore } from "../jotai";
import { selectedLabelMap } from "../recoil";
import { selectedLabels } from "../recoil/atoms";

export const useOnShiftClickLabel = () => {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (sampleId: string, labels: LabelData[], e: LabelToggledEvent) => {
        const { sourceInstanceId } = e.detail;

        if (!sourceInstanceId) {
          return;
        }

        /**
         * Let k = number of currently hovered similar instances
         * Let n = number of instances in the modal with that instance config
         *
         * Three possible cases:
         * 1. If k = 0, shift + click selects all instances with that instance config
         * 2. If k = n, shift + click deselects all instances with that instance config
         * 3. If 0 < k < n, shift + click selects all instances with that instance config
         */

        const currentHoveredInstances = jotaiStore.get(hoveredInstances);

        if (!currentHoveredInstances || currentHoveredInstances.length !== 2) {
          return;
        }

        const [currentlyHoveredInstanceId, currentlyHoveredInstanceLabels] =
          currentHoveredInstances;

        if (sourceInstanceId !== currentlyHoveredInstanceId) {
          console.error(
            "sourceInstanceId",
            sourceInstanceId,
            "does not match currentlyHoveredInstanceId",
            currentlyHoveredInstanceId
          );
          return;
        }

        const currentSelectedLabels = snapshot
          .getLoadable(selectedLabelMap)
          .getValue();

        const currentSelectedInstances = Object.values(
          currentSelectedLabels
        ).filter((label) => sourceInstanceId === label.instanceId);
        const currentSelectedInstanceCount = currentSelectedInstances.length;
        const currentHoveredInstanceCount = Object.keys(
          currentlyHoveredInstanceLabels
        ).length;

        // scenario 1, when no similar instances are selected
        if (currentSelectedInstanceCount === 0) {
          set(selectedLabels, (prev) => {
            return [
              ...prev,
              ...Object.values(currentlyHoveredInstanceLabels).map((e) => ({
                sampleId,
                labelId: e.labelId,
                frameNumber: e.frameNumber,
                field: e.field,
                instanceId: e.instanceId,
              })),
            ];
          });
          e.stopImmediatePropagation();
          return;
        }

        // scenario 2, when all similar instances are selected
        if (currentSelectedInstanceCount === currentHoveredInstanceCount) {
          set(selectedLabels, (prev) => {
            return prev.filter(
              (label) => label.instanceId !== currentlyHoveredInstanceId
            );
          });
          e.stopImmediatePropagation();
          return;
        }

        // scenario 3, when some similar instances are selected
        if (
          currentSelectedInstanceCount > 0 &&
          currentSelectedInstanceCount < currentHoveredInstanceCount
        ) {
          const labelsToAdd = labels.filter(
            (l) =>
              l.instanceId === sourceInstanceId &&
              !currentSelectedLabels[l.labelId]
          );

          if (labelsToAdd.length > 0) {
            set(selectedLabels, (prev) => {
              const deduped = [...prev, ...labelsToAdd].filter(
                (v, i, self) =>
                  self.findIndex((t) => t.labelId === v.labelId) === i
              );

              if (deduped.length === currentHoveredInstanceCount) {
                // if we don't stop propagation, it's possible that the
                // in one of the handlers, scenario 2 is triggered again
                // and we end up with all labels toggled off
                e.stopImmediatePropagation();
              }

              return deduped;
            });
          }

          return;
        }
      },
    []
  );
};
