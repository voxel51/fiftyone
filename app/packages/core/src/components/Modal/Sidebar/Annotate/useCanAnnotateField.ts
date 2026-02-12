import useCanAnnotate from "./useCanAnnotate";
import { useValidAnnotationFields } from "./useValidAnnotationFields";
import { useIsFieldReadOnly } from "./SchemaManager/hooks";
import { isSystemReadOnlyField } from "./SchemaManager/constants";

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
