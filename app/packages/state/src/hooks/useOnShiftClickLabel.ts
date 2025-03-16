import { LabelData } from "@fiftyone/looker";
import { useRecoilCallback } from "recoil";
import { hoveredInstances, jotaiStore } from "../jotai";
import { selectedLabels } from "../recoil/atoms";

export const useOnShiftClickLabel = () => {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (sampleId: string, labels: LabelData[], e: CustomEvent) => {
        const {
          isShiftPressed,
          sourceLabelId,
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

        const currentSelectedLabels = snapshot
          .getLoadable(selectedLabels)
          .getValue();

        const currentSelectedInstances = currentSelectedLabels.filter(
          (label) => sourceInstanceId === currentlyHoveredInstanceId
        );
        const currentSelectedInstanceCount = currentSelectedInstances.length;

        // scenario 1
        if (currentSelectedInstanceCount === 0) {
          // select all instances with that instance config
          set(selectedLabels, (prev) => {
            return [
              ...prev,
              ...Object.values(currentlyHoveredInstanceLabels).map((e) => ({
                sampleId,
                labelId: e.labelId,
                frameNumber: e.frameNumber,
                field: e.field,
              })),
            ];
          });
          return;
        }

        // scenario 2
        if (
          currentSelectedInstanceCount ===
          Object.keys(currentlyHoveredInstanceLabels).length
        ) {
          set(selectedLabels, (prev) => {
            return prev.filter(
              (label) => label.instanceId !== currentlyHoveredInstanceId
            );
          });
          return;
        }

        // scenario 3
        if (currentSelectedInstanceCount > 0) {
          set(selectedLabels, (prev) => {
            return prev.filter(
              (label) => label.instanceId !== currentlyHoveredInstanceId
            );
          });
        }

        // we don't react if event source is the same sample
        if (sourceSampleId === sampleId) {
          return;
        }

        // const labels = looker.getCurrentSampleLabels();
        const toggleLabel = labels.filter(
          (l) => l.instanceId === sourceInstanceId
        );

        console.log(
          "Toggle label of sample",
          sampleId,
          toggleLabel,
          "there were ",
          labels.length,
          "labels with instanceIds",
          labels.map((l) => l.instanceId)
        );
        if (toggleLabel.length > 0) {
          set(selectedLabels, (prev) => {
            return [
              ...prev,
              {
                sampleId,
                instanceId: sourceInstanceId,
                instanceName: sourceInstanceName,
                labelId: toggleLabel[0].labelId,
                frameNumber: toggleLabel[0].frameNumber,
                field: toggleLabel[0].field,
              },
            ];
          });
        }
      },
    []
  );
};
