/**
 * Custom hooks for SchemaManager
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import { useNotification } from "@fiftyone/state";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isEqual } from "lodash";
import { useCallback, useMemo, useState } from "react";
import {
  addToActiveSchemas,
  labelSchemasData,
  removeFromActiveSchemas,
  showModal,
} from "../state";
import {
  draftJsonContent,
  jsonValidationErrors,
  selectedActiveFields,
  selectedHiddenFields,
} from "./state";

// =============================================================================
// Field Activation/Deactivation Hooks
// =============================================================================

/**
 * Hook to activate (move to visible) selected hidden fields
 */
export const useActivateFields = () => {
  const addToActiveSchema = useSetAtom(addToActiveSchemas);
  const [selected, setSelected] = useAtom(selectedHiddenFields);
  const activateFields = useOperatorExecutor("activate_label_schemas");
  const setMessage = useNotification();

  return useCallback(() => {
    addToActiveSchema(selected);
    activateFields.execute({ fields: Array.from(selected) });
    setSelected(new Set());
    setMessage({
      msg: `${selected.size} schema${
        selected.size > 1 ? "s" : ""
      } moved to active fields`,
      variant: "success",
    });
  }, [activateFields, addToActiveSchema, selected, setSelected, setMessage]);
};

/**
 * Hook to deactivate (move to hidden) selected active fields
 */
export const useDeactivateFields = () => {
  const removeFromActiveSchema = useSetAtom(removeFromActiveSchemas);
  const [selected, setSelected] = useAtom(selectedActiveFields);
  const deactivateFields = useOperatorExecutor("deactivate_label_schemas");
  const setMessage = useNotification();

  return useCallback(() => {
    removeFromActiveSchema(selected);
    deactivateFields.execute({ fields: Array.from(selected) });
    setSelected(new Set());
    setMessage({
      msg: `${selected.size} schema${
        selected.size > 1 ? "s" : ""
      } moved to hidden fields`,
      variant: "success",
    });
  }, [
    deactivateFields,
    removeFromActiveSchema,
    selected,
    setSelected,
    setMessage,
  ]);
};

// =============================================================================
// Full Schema Editor Hook
// =============================================================================

/**
 * Hook for managing the full schema JSON editor
 */
export const useFullSchemaEditor = () => {
  const schemasData = useAtomValue(labelSchemasData);
  const [draftJson, setDraftJson] = useAtom(draftJsonContent);
  const [errors, setErrors] = useAtom(jsonValidationErrors);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const setShowModal = useSetAtom(showModal);
  const setMessage = useNotification();

  const validate = useOperatorExecutor("validate_label_schemas");
  const updateSchema = useOperatorExecutor("update_label_schema");

  const originalJson = useMemo(
    () => JSON.stringify(schemasData, null, 2),
    [schemasData]
  );

  const currentJson = draftJson ?? originalJson;

  const hasChanges = useMemo(() => {
    if (draftJson === null) return false;
    try {
      const original = JSON.parse(originalJson);
      const current = JSON.parse(draftJson);
      return !isEqual(original, current);
    } catch {
      return true;
    }
  }, [draftJson, originalJson]);

  const onChange = useCallback(
    (value: string) => {
      setDraftJson(value);

      try {
        setIsValidating(true);
        const parsed = JSON.parse(value);

        // Extract labelSchema from each field for validation
        const labelSchemas: Record<string, unknown> = {};
        for (const [field, data] of Object.entries(parsed)) {
          if (data && typeof data === "object" && "labelSchema" in data) {
            labelSchemas[field] = (
              data as { labelSchema: unknown }
            ).labelSchema;
          }
        }

        validate.execute(
          { label_schemas: labelSchemas },
          {
            skipErrorNotification: true,
            callback: (result) => {
              setErrors(result.result?.errors ?? []);
              setIsValidating(false);
            },
          }
        );
      } catch (e) {
        if (e instanceof SyntaxError) {
          setErrors([e.message]);
        }
        setIsValidating(false);
      }
    },
    [setDraftJson, validate, setErrors]
  );

  const save = useCallback(async () => {
    if (!draftJson) return;
    if (errors.length > 0) {
      setMessage({
        msg: "Cannot save: fix validation errors first",
        variant: "error",
      });
      return;
    }

    try {
      setIsSaving(true);
      const parsed = JSON.parse(draftJson);

      // Update each field's labelSchema
      const updates: Promise<void>[] = [];
      for (const [field, data] of Object.entries(parsed)) {
        if (data && typeof data === "object" && "labelSchema" in data) {
          const labelSchema = (data as { labelSchema: unknown }).labelSchema;
          updates.push(
            new Promise((resolve) => {
              updateSchema.execute(
                { field, label_schema: labelSchema },
                { callback: () => resolve() }
              );
            })
          );
        }
      }

      await Promise.all(updates);

      setDraftJson(null);
      setErrors([]);
      setIsSaving(false);
      setMessage({
        msg: "Schema changes saved",
        variant: "success",
      });
      setShowModal(false);
    } catch (e) {
      setIsSaving(false);
      setMessage({
        msg: "Failed to save schema changes",
        variant: "error",
      });
    }
  }, [
    draftJson,
    errors,
    updateSchema,
    setDraftJson,
    setErrors,
    setMessage,
    setShowModal,
  ]);

  const discard = useCallback(() => {
    setDraftJson(null);
    setErrors([]);
  }, [setDraftJson, setErrors]);

  return {
    currentJson,
    errors,
    hasChanges,
    isValidating,
    isSaving,
    onChange,
    save,
    discard,
  };
};
