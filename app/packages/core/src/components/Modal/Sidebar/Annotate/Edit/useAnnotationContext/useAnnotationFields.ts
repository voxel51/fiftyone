import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { type LabelType } from "./atoms";
import {
  currentType,
  defaultField,
  disabledFields,
  fieldsOfType,
} from "./selectors";

export interface AnnotationFields {
  fields: string[];
  defaultField: string | null;
  /** Single-cardinality fields that already have a label — can't create more. */
  disabledFields: Set<string>;
}

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
