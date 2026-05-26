import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
  currentType,
  defaultField,
  disabledFields,
  fieldsOfType,
} from "./selectors";
import type { AnnotationFields, LabelType } from "./types";

/**
 * Schema-field slice for a {@link LabelType}. `undefined` (or no arg) binds
 * to the current selection's type; `null` opts out (returns empty).
 */
export const useAnnotationFields = (
  type?: LabelType | null
): AnnotationFields => {
  const selected = useAtomValue(currentType);
  const resolvedType: LabelType | null =
    type === undefined ? selected : type;

  const fields = useAtomValue(fieldsOfType(resolvedType));
  const defaultFieldValue = useAtomValue(defaultField(resolvedType));
  const disabled = useAtomValue(disabledFields(resolvedType));

  return useMemo<AnnotationFields>(
    () => ({
      fields,
      defaultField: defaultFieldValue,
      disabledFields: disabled,
    }),
    [fields, defaultFieldValue, disabled]
  );
};
