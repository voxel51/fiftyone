/**
 * Hook for managing label schema editing for a field
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isEqual } from "lodash";
import { useCallback, useMemo, useState } from "react";
import { currentField, labelSchemaData } from "../../state";
import { currentLabelSchema } from "../state";

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

const useSave = (field: string) => {
  const [isSaving, setIsSaving] = useState(false);
  const [savedLabelSchema, setSaved] = useSavedLabelSchema(field);
  const defaultLabelSchema = useDefaultLabelSchema(field);
  const update = useOperatorExecutor("update_label_schema");
  const [current] = useCurrentLabelSchema(field);
  const setCurrentField = useSetAtom(currentField);

  return {
    isSaving,
    save: () => {
      setIsSaving(true);

      const params: Record<string, unknown> = { field, label_schema: current };

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

  return {
    isScanning,
    scan: () => {
      setIsScanning(true);
      generate.execute(
        { field },
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
  const save = useSave(field);
  const validate = useValidate(field);
  const hasChanges = useHasChanges(
    validate.currentLabelSchema,
    save.savedLabelSchema
  );

  return {
    hasChanges: hasChanges || !!validate.errors.length,

    ...readOnly,
    ...configUpdate,
    ...save,
    ...scan,
    ...validate,
  };
}
