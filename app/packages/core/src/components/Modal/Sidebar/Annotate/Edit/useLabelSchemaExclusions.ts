import { usePerPointAttributeNames } from "./useSelectedKeypoint";

/**
 * Hook which returns a set of attribute names which should be excluded
 * from the top-level editing schema.
 *
 * These fields are handled through mechanisms specific to their label type.
 */
export const useLabelSchemaExclusions = (): Set<string> => {
  return usePerPointAttributeNames();
};
