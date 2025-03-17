import { LabelData } from "@fiftyone/looker";
import { useRecoilCallback } from "recoil";
import { hoveredInstances, jotaiStore } from "../jotai";
import { selectedLabelMap } from "../recoil";
import { selectedLabels } from "../recoil/atoms";

export const useOnShiftClickLabel = () => {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (sampleId: string, labels: LabelData[], e: CustomEvent) => {
        const {
          isShiftPressed,
          sourceInstanceId,
          sourceInstanceName,
          sourceSampleId,
        } = e.detail;

        if (!isShiftPressed) {
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
        if (currentSelectedInstanceCount > 0) {
          const labelsToAdd = labels.filter(
            (l) =>
              l.instanceId === sourceInstanceId &&
              !currentSelectedLabels[l.labelId]
          );

          if (labelsToAdd.length > 0) {
            set(selectedLabels, (prev) => {
              return [...prev, ...labelsToAdd];
            });
          }

          // note: don't stop event propagation here, because we want to allow
          // the user to select multiple instances with the same instance config
          // by shift + clicking on them
          return;
        }
      },
    []
  );
};
