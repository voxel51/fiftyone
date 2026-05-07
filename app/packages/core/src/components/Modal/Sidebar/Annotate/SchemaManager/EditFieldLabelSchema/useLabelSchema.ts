/**
 * Hook for managing label schema editing for a field
 */

import {
  useNotification,
  useQueryPerformanceSampleLimit,
} from "@fiftyone/state";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isEqual } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activeLabelSchemas,
  addToActiveSchemas,
  currentField,
  labelSchemaData,
  removeFromActiveSchemas,
} from "../../state";
import {
  useSchemaManager,
  type FieldSchema,
  type UpdateSchemaRequest,
} from "../../useSchemaManager";
import {
  dispatchSchemaManagerEvent,
  useSchemaManagerEventBus,
} from "../events";
import { currentLabelSchema } from "../state";
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

/**
 * Manages pending visibility for a single field. Uses local state to track
 * whether the user toggled visibility; persisted on save via per-field
 * activate/deactivate operators.
 */
const useVisibility = (field: string) => {
  const activeSchemas = useAtomValue(activeLabelSchemas);
  const [toggled, setToggled] = useState(false);

  const savedVisible = (activeSchemas ?? []).includes(field);
  const isFieldVisible = toggled ? !savedVisible : savedVisible;
  const visibilityChanged = toggled;

  const toggleVisibility = useCallback(() => {
    setToggled((t) => !t);
  }, []);

  const discardVisibility = useCallback(() => {
    setToggled(false);
  }, []);

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

export const useAppliedOntology = (field: string) => {
  const [current, setCurrent] = useCurrentLabelSchema(field);
  const schema = current as FieldSchema | undefined;

  const ontologyAttributes: string[] = Array.isArray(schema?.attributes)
    ? (schema.attributes as { name?: string; _source?: unknown }[]).reduce<
        string[]
      >((acc, a) => {
        if (a && "_source" in a && a._source && a.name) acc.push(a.name);
        return acc;
      }, [])
    : [];

  return {
    appliedOntology: schema?.applied_ontology,
    ontologyAttributes,
    applyOntology: (name: string) => {
      setCurrent({ ...(schema as FieldSchema), applied_ontology: name });
    },
    clearOntology: () => {
      const next: FieldSchema = { ...(schema as FieldSchema) };
      delete next.applied_ontology;
      // Drop ontology-owned attributes (carry the `_source` marker). The
      // backend's dehydrate only strips them while `applied_ontology` is
      // still set, so we'd leave orphaned `when` clauses for the validator
      // to reject if we didn't strip them here.
      if (Array.isArray(next.attributes)) {
        next.attributes = next.attributes.filter(
          (a: unknown) => !(a && typeof a === "object" && "_source" in a)
        );
      }
      setCurrent(next);
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
  const { updateSchema, activateSchemas, deactivateSchemas } =
    useSchemaManager();
  const addToActive = useSetAtom(addToActiveSchemas);
  const removeFromActive = useSetAtom(removeFromActiveSchemas);
  const activeSchemas = useAtomValue(activeLabelSchemas);
  const notify = useNotification();
  const [current] = useCurrentLabelSchema(field);
  const setCurrentField = useSetAtom(currentField);
  const { dispatch } = useSchemaManagerEventBus();

  return {
    isSaving,
    save: async () => {
      const isFirstSave = !savedLabelSchema;
      setIsSaving(true);

      const labelSchema = current ? reconcileComponent(current) : current;

      try {
        await updateSchema({
          field,
          label_schema: labelSchema,
        } as UpdateSchemaRequest);
      } catch (error) {
        console.error("Failed to save label schema:", error);
        setIsSaving(false);
        dispatchSchemaManagerEvent(dispatch, "schema-manager:save-complete");
        return;
      }

      setSaved(current);
      setIsSaving(false);
      dispatchSchemaManagerEvent(dispatch, "schema-manager:save-complete");

      // Determine activation change: first save auto-activates,
      // otherwise apply the visibility toggle for this field
      const fieldSet = new Set([field]);
      const wasActive = (activeSchemas ?? []).includes(field);
      const shouldActivate = isFirstSave || (visibilityChanged && !wasActive);
      const shouldDeactivate = !isFirstSave && visibilityChanged && wasActive;

      if (shouldActivate) {
        addToActive(fieldSet);
        activateSchemas({ fields: [field] }).catch((error) => {
          removeFromActive(fieldSet);
          notify({
            msg: `Failed to activate field: ${error}`,
            variant: "error",
          });
        });
      } else if (shouldDeactivate) {
        removeFromActive(fieldSet);
        deactivateSchemas({ fields: [field] }).catch((error) => {
          addToActive(fieldSet);
          notify({
            msg: `Failed to deactivate field: ${error}`,
            variant: "error",
          });
        });
      }

      setCurrentField(null);
    },
    savedLabelSchema,
  };
};

const useScan = (field: string) => {
  const [isScanning, setIsScanning] = useState(false);
  const [, setCurrent] = useCurrentLabelSchema(field);
  const { createSchemas } = useSchemaManager();
  const limit = useQueryPerformanceSampleLimit();
  const { dispatch } = useSchemaManagerEventBus();
  return {
    isScanning,
    scan: async () => {
      setIsScanning(true);
      try {
        const result = await createSchemas({ field, limit });
        if (result.label_schema) {
          setCurrent(result.label_schema);
        }
      } finally {
        setIsScanning(false);
        dispatchSchemaManagerEvent(dispatch, "schema-manager:scan-complete");
      }
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
  const { validateSchemas } = useSchemaManager();
  const { dispatch } = useSchemaManagerEventBus();

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
    validate: async (data: string) => {
      try {
        setIsValidating(true);
        const parsed = JSON.parse(data);
        const result = await validateSchemas({
          label_schemas: { [field]: parsed },
        });

        if (result.errors) {
          setErrors(result.errors);
        }

        if (!result.errors?.length) {
          setCurrent(parsed);
          setIsValid(true);
          dispatchSchemaManagerEvent(dispatch, "schema-manager:valid-json");
        } else {
          setIsValid(false);
          dispatchSchemaManagerEvent(dispatch, "schema-manager:invalid-json");
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          setErrors([e.message]);
        }
        setIsValid(false);
      } finally {
        setIsValidating(false);
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

  // Discard unsaved schema edits when navigating away (back button unmounts
  // this view). Visibility is local state so it resets automatically on unmount.
  // After a successful save, savedLabelSchema is already updated before unmount,
  // so re-opening the field will show the saved state correctly.
  useEffect(() => {
    return () => {
      currentLabelSchema.remove(field);
    };
  }, [field]);

  // Wrap discard to also revert visibility
  const originalDiscard = validate.discard;
  const discard = useCallback(() => {
    originalDiscard();
    visibility.discardVisibility();
  }, [originalDiscard, visibility.discardVisibility]);

  // The currentLabelSchema atom is typed as `object | undefined` because it
  // is fed into both <GUIContent> (which wants the looser SchemaConfigType)
  // and <JSONEditor> (which wants JSONValue). We narrow it here once so
  // consumers can read `labelSchema.appliedOntology` without casting.
  const appliedOntology = (
    validate.currentLabelSchema as FieldSchema | undefined
  )?.applied_ontology;

  return {
    hasChanges,
    isFieldVisible: visibility.isFieldVisible,
    toggleVisibility: visibility.toggleVisibility,

    ...readOnly,
    ...configUpdate,
    ...save,
    ...scan,
    ...validate,
    appliedOntology,
    discard,
  };
}
