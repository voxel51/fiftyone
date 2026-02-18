/**
 * Hook for managing label schema editing for a field
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import {
  useNotification,
  useQueryPerformanceSampleLimit,
} from "@fiftyone/state";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isEqual } from "lodash";
import { useCallback, useMemo, useState } from "react";
import {
  activeLabelSchemas,
  addToActiveSchemas,
  currentField,
  labelSchemaData,
  removeFromActiveSchemas,
} from "../../state";
import { currentLabelSchema, pendingActiveSchemas } from "../state";
import { reconcileComponent } from "../utils";

// =============================================================================
// Internal Hooks
// =============================================================================

const useCurrentLabelSchema = (field: string) => {
  const [current, setCurrent] = useAtom(currentLabelSchema(field));
  const defaultSchema = useDefaultLabelSchema(field);
  const [saved] = useSavedLabelSchema(field);

  return [current ?? saved ?? defaultSchema, setCurrent] as const;
};

const useDefaultLabelSchema = (field: string) => {
  const data = useAtomValue(labelSchemaData(field));
  return data?.default_label_schema;
};

const useDiscard = (field: string, reset: () => void) => {
  const [inc, setInc] = useState(0);
  const [currentSchema, setCurrent] = useCurrentLabelSchema(field);
  const defaultLabelSchema = useDefaultLabelSchema(field);
  const [saved] = useSavedLabelSchema(field);

  return {
    currentLabelSchema: currentSchema,
    defaultLabelSchema,
    discard: () => {
      setInc(inc + 1);
      setCurrent(saved ?? defaultLabelSchema);
      reset();
    },
    editorKey: inc.toString(),
  };
};

const useHasChanges = (one: unknown, two: unknown) => {
  return useMemo(() => {
    try {
      return !isEqual(one, two);
    } catch {
      return true;
    }
  }, [one, two]);
};

const sameSet = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((f) => setB.has(f));
};

/**
 * Manages pending visibility for a field. The toggle updates
 * pendingActiveSchemas (lazily initialized from activeLabelSchemas).
 * Changes are only persisted on save via set_active_label_schemas.
 */
const useVisibility = (field: string) => {
  const activeSchemas = useAtomValue(activeLabelSchemas);
  const [pending, setPending] = useAtom(pendingActiveSchemas);

  // Lazily initialize pending from current active schemas
  const effective = pending ?? activeSchemas ?? [];

  const isFieldVisible = effective.includes(field);

  const visibilityChanged = useMemo(
    () => !sameSet(effective, activeSchemas ?? []),
    [effective, activeSchemas]
  );

  const toggleVisibility = useCallback(() => {
    const current = pending ?? activeSchemas ?? [];
    if (current.includes(field)) {
      setPending(current.filter((f) => f !== field));
    } else {
      // Append new field at the end
      setPending([...current, field]);
    }
  }, [field, pending, activeSchemas, setPending]);

  const discardVisibility = useCallback(() => {
    const current = pending ?? activeSchemas ?? [];
    const original = activeSchemas ?? [];
    const wasActive = original.includes(field);
    const isPending = current.includes(field);

    if (wasActive === isPending) return; // no change for this field

    if (wasActive && !isPending) {
      // Was active, user hid it — revert by re-inserting at original position
      const newPending = [...current];
      const originalIndex = original.indexOf(field);
      let insertAt = newPending.length;
      for (let i = originalIndex - 1; i >= 0; i--) {
        const idx = newPending.indexOf(original[i]);
        if (idx >= 0) {
          insertAt = idx + 1;
          break;
        }
      }
      newPending.splice(insertAt, 0, field);
      setPending(newPending);
    } else {
      // Was hidden, user activated it — revert by removing
      setPending(current.filter((f) => f !== field));
    }
  }, [field, pending, activeSchemas, setPending]);

  return {
    isFieldVisible,
    visibilityChanged,
    toggleVisibility,
    discardVisibility,
  };
};

export const useReadOnly = (field: string) => {
  const data = useAtomValue(labelSchemaData(field));
  const [current, setCurrent] = useCurrentLabelSchema(field);
  return {
    isReadOnly: (current as { read_only?: boolean })?.read_only,
    isReadOnlyRequired: data?.read_only,
    toggleReadOnly: () => {
      setCurrent({
        ...(current as object),
        read_only: !(current as { read_only?: boolean })?.read_only,
      });
    },
  };
};

const useConfigUpdate = (field: string) => {
  const [current, setCurrent] = useCurrentLabelSchema(field);
  return {
    updateClassOrder: (newOrder: string[]) => {
      if (!current) return;
      setCurrent({ ...(current as object), classes: newOrder });
    },
    updateConfig: (newConfig: object) => {
      setCurrent(newConfig);
    },
  };
};

const useSavedLabelSchema = (field: string) => {
  const [data, setAtom] = useAtom(labelSchemaData(field));
  return [
    data?.label_schema,
    (labelSchema: unknown) => {
      setAtom({ ...data, label_schema: labelSchema });
    },
  ] as const;
};

