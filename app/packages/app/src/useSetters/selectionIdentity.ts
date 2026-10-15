import { viewConversion } from "@fiftyone/state/src/selection/model";

/** Whether navigation changes the entity IDs used by the sample selection. */
export const changesSampleIdentity = (
  previous: readonly unknown[],
  next: readonly unknown[],
) => viewConversion(previous)?.key !== viewConversion(next)?.key;

/** Whether resolved history entries switch between different entity IDs. */
export function changesHistorySampleIdentity(
  previous: {
    savedViewSlug?: string;
    view?: readonly unknown[];
    viewResolved?: boolean;
  },
  next: {
    savedViewSlug?: string;
    view?: readonly unknown[];
    viewResolved?: boolean;
  },
) {
  const known = (entry: typeof previous) =>
    !entry.savedViewSlug || entry.viewResolved || Boolean(entry.view?.length);
  return Boolean(
    known(previous) &&
    known(next) &&
    changesSampleIdentity(previous.view ?? [], next.view ?? []),
  );
}
