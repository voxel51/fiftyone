/**
 * Custom hooks for SchemaManager
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import {
  datasetSampleCount,
  mediaType,
  queryPerformanceMaxSearch,
  useNotification,
} from "@fiftyone/state";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useRecoilValue } from "recoil";
import { isEqual } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activeLabelSchemas,
  activePaths,
  activeSchemaTab,
  addToActiveSchemas,
  currentField,
  fieldAttributeCount,
  fieldType,
  fieldTypes,
  labelSchemaData,
  labelSchemasData,
  removeFromActiveSchemas,
  showModal,
} from "../state";
import {
  draftJsonContent,
  fieldHasSchema,
  fieldIsReadOnly,
  hiddenFieldAttrCounts,
  hiddenFieldHasSchemaStates,
  hiddenFieldTypes,
  isNewFieldMode,
  jsonValidationErrors,
  pendingActiveSchemas,
  selectedActiveFields,
  selectedHiddenFields,
  sortedInactivePaths,
} from "./state";
import { PRIMITIVE_FIELD_TYPES } from "./constants";

// =============================================================================
// Current Field Hooks
// =============================================================================

/**
 * Hook to get and set the currently selected field for editing
 */
export const useCurrentField = () => {
  const [field, setField] = useAtom(currentField);
  return { field, setField };
};

/**
 * Hook to get the current field (read-only)
 */
export const useCurrentFieldValue = () => {
  return useAtomValue(currentField);
};

/**
 * Hook to set the current field
 */
export const useSetCurrentField = () => {
  return useSetAtom(currentField);
};

// =============================================================================
// Schema Manager Modal Hooks
// =============================================================================

/**
 * Hook to control the schema manager modal visibility
 */
export const useSchemaManagerModal = () => {
  const [isOpen, setIsOpen] = useAtom(showModal);
  const open = useCallback(() => setIsOpen(true), [setIsOpen]);
  const close = useCallback(() => setIsOpen(false), [setIsOpen]);
  return { isOpen, setIsOpen, open, close };
};

/**
 * Hook to show the schema manager modal
 */
export const useShowSchemaManagerModal = () => {
  return useSetAtom(showModal);
};

// =============================================================================
// Schema Editor GUI/JSON Toggle Hooks
// =============================================================================

/**
 * Hook to get and set the schema editor mode (gui/json toggle)
 */
export const useSchemaEditorGUIJSONToggle = () => {
  const [tab, setTab] = useAtom(activeSchemaTab);
  return { tab, setTab };
};

/**
 * Hook to set the schema editor mode
 */
export const useSetSchemaEditorGUIJSONToggle = () => {
  return useSetAtom(activeSchemaTab);
};

// =============================================================================
// Field Selection Hooks
// =============================================================================

/**
 * Hook to get selected field counts for both active and hidden sections
 */
export const useSelectedFieldCounts = () => {
  const activeCount = useAtomValue(selectedActiveFields).size;
  const hiddenCount = useAtomValue(selectedHiddenFields).size;
  return { activeCount, hiddenCount };
};

/**
 * Hook to manage selected active fields
 */
export const useSelectedActiveFields = () => {
  const [selected, setSelected] = useAtom(selectedActiveFields);
  const clear = useCallback(() => setSelected(new Set()), [setSelected]);
  return { selected, setSelected, clear };
};

/**
 * Hook to manage selected hidden fields
 */
export const useSelectedHiddenFields = () => {
  const [selected, setSelected] = useAtom(selectedHiddenFields);
  const clear = useCallback(() => setSelected(new Set()), [setSelected]);
  return { selected, setSelected, clear };
};

// =============================================================================
// Hidden Fields Hooks
// =============================================================================

/**
 * Hook to get all hidden fields with their metadata (types, attr counts, schema states)
 */
export const useHiddenFieldsWithMetadata = () => {
  const fields = useAtomValue(sortedInactivePaths);
  const types = useAtomValue(hiddenFieldTypes);
  const attrCounts = useAtomValue(hiddenFieldAttrCounts);
  const hasSchemaStates = useAtomValue(hiddenFieldHasSchemaStates);

  return {
    fields,
    types,
    attrCounts,
    hasSchemaStates,
  };
};

