import { InstanceId, LabelHoveredEventData, LabelId } from "@fiftyone/looker";
import { atom } from "jotai";
import { jotaiStore } from "./jotai-store";

/**
 * ======= TYPES =======
 */

export type LabelMap = Record<LabelId, LabelHoveredEventData>;
export type HoveredInstancesLabelsTuple = [InstanceId, LabelMap];

/**
 * ======= ATOMS AND SELECTORS =======
 */

/**
 * Number of concurrently rendering labels.
 */
export const numConcurrentRenderingLabels = atom(0);

/**
 * Set of hovered instances
 */
export const hoveredInstances = atom<HoveredInstancesLabelsTuple | false>(
  false
);

/**
 * Whether there are hovered instances
 */
export const isHoveringAnyLabelWithInstanceConfig = () => {
  const currentHoveredInstances = jotaiStore.get(hoveredInstances);

  return currentHoveredInstances && currentHoveredInstances.length === 2;
};

/**
 * Whether there are hovered instances of a particular instance
 */
export const isHoveringParticularLabelWithInstanceConfig = (
  instanceId: InstanceId
) => {
  const currentHoveredInstances = jotaiStore.get(hoveredInstances);

  return (
    currentHoveredInstances &&
    currentHoveredInstances?.length === 2 &&
    currentHoveredInstances[0] === instanceId
  );
};

/**
 * add a label instance to the hovered instances set
 */
export const updateHoveredInstances = atom(
  null,
  (get, set, newValue: LabelHoveredEventData) => {
    const currentHoveredInstances = get(hoveredInstances);

    if (!currentHoveredInstances || currentHoveredInstances?.length !== 2) {
      set(hoveredInstances, [
        newValue.instanceId,
        { [newValue.labelId]: newValue },
      ]);
      return;
    }

    set(hoveredInstances, (prev: HoveredInstancesLabelsTuple) => {
      const prevWithCorrectInstanceId = Object.entries(prev[1])
        .filter(([_labelId, label]) => label.instanceId === newValue.instanceId)
        .reduce((acc, [labelId, label]) => {
          acc[labelId] = label;
          return acc;
        }, {});

      return [
        newValue.instanceId,
        { ...prevWithCorrectInstanceId, [newValue.labelId]: newValue },
      ];
    });
  }
);

/**
 * Remove all hovered instances
 */
export const removeAllHoveredInstances = atom(null, (_get, set) => {
  set(hoveredInstances, false);
});

/**
 * Current modal unique id.
 * It's a concatenation of the group id and the sample id.
 */
export const currentModalUniqueIdJotaiAtom = atom<string>("");

export * from "./jotai-store";
