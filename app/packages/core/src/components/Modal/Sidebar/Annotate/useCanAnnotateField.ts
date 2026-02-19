import useCanAnnotate from "./useCanAnnotate";
import {
  useActiveFieldsList,
  useFieldSchemaData,
  useHiddenFieldsWithMetadata,
  useIsFieldReadOnly,
} from "./SchemaManager/hooks";
import { isSystemReadOnlyField } from "./SchemaManager/constants";

/**
 * Hook which returns whether the specified field can be annotated by the user.
 *
 * @param path Path to field
 */
export const useCanAnnotateField = (path: string): boolean => {
  const { showAnnotationTab: canAnnotate } = useCanAnnotate();
  const { fields: activeFields } = useActiveFieldsList();
  const { fields: hiddenFields } = useHiddenFieldsWithMetadata();
  const isFieldReadOnly = useIsFieldReadOnly();
  const isFieldUnsupported = useFieldSchemaData(path)?.unsupported;

  const validFields = [...activeFields, ...hiddenFields];

  return (
    canAnnotate &&
    validFields.includes(path) &&
    !isFieldUnsupported &&
    !isFieldReadOnly(path) &&
    !isSystemReadOnlyField(path)
  );
};
