import { CachedLabels, LookerId } from "./useShouldReloadSample";

/**
 * Checks if a given looker needs to be refreshed based on active label fields.
 *
 * @param lookerId - unique Looker ID
 * @param lut - look-up table tracking which fields each looker has already rendered at least once (and therefore cached)
 * @param currentActiveLabelFields - set of active label fields for the modal/looker
 *
 * @returns whether or not looker should be refreshed (true) or not (false)
 */
export const syncAndCheckRefreshNeeded = (
  lookerId: string,
  lut: Map<LookerId, CachedLabels>,
  currentActiveLabelFields: Set<string>
) => {
  // if no active fields, no refresh is needed
  if (currentActiveLabelFields.size === 0) {
    return false;
  }

  const thisLookerActiveFields = lut.get(lookerId);

  // we only care about net-new fields.
  let hasNewFields = false;

  if (thisLookerActiveFields) {
    for (const field of currentActiveLabelFields) {
      if (!thisLookerActiveFields.has(field)) {
        hasNewFields = true;
        break;
      }
    }
  } else {
    // if `thisLookerActiveFields` is undefined, it means this looker has not been considered yet
    hasNewFields = true;
  }

  // if no new fields, then no refresh is needed
  if (!hasNewFields) {
    return false;
  }

  // update cached labels set for this looker
  lut.set(
    lookerId,
    new Set([...(thisLookerActiveFields ?? []), ...currentActiveLabelFields])
  );

  return true;
};
