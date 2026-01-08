import { useOperatorExecutor } from "@fiftyone/operators";
import { toCamelCase, toSnakeCase } from "@fiftyone/utilities";
import { atom, useAtom, useAtomValue } from "jotai";
import { atomFamily } from "jotai/utils";
import { isEqual } from "lodash";
import { useMemo, useState } from "react";
import { labelSchemaData } from "../../state";

const currentLabelSchema = atomFamily((_field: string) => atom());

const useCurrentLabelSchema = (field: string) => {
  const [current, setCurrent] = useAtom(currentLabelSchema(field));
  const defaultSchema = useDefaultLabelSchema(field);
  const [saved] = useSavedLabelSchema(field);

  return [current ?? saved ?? defaultSchema, setCurrent];
};

const useDefaultLabelSchema = (field: string) => {
  const data = useAtomValue(labelSchemaData(field));
  return data.defaultLabelSchema;
};

const useDiscard = (field: string) => {
  const [currentLabelSchema, setCurrent] = useCurrentLabelSchema(field);
  const defaultLabelSchema = useDefaultLabelSchema(field);
  const [saved] = useSavedLabelSchema(field);

  return {
    currentLabelSchema,
    defaultLabelSchema,
    discard: () => {
      setCurrent(saved ?? defaultLabelSchema);
    },
  };
};

const useHasChanges = (one, two) => {
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
    isReadOnly: current?.readOnly,
    isReadOnlyRequired: data?.readOnly,
    toggleReadOnly: () => {
      setCurrent({ ...current, readOnly: !current?.readOnly });
    },
  };
};

const useConfigUpdate = (field: string) => {
  const [current, setCurrent] = useCurrentLabelSchema(field);
  return {
    updateClassOrder: (newOrder: string[]) => {
      setCurrent({ ...current, classes: newOrder });
    },
    updateConfig: (newConfig: object) => {
      setCurrent(newConfig);
    },
  };
};

const useSavedLabelSchema = (field: string) => {
  const [data, setAtom] = useAtom(labelSchemaData(field));
  return [
    data.labelSchema,
    (labelSchema) => {
      setAtom({ ...data, labelSchema });
    },
  ];
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
      // Convert camelCase to snake_case for Python operator
      update.execute(
        { field, label_schema: toSnakeCase(current) },
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
  const [_, setCurrent] = useCurrentLabelSchema(field);
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
              // Convert snake_case from Python to camelCase
              setCurrent(toCamelCase(result.result.label_schema));
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
  const [_, setCurrent] = useCurrentLabelSchema(field);
  const validate = useOperatorExecutor("validate_label_schemas");

  return {
    errors,
    isValid,
    isValidating,
    validate: (data: string) => {
      try {
        setIsValidating(true);
        const parsed = JSON.parse(data);
        // Convert camelCase to snake_case for Python operator
        validate.execute(
          { label_schemas: { [field]: toSnakeCase(parsed) } },
          {
            skipErrorNotification: true,
            callback: (result) => {
              if (result.result.errors) {
                setErrors(result.result.errors);
              }

              if (!result.result.errors.length) {
                // Store as camelCase in frontend state
                setCurrent(toCamelCase(parsed));
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

export default function (field: string) {
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