const useSave = (field: string, visibilityChanged: boolean) => {
  const [isSaving, setIsSaving] = useState(false);
  const [savedLabelSchema, setSaved] = useSavedLabelSchema(field);
  const update = useOperatorExecutor("update_label_schema");
  const activate = useOperatorExecutor("activate_label_schemas");
  const setActiveSchemas = useOperatorExecutor("set_active_label_schemas");
  const addToActive = useSetAtom(addToActiveSchemas);
  const removeFromActive = useSetAtom(removeFromActiveSchemas);
  const setActiveLabelSchemasAtom = useSetAtom(activeLabelSchemas);
  const [pending, setPending] = useAtom(pendingActiveSchemas);
  const activeSchemas = useAtomValue(activeLabelSchemas);
  const notify = useNotification();
  const [current] = useCurrentLabelSchema(field);
  const setCurrentField = useSetAtom(currentField);

  return {
    isSaving,
    save: () => {
      const isFirstSave = !savedLabelSchema;
      setIsSaving(true);

      const labelSchema = current ? reconcileComponent(current) : current;
      const params: Record<string, unknown> = {
        field,
        label_schema: labelSchema,
      };

      update.execute(params, {
        callback: (result) => {
          // Always reset saving state
          setIsSaving(false);
          document.dispatchEvent(
            new CustomEvent("schema-manager-save-complete")
          );

          // Check for errors in the result
          if (result.error) {
            console.error("Failed to save label schema:", result.error);
            return;
          }

          // Only update state on success
          setSaved(current);

          // Auto-activate the field on first save
          if (isFirstSave) {
            const fieldSet = new Set([field]);
            addToActive(fieldSet);
            activate.execute(
              { fields: [field] },
              {
                callback: (activateResult) => {
                  if (activateResult.error) {
                    removeFromActive(fieldSet);
                    notify({
                      msg: `Failed to activate field: ${
                        activateResult.errorMessage || activateResult.error
                      }`,
                      variant: "error",
                    });
                  }
                },
              }
            );
          }

          // Persist pending visibility changes
          if (visibilityChanged && pending) {
            // Build ordered list: old items first, new appended at end
            const oldSet = new Set(activeSchemas ?? []);
            const kept = (activeSchemas ?? []).filter((f) =>
              pending.includes(f)
            );
            const added = pending.filter((f) => !oldSet.has(f));
            const ordered = [...kept, ...added];

            setActiveSchemas.execute(
              { fields: ordered },
              {
                callback: (setResult) => {
                  if (setResult.error) {
                    notify({
                      msg: `Failed to update field visibility: ${
                        setResult.errorMessage || setResult.error
                      }`,
                      variant: "error",
                    });
                    return;
                  }
                  // Sync Jotai state
                  setActiveLabelSchemasAtom(ordered);
                  setPending(null);
                },
              }
            );
          }

          setCurrentField(null);
        },
      });
    },
    savedLabelSchema,
  };
};

const useScan = (field: string) => {
  const [isScanning, setIsScanning] = useState(false);
  const [, setCurrent] = useCurrentLabelSchema(field);
  const generate = useOperatorExecutor("generate_label_schemas");
  const limit = useQueryPerformanceSampleLimit();
  return {
    isScanning,
    scan: () => {
      setIsScanning(true);
      generate.execute(
        { field, limit },
        {
          callback: (result) => {
            if (result.result) {
              setCurrent(result.result.label_schema);
            }
            setIsScanning(false);
            document.dispatchEvent(
              new CustomEvent("schema-manager-scan-complete")
            );
          },
        }
      );
    },
    cancelScan: () => {
      setIsScanning(false);
    },
  };
};

const useValidate = (field: string) => {
  const [errors, setErrors] = useState<string[]>([]);
  const [isValid, setIsValid] = useState(true);
  const [isValidating, setIsValidating] = useState(false);

  const [, setCurrent] = useCurrentLabelSchema(field);
  const discard = useDiscard(field, () => setErrors([]));
  const validate = useOperatorExecutor("validate_label_schemas");

  const resetErrors = useCallback(() => {
    setErrors([]);
    setIsValid(true);
  }, []);

  return {
    ...discard,
    errors,
    isValid,
    isValidating,
    resetErrors,
    validate: (data: string) => {
      try {
        setIsValidating(true);
        const parsed = JSON.parse(data);
        validate.execute(
          { label_schemas: { [field]: parsed } },
          {
            skipErrorNotification: true,
            callback: (result) => {
              if (result.result.errors) {
                setErrors(result.result.errors);
              }

              if (!result.result.errors.length) {
                setCurrent(parsed);
                setIsValid(true);
                document.dispatchEvent(
                  new CustomEvent("schema-manager-valid-json")
                );
              } else {
                setIsValid(false);
                document.dispatchEvent(
                  new CustomEvent("schema-manager-invalid-json")
                );
              }
              setIsValidating(false);
            },
          }
        );
      } catch (e) {
        if (e instanceof SyntaxError) {
          setErrors([e.message]);
        }

        setIsValidating(false);
        setIsValid(false);
      }
    },
  };
};

// =============================================================================
// Main Hook
// =============================================================================

export default function useLabelSchema(field: string) {
  const readOnly = useReadOnly(field);
  const configUpdate = useConfigUpdate(field);
  const scan = useScan(field);
  const visibility = useVisibility(field);
  const save = useSave(field, visibility.visibilityChanged);
  const validate = useValidate(field);
  const schemaChanged = useHasChanges(
    validate.currentLabelSchema,
    save.savedLabelSchema
  );

  const hasChanges =
    schemaChanged || !!validate.errors.length || visibility.visibilityChanged;

  // Wrap discard to also revert visibility
  const originalDiscard = validate.discard;
  const discard = useCallback(() => {
    originalDiscard();
    visibility.discardVisibility();
  }, [originalDiscard, visibility.discardVisibility]);

  return {
    hasChanges,
    isFieldVisible: visibility.isFieldVisible,
    toggleVisibility: visibility.toggleVisibility,

    ...readOnly,
    ...configUpdate,
    ...save,
    ...scan,
    ...validate,
    discard,
  };
}
