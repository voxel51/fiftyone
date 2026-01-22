/**
 * Hook for attribute form logic.
 * Separates business logic from rendering.
 */

import { IconName } from "@voxel51/voodo";
import { useCallback, useMemo } from "react";
import {
  COMPONENT_OPTIONS,
  LIST_TYPES,
  NO_DEFAULT_TYPES,
  NUMERIC_TYPES,
  RADIO_MAX_VALUES,
  getDefaultComponent,
} from "../../constants";
import { type AttributeFormData } from "../../utils";

interface UseAttributeFormProps {
  formState: AttributeFormData;
  onFormStateChange: (state: AttributeFormData) => void;
}

interface UseAttributeFormResult {
  // Derived state
  isNumericType: boolean;
  isIntegerType: boolean;
  isListType: boolean;
  supportsDefault: boolean;
  componentOptions: Array<{ id: string; label: string; icon: IconName }>;

  // Visibility flags
  showValues: boolean;
  showRange: boolean;
  valuesRequired: boolean;

  // Validation
  defaultError: string | null;

  // Handlers
  handleNameChange: (name: string) => void;
  handleTypeChange: (type: string) => void;
  handleComponentChange: (component: string) => void;
  handleValuesChange: (values: string[]) => void;
  handleRangeChange: (range: { min: string; max: string } | null) => void;
  handleDefaultChange: (defaultValue: string) => void;
  handleReadOnlyChange: (readOnly: boolean) => void;
}

export default function useAttributeForm({
  formState,
  onFormStateChange,
}: UseAttributeFormProps): UseAttributeFormResult {
  // Derived state
  const isNumericType = NUMERIC_TYPES.includes(formState.type);
  const isIntegerType =
    formState.type === "int" || formState.type === "list<int>";
  const isListType = LIST_TYPES.includes(formState.type);
  const supportsDefault = !NO_DEFAULT_TYPES.includes(formState.type);
  const componentOptions = COMPONENT_OPTIONS[formState.type] || [];

  // Visibility flags
  const showValuesForNumeric =
    isNumericType &&
    (formState.component === "radio" || formState.component === "dropdown");

  const showValuesForStr =
    formState.type === "str" &&
    (formState.component === "radio" || formState.component === "dropdown");

  const showValuesForList =
    isListType &&
    (formState.component === "checkboxes" ||
      formState.component === "dropdown");

  const showValues =
    showValuesForNumeric || showValuesForStr || showValuesForList;

  const showRange =
    (formState.type === "int" || formState.type === "float") &&
    formState.component === "slider";

  const valuesRequired =
    formState.component === "radio" ||
    formState.component === "dropdown" ||
    formState.component === "checkboxes";

  // Validation
  const defaultError = useMemo((): string | null => {
    if (!formState.default) return null;

    // Validate against range (for slider)
    if (showRange && formState.range) {
      const { min, max } = formState.range;
      if (min !== "" && max !== "") {
        const minNum = parseFloat(min);
        const maxNum = parseFloat(max);
        const defaultNum = parseFloat(formState.default);
        if (!isNaN(defaultNum) && minNum < maxNum) {
          if (defaultNum < minNum || defaultNum > maxNum) {
            return `Default must be between ${min} and ${max}`;
          }
        }
      }
    }

    // Validate against values (for radio/dropdown/checkboxes)
    if (showValues && formState.values.length > 0) {
      if (!formState.values.includes(formState.default)) {
        return "Default must be within provided values";
      }
    }

    return null;
  }, [
    formState.default,
    formState.range,
    formState.values,
    showRange,
    showValues,
  ]);

  // Handlers
  const handleNameChange = useCallback(
    (name: string) => {
      onFormStateChange({ ...formState, name });
    },
    [formState, onFormStateChange]
  );

  const handleTypeChange = useCallback(
    (newType: string) => {
      const newSupportsDefault = !NO_DEFAULT_TYPES.includes(newType);
      onFormStateChange({
        ...formState,
        type: newType,
        component: getDefaultComponent(newType),
        values: [],
        range: null,
        default: newSupportsDefault ? formState.default : "",
      });
    },
    [formState, onFormStateChange]
  );

  const handleComponentChange = useCallback(
    (newComponent: string) => {
      const updates: Partial<AttributeFormData> = { component: newComponent };

      if (isNumericType) {
        if (newComponent === "text") {
          updates.values = [];
          updates.range = null;
        } else if (newComponent === "slider") {
          updates.values = [];
          if (!formState.range) {
            updates.range = { min: "", max: "" };
          }
        } else if (newComponent === "radio" || newComponent === "dropdown") {
          updates.range = null;
        }
      }

      onFormStateChange({ ...formState, ...updates });
    },
    [formState, onFormStateChange, isNumericType]
  );

  const handleValuesChange = useCallback(
    (newValues: string[]) => {
      let newComponent = formState.component;

      // For numeric types with radio, switch to dropdown if values > 5
      if (isNumericType && formState.component === "radio") {
        if (newValues.length > RADIO_MAX_VALUES) {
          newComponent = "dropdown";
        }
      }

      // For string type, auto-select component based on values count
      if (formState.type === "str") {
        if (newValues.length === 0) {
          newComponent = "text";
        } else if (newValues.length <= RADIO_MAX_VALUES) {
          newComponent = "radio";
        } else {
          newComponent = "dropdown";
        }
      }

      // For list types, auto-select based on values count
      if (isListType) {
        if (newValues.length <= RADIO_MAX_VALUES) {
          newComponent = "checkboxes";
        } else {
          newComponent = "dropdown";
        }
      }

      onFormStateChange({
        ...formState,
        values: newValues,
        component: newComponent,
      });
    },
    [formState, onFormStateChange, isNumericType, isListType]
  );

  const handleRangeChange = useCallback(
    (range: { min: string; max: string } | null) => {
      onFormStateChange({ ...formState, range });
    },
    [formState, onFormStateChange]
  );

  const handleDefaultChange = useCallback(
    (defaultValue: string) => {
      onFormStateChange({ ...formState, default: defaultValue });
    },
    [formState, onFormStateChange]
  );

  const handleReadOnlyChange = useCallback(
    (readOnly: boolean) => {
      onFormStateChange({ ...formState, read_only: readOnly });
    },
    [formState, onFormStateChange]
  );

  return {
    // Derived state
    isNumericType,
    isIntegerType,
    isListType,
    supportsDefault,
    componentOptions,

    // Visibility flags
    showValues,
    showRange,
    valuesRequired,

    // Validation
    defaultError,

    // Handlers
    handleNameChange,
    handleTypeChange,
    handleComponentChange,
    handleValuesChange,
    handleRangeChange,
    handleDefaultChange,
    handleReadOnlyChange,
  };
}
