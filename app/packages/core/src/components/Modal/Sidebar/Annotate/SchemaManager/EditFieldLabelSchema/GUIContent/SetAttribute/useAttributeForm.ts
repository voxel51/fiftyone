/**
 * Hook for managing attribute form state and logic.
 */

import { useState } from "react";
import { getDefaultComponent } from "../../../constants";
import type { AttributeFormState } from "../../../utils";

interface UseAttributeFormProps {
  formState: AttributeFormState;
  onFormStateChange: (state: AttributeFormState) => void;
}

export default function useAttributeForm({
  formState,
  onFormStateChange,
}: UseAttributeFormProps) {
  const [defaultTouched, setDefaultTouched] = useState(false);

  // Validate default value - must be one of values if values are provided
  const hasDefaultValue =
    formState.defaultValue !== "" &&
    formState.defaultValue !== undefined &&
    formState.defaultValue !== null;

  const defaultError =
    defaultTouched &&
    formState.values.length > 0 &&
    hasDefaultValue &&
    !formState.values.includes(formState.defaultValue);

  // Handle type change - resets component, values, and range
  const handleTypeChange = (newType: string) => {
    const defaultComponent = getDefaultComponent(newType, 0, false);
    onFormStateChange({
      ...formState,
      attributeType: newType,
      componentType: defaultComponent,
      values: [],
      range: null,
    });
  };

  // Handle component type change
  const handleComponentChange = (componentType: string) => {
    onFormStateChange({ ...formState, componentType });
  };

  // Handle name change
  const handleNameChange = (name: string) => {
    onFormStateChange({ ...formState, name });
  };

  // Handle values change - auto-selects component based on count
  const handleValuesChange = (values: string[]) => {
    const hasRange = formState.range !== null;
    const newComponent = getDefaultComponent(
      formState.attributeType,
      values.length,
      hasRange
    );
    onFormStateChange({
      ...formState,
      values,
      componentType: newComponent,
    });
  };

  // Handle range change - auto-selects component based on range presence
  const handleRangeChange = (min: number | null, max: number | null) => {
    const newRange: [number, number] | null =
      min !== null || max !== null ? [min ?? 0, max ?? 100] : null;
    const newComponent = getDefaultComponent(
      formState.attributeType,
      formState.values.length,
      newRange !== null
    );
    onFormStateChange({
      ...formState,
      range: newRange,
      componentType: newComponent,
    });
  };

  // Handle default value change
  const handleDefaultChange = (defaultValue: string) => {
    onFormStateChange({ ...formState, defaultValue });
  };

  // Handle default blur for validation
  const handleDefaultBlur = () => {
    setDefaultTouched(true);
  };

  // Handle read-only toggle
  const handleReadOnlyChange = (readOnly: boolean) => {
    onFormStateChange({ ...formState, readOnly });
  };

  return {
    // Validation
    defaultError,

    // Handlers
    handleTypeChange,
    handleComponentChange,
    handleNameChange,
    handleValuesChange,
    handleRangeChange,
    handleDefaultChange,
    handleDefaultBlur,
    handleReadOnlyChange,
  };
}
