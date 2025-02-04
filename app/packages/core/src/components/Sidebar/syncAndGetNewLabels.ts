import { CachedLabels, LookerId } from "./useDetectNewActiveLabelFields";

/**
 * Synchronizes which label fields a given looker has seen so far. Returns any
 * new (not-yet-cached) fields as an array, or null if there are no new fields.
 *
 * @param lookerId - unique Looker ID
 * @param lut - look-up table tracking which fields each looker has already rendered
 * @param currentActiveLabelFields - set of active label fields for the modal/looker
 * @returns array of newly added label fields, or null if there are none
 */
export const syncAndGetNewLabels = (
  lookerId: string,
  lut: Map<LookerId, CachedLabels>,
  currentActiveLabelFields: Set<string>
): string[] | null => {
  if (currentActiveLabelFields.size === 0) {
    return null;
  }

  const cachedFieldsForLooker = lut.get(lookerId);
  let newFields: string[] = [];

  if (cachedFieldsForLooker) {
    // Collect only the fields that aren't in the cache
    for (const field of currentActiveLabelFields) {
      if (!cachedFieldsForLooker.has(field)) {
        newFields.push(field);
      }
    }
  } else {
    // If there is no cache for this looker, everything is new
    newFields = Array.from(currentActiveLabelFields);
  }

  if (newFields.length === 0) {
    // No additions, so no update needed
    return null;
  }

  // Update the cache by merging new fields into the existing set (or create a new set)
  lut.set(
    lookerId,
    new Set([...(cachedFieldsForLooker ?? []), ...currentActiveLabelFields])
  );

  return newFields;
};
