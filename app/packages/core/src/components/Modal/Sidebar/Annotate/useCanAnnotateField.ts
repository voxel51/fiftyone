import { isSystemReadOnlyField } from "./SchemaManager/constants";
import { useIsFieldReadOnly } from "./SchemaManager/hooks";
import useCanAnnotate from "./useCanAnnotate";
import { useValidAnnotationFields } from "./useValidAnnotationFields";

/**
 * Hook which returns whether the specified field can be annotated by the user.
 *
 * @param path Path to field
 */
export const useCanAnnotateField = (path: string): boolean => {
  const { showAnnotationTab: canAnnotate } = useCanAnnotate();
  const { validFields } = useValidAnnotationFields();
  const isFieldReadOnly = useIsFieldReadOnly();

  return (
    canAnnotate &&
    validFields.includes(path) &&
    !isFieldReadOnly(path) &&
    !isSystemReadOnlyField(path)
  );
};
