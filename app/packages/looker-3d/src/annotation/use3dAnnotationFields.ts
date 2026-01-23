import {
  activeLabelSchemas,
  fieldTypes,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/state";
import { useAtomValue } from "jotai";
import { useMemo, useRef } from "react";

type FieldPredicate = (fieldType: string) => boolean;

/**
 * Hook that returns 3D annotation fields filtered by a predicate.
 *
 * @param predicate - A function that receives a lowercase field type string
 *   and returns true if the field should be included
 * @returns Array of field names that pass the predicate
 */
export const use3dAnnotationFields = (predicate: FieldPredicate): string[] => {
  const activeSchema = useAtomValue(activeLabelSchemas);
  const fieldTypesVal = useAtomValue(fieldTypes);

  const predicateRef = useRef(predicate);
  predicateRef.current = predicate;

  const fields = useMemo(
    () =>
      (activeSchema ?? []).filter((field) => {
        if (typeof predicateRef.current !== "function") {
          return false;
        }

        const fieldType = fieldTypesVal[field]?.toLocaleLowerCase();
        return predicateRef.current(fieldType);
      }),
    [activeSchema, fieldTypesVal]
  );

  return fields;
};
