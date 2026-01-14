/**
 * Hook for managing label schema editing for a field
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import { useAtom, useAtomValue } from "jotai";
import { isEqual } from "lodash";
import { useMemo, useState } from "react";
import { labelSchemaData } from "../../state";
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

const useDiscard = (field: string) => {
  const [currentSchema, setCurrent] = useCurrentLabelSchema(field);
  const defaultLabelSchema = useDefaultLabelSchema(field);
  const [saved] = useSavedLabelSchema(field);

  return {
    currentLabelSchema: currentSchema,
    defaultLabelSchema,
    discard: () => {
      setCurrent(saved ?? defaultLabelSchema);
    },
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

const useReadOnly = (field: string) => {
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
  const update = useOperatorExecutor("update_label_schema");
  const [current] = useCurrentLabelSchema(field);

  return {
    isSaving,
    save: () => {
      setIsSaving(true);
      update.execute(
        { field, label_schema: current },
        {
          callback: () => {
            setSaved(current);
            setIsSaving(false);
          },
        }
      );
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
  const validate = useOperatorExecutor("validate_label_schemas");

  return {
    errors,
    isValid,
    isValidating,
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
              } else {
                setIsValid(false);
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
        return;
      }
    },
  };
};

// =============================================================================
// Main Hook
// =============================================================================

export default function useLabelSchema(field: string) {
  const discard = useDiscard(field);
  const readOnly = useReadOnly(field);
  const configUpdate = useConfigUpdate(field);
  const scan = useScan(field);
  const save = useSave(field);
  const validate = useValidate(field);
  const hasChanges = useHasChanges(
    discard.currentLabelSchema,
    save.savedLabelSchema
  );

  return {
    hasChanges,

    ...discard,
    ...readOnly,
    ...configUpdate,
    ...save,
    ...scan,
    ...validate,
  };
}
