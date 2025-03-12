import { InstanceId, LabelEventData, LabelId } from "@fiftyone/looker";
import { atom } from "jotai";

/**
 * ======= TYPES =======
 */

export type HoveredInstancesLabelIdsSet = Set<LabelId>;
export type HoveredInstancesLabelsMap = Map<
  InstanceId,
  HoveredInstancesLabelIdsSet
>;

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
export const hoveredInstances = atom<HoveredInstancesLabelsMap>(
  new Map<InstanceId, HoveredInstancesLabelIdsSet>()
);

/**
 * Add a label instance to the hovered instances set
 */
export const updateHoveredInstances = atom(
  null,
  (get, set, newValue: LabelEventData) => {
    const currentMap = get(hoveredInstances);
    if (currentMap.has(newValue.instanceId)) {
      currentMap.get(newValue.instanceId)?.add(newValue.labelId);
    } else {
      currentMap.set(newValue.instanceId, new Set([newValue.labelId]));
    }
    set(hoveredInstances, currentMap);
  }
);

/**
 * Remove a label instance from the hovered instances set
 * by either instanceId or labelId
 */
export const removeHoveredInstance = atom(
  null,
  (get, set, { instanceId, labelId }: Partial<LabelEventData>) => {
    const currentMap = get(hoveredInstances);
    if (currentMap.has(instanceId)) {
      if (labelId) {
        currentMap.get(instanceId)?.delete(labelId);
      } else {
        currentMap.delete(instanceId);
      }
    }
    set(hoveredInstances, currentMap);
  }
);

/**
 * Remove all hovered instances
 */
export const removeAllHoveredInstances = atom(null, (get, set) => {
  const currentMap = get(hoveredInstances);
  currentMap.clear();
  set(hoveredInstances, currentMap);
});

export * from "./jotai-store";
