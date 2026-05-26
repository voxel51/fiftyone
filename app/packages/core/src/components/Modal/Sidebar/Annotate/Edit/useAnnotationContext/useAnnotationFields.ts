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
  /** Visible, non-read-only fields of the resolved type. */
  fields: string[];
  /** First non-disabled visible field, or null if none. */
  defaultField: string | null;
  /**
   * Fields whose label container is a single-cardinality type (e.g. one
   * `Detection`, not `Detections`) that already has a label — disabled for
   * new-label creation.
   */
  disabledFields: Set<string>;
}

/**
 * Schema-fields slice for a {@link LabelType}.
 *
 * Pass an explicit type to query that type. Pass nothing (or `undefined`) to
 * bind to the currently-selected label's type — this is the common pattern
 * for components rendering inside the active edit context. Pass `null` to
 * opt out (returns empty values).
 *
 * Decoupled from {@link useAnnotationContext} because schema queries answer
 * "what fields of type X exist?" — a question about the dataset schema, not
 * about the label currently being edited.
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
