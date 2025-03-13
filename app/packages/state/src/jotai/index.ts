import { InstanceId, LabelEventData, LabelId } from "@fiftyone/looker";
import { atom } from "jotai";
import { jotaiStore } from "./jotai-store";

/**
 * ======= TYPES =======
 */

export type LabelMap = Record<LabelId, LabelEventData>;
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
  (get, set, newValue: LabelEventData) => {
    const currentHoveredInstances = get(hoveredInstances);

    if (!currentHoveredInstances || currentHoveredInstances?.length !== 2) {
      set(hoveredInstances, [
        newValue.instanceId,
        { [newValue.labelId]: newValue },
      ]);
      return;
    }

    set(hoveredInstances, (prev) => {
      return [prev[0], { ...prev[1], [newValue.labelId]: newValue }];
    });
  }
);

/**
 * Remove all hovered instances
 */
export const removeAllHoveredInstances = atom(null, (_get, set) => {
  set(hoveredInstances, false);
});

export * from "./jotai-store";
