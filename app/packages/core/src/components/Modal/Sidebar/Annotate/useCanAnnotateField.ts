import useCanAnnotate from "./useCanAnnotate";
import { useValidAnnotationFields } from "./useValidAnnotationFields";

/**
 * Hook which returns whether the specified field can be annotated by the user.
 *
 * @param path Path to field
 */
export const useCanAnnotateField = (path: string): boolean => {
  const { showAnnotationTab } = useCanAnnotate();
  const { validFields } = useValidAnnotationFields();

  return showAnnotationTab && validFields.includes(path);
};
