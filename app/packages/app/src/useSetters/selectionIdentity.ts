import { viewConversion } from "@fiftyone/state/src/selection/model";

/** Whether navigation changes the entity IDs used by the sample selection. */
export const changesSampleIdentity = (
  previous: readonly unknown[],
  next: readonly unknown[],
) => viewConversion(previous)?.key !== viewConversion(next)?.key;
