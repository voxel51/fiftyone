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
  componentNeedsRange,
  componentNeedsValues,
  getDefaultComponent,
} from "../../constants";
import {
  getAttributeFormErrors,
  hasAttributeFormError,
  type AttributeFormData,
} from "../../utils";

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

  // Validation errors (field-specific)
  valuesError: string | null;
  rangeError: string | null;
  defaultError: string | null;
  hasFormError: boolean;

  // Handlers
  handleNameChange: (name: string) => void;
  handleTypeChange: (type: string) => void;
  handleComponentChange: (component: string) => void;
  handleValuesChange: (values: string[]) => void;
  handleRangeChange: (range: { min: string; max: string } | null) => void;
  handleStepChange: (step: string) => void;
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
  const showValues = componentNeedsValues(formState.component);
  const showRange = isNumericType && componentNeedsRange(formState.component);

  // Validation - field-specific errors
  const formErrors = useMemo(
    () => getAttributeFormErrors(formState),
    [formState]
  );

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
        step: "",
        default: newSupportsDefault ? formState.default : "",
      });
    },
    [formState, onFormStateChange]
  );

  const handleComponentChange = useCallback(
    (newComponent: string) => {
      // Reset to initial state when switching component
      onFormStateChange({
        ...formState,
        component: newComponent,
        values: [],
        range: null,
        step: "",
      });
    },
    [formState, onFormStateChange]
  );

  const handleValuesChange = useCallback(
    (newValues: string[]) => {
      onFormStateChange({ ...formState, values: newValues });
    },
    [formState, onFormStateChange]
  );

  const handleRangeChange = useCallback(
    (range: { min: string; max: string } | null) => {
      onFormStateChange({ ...formState, range });
    },
    [formState, onFormStateChange]
  );

  const handleStepChange = useCallback(
    (step: string) => {
      onFormStateChange({ ...formState, step });
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

    // Validation errors
    valuesError: formErrors.values,
    rangeError: formErrors.range,
    defaultError: formErrors.default,
    hasFormError: hasAttributeFormError(formErrors),

    // Handlers
    handleNameChange,
    handleTypeChange,
    handleComponentChange,
    handleValuesChange,
    handleRangeChange,
    handleStepChange,
    handleDefaultChange,
    handleReadOnlyChange,
  };
}