// =============================================================================
// Active Fields Hooks
// =============================================================================

/**
 * Hook to get and manage active fields list
 */
export const useActiveFieldsList = () => {
  const [fieldsFromNew, setFieldsNew] = useAtom(activePaths);
  const [fieldsFromLegacy, setFieldsLegacy] = useAtom(activeLabelSchemas);

  // Use new system fields if available, fall back to legacy
  const fields = fieldsFromNew?.length ? fieldsFromNew : fieldsFromLegacy ?? [];

  // Set both atom systems to keep them in sync
  const setFields = useCallback(
    (newFields: string[]) => {
      setFieldsNew(newFields);
      setFieldsLegacy(newFields);
    },
    [setFieldsNew, setFieldsLegacy]
  );

  return { fields, setFields };
};

/**
 * Hook to get active fields metadata (types, read-only states, attr counts)
 */
export const useActiveFieldsMetadata = () => {
  const types = useAtomValue(fieldTypes);
  return { types };
};

/**
 * Hook to check if a field is in active schemas
 */
export const useIsFieldActive = (field: string) => {
  const activeFields = useAtomValue(activeLabelSchemas);
  return activeFields?.includes(field) ?? false;
};

// =============================================================================
// Field Data Hooks
// =============================================================================

/**
 * Hook to get a field's type
 */
export const useFieldType = (field: string) => {
  return useAtomValue(fieldType(field));
};

/**
 * Hook which returns a callback to dynamically get the field type for a path.
 *
 * @example
 * ```tsx
 * const useFoo = () => {
 *   const getFieldType = useGetFieldType();
 *   const fieldType = getFieldType(field);
 * }
 * ```
 */
export const useGetFieldType = () =>
  useAtomCallback(
    useCallback((get, _set, field: string) => get(fieldType(field)), [])
  );

/**
 * Hook which returns a callback to check whether a field is a primitive type.
 *
 * @example
 * ```tsx
 * const useFoo = () => {
 *   const isPrimitiveField = useIsPrimitiveField();
 *   if (isPrimitiveField(field)) {
 *     bar();
 *   }
 * };
 * ```
 */
export const useIsPrimitiveField = () => {
  const getFieldType = useGetFieldType();

  return useCallback(
    (field: string) => PRIMITIVE_FIELD_TYPES.has(getFieldType(field)),
    [getFieldType]
  );
};

/**
 * Hook to get a field's schema data
 */
export const useFieldSchemaData = (field: string) => {
  return useAtomValue(labelSchemaData(field));
};

/**
 * Hook to check if a field is read-only
 */
export const useFieldIsReadOnly = (field: string) => {
  return useAtomValue(fieldIsReadOnly(field));
};

/**
 * Hook which returns a callback to check whether a field is read-only.
 *
 * @example
 * ```tsx
 * const useFoo = () => {
 *   const isFieldReadOnly = useIsFieldReadOnly();
 *   if (isFieldReadOnly(field)) {
 *     bar();
 *   }
 * };
 * ```
 */
export const useIsFieldReadOnly = () =>
  useAtomCallback(
    useCallback((get, _set, field: string) => get(fieldIsReadOnly(field)), [])
  );

/**
 * Hook to check if a field has schema configured
 */
export const useFieldHasSchema = (field: string) => {
  return useAtomValue(fieldHasSchema(field));
};

/**
 * Hook to get a field's attribute count
 */
export const useFieldAttributeCount = (field: string) => {
  return useAtomValue(fieldAttributeCount(field));
};

// =============================================================================
// All Schemas Data Hooks
// =============================================================================

/**
 * Hook to get all label schemas data
 */
export const useLabelSchemasData = () => {
  return useAtomValue(labelSchemasData);
};

/**
 * Hook to set label schemas data
 */
export const useSetLabelSchemasData = () => {
  return useSetAtom(labelSchemasData);
};

/**
 * Hook to set active label schemas
 */
export const useSetActiveLabelSchemas = () => {
  return useSetAtom(activeLabelSchemas);
};

// =============================================================================
// Field Visibility Toggle Hook
// =============================================================================

/**
 * Hook to toggle a single field's visibility (active/hidden)
 */
export const useToggleFieldVisibility = (field: string) => {
  const addToActive = useSetAtom(addToActiveSchemas);
  const removeFromActive = useSetAtom(removeFromActiveSchemas);
  const activeFields = useAtomValue(activeLabelSchemas);
  const activateOperator = useOperatorExecutor("activate_label_schemas");
  const deactivateOperator = useOperatorExecutor("deactivate_label_schemas");

  const isActive = activeFields?.includes(field) ?? false;

  const toggle = useCallback(() => {
    const fieldSet = new Set([field]);
    if (isActive) {
      removeFromActive(fieldSet);
      deactivateOperator.execute(
        { fields: [field] },
        {
          callback: (result) => {
            if (result.error) {
              addToActive(fieldSet); // rollback on failure
            }
          },
        }
      );
    } else {
      addToActive(fieldSet);
      activateOperator.execute(
        { fields: [field] },
        {
          callback: (result) => {
            if (result.error) {
              removeFromActive(fieldSet); // rollback on failure
            }
          },
        }
      );
    }
  }, [
    field,
    isActive,
    addToActive,
    removeFromActive,
    activateOperator,
    deactivateOperator,
  ]);

  return { isActive, toggle };
};

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

  // Reset JSON editor state on unmount
  useEffect(() => {
    return () => {
      setDraftJson(null);
      setErrors([]);
    };
  }, []);

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

        // Validate parsed is an object (not null, array, etc.)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setErrors(["Invalid JSON: expected an object"]);
          setIsValidating(false);
          return;
        }

        // Extract label_schema from each field for validation
        const labelSchemas: Record<string, unknown> = {};
        for (const [field, data] of Object.entries(parsed)) {
          if (data && typeof data === "object" && "label_schema" in data) {
            labelSchemas[field] = (
              data as {
                label_schema: unknown;
              }
            ).label_schema;
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

      // Update each field's label_schema
      const updates: Promise<void>[] = [];
      for (const [field, data] of Object.entries(parsed)) {
        if (data && typeof data === "object" && "label_schema" in data) {
          const labelSchema = (data as { label_schema: unknown }).label_schema;
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

// =============================================================================
// New Field Mode Hooks
// =============================================================================

/**
 * Hook to read and set new field mode state
 */
export const useNewFieldMode = () => {
  const [isNewField, setIsNewField] = useAtom(isNewFieldMode);
  return { isNewField, setIsNewField };
};

/**
 * Hook to exit new field mode (convenience hook)
 */
export const useExitNewFieldMode = () => {
  const setNewFieldMode = useSetAtom(isNewFieldMode);
  return useCallback(() => setNewFieldMode(false), [setNewFieldMode]);
};

// =============================================================================
// Media Type Hook
// =============================================================================

/**
 * Hook to get the current dataset media type
 */
export const useMediaType = () => {
  return useRecoilValue(mediaType);
};

/**
 * Hook to check if the dataset sample count exceeds the scan limit.
 * Returns whether the dataset is large and the scan sample limit.
 */
export const useIsLargeDataset = () => {
  const count = useRecoilValue(datasetSampleCount);
  const maxSearch = useRecoilValue(queryPerformanceMaxSearch);
  return { isLargeDataset: (count ?? 0) > maxSearch, scanLimit: maxSearch };
};

// =============================================================================
// Cleanup Hook
// =============================================================================

/**
 * Hook to reset SchemaManager state on unmount.
 * Call this from the Modal component to clean up state when the modal closes.
 */
export const useSchemaManagerCleanup = () => {
  const setCurrentFieldAtom = useSetAtom(currentField);
  const setPendingActiveSchemas = useSetAtom(pendingActiveSchemas);

  useEffect(() => {
    return () => {
      // Reset field editing state
      setCurrentFieldAtom(null);
      // Reset pending visibility state
      setPendingActiveSchemas(null);
    };
  }, []);
};

/**
 * Hook to reset field selection state on unmount.
 * Call this from GUIContent to clear selection when switching to JSON tab.
 */
export const useSelectionCleanup = () => {
  const setSelectedActive = useSetAtom(selectedActiveFields);
  const setSelectedHidden = useSetAtom(selectedHiddenFields);

  useEffect(() => {
    return () => {
      setSelectedActive(new Set());
      setSelectedHidden(new Set());
    };
  }, []);
};
