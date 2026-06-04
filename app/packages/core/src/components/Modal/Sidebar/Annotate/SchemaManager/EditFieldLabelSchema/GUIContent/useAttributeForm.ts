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
  type AttributeCondition,
  type AttributeConditionLeaf,
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
  isFromOntology: boolean;
  isTaxonomyEligible: boolean;
  whenPreview: { condition: string; suffix: string | null } | null;
  supportsDefault: boolean;
  componentOptions: Array<{ id: string; label: string; icon: IconName }>;

  // Visibility flags
  showValues: boolean;
  showRange: boolean;

  // Validation errors (field-specific)
  valuesError: string | null;
  rangeError: string | null;
  defaultError: string | null;
  taxonomyError: string | null;
  hasFormError: boolean;

  // Handlers
  handleNameChange: (name: string) => void;
  handleTypeChange: (type: string) => void;
  handleComponentChange: (component: string) => void;
  handleValuesChange: (values: string[]) => void;
  handleRangeChange: (range: { min: string; max: string } | null) => void;
  handleDefaultChange: (defaultValue: string) => void;
  handleListDefaultChange: (values: (string | number)[]) => void;
  handleReadOnlyChange: (readOnly: boolean) => void;
  handleValuesModeChange: (mode: "simple" | "taxonomy") => void;
  handleTaxonomyChange: (taxonomy: string) => void;
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
  const isFromOntology = !!formState._source;
  const whenPreview = useMemo(() => {
    const when = formState.when;
    if (!when) return null;

    const formatValue = (v: unknown): string =>
      typeof v === "string" ? v : JSON.stringify(v);

    // Recursively collect all leaf conditions from the condition tree.
    const collectLeaves = (
      cond: AttributeCondition
    ): AttributeConditionLeaf[] => {
      if (cond.operator === "and" || cond.operator === "or") {
        if (!Array.isArray(cond.conditions)) return [];
        return cond.conditions.flatMap(collectLeaves);
      }
      return [cond];
    };

    const leaves = collectLeaves(when);
    if (leaves.length === 0) return null;

    const first = leaves[0];
    const condition =
      first.operator === "in" && Array.isArray(first.value)
        ? `${first.field} in [${(first.value as unknown[])
            .map(formatValue)
            .join(", ")}]`
        : `${first.field} = ${formatValue(first.value)}`;

    if (leaves.length === 1) return { condition, suffix: null };

    const remaining = leaves.length - 1;
    const suffix = `, +${remaining} more condition${
      remaining !== 1 ? "s" : ""
    }`;

    return { condition, suffix };
  }, [formState.when]);

  const isTaxonomyEligible =
    (formState.type === "str" || formState.type === "list<str>") &&
    formState.component === "dropdown";
  const supportsDefault =
    !NO_DEFAULT_TYPES.includes(formState.type) &&
    formState.valuesMode === "simple";
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
      const newComponent = getDefaultComponent(newType);
      const stillEligible =
        (newType === "str" || newType === "list<str>") &&
        newComponent === "dropdown";
      onFormStateChange({
        ...formState,
        type: newType,
        component: newComponent,
        values: [],
        range: null,
        default: newSupportsDefault ? formState.default : "",
        listDefault: [],
        ...(stillEligible
          ? {}
          : { valuesMode: "simple" as const, taxonomy: undefined }),
      });
    },
    [formState, onFormStateChange]
  );

  const handleComponentChange = useCallback(
    (newComponent: string) => {
      const oldComponent = formState.component;
      const oldNeedsValues = componentNeedsValues(oldComponent);
      const newNeedsValues = componentNeedsValues(newComponent);

      const preserveValues = oldNeedsValues && newNeedsValues;
      const stillEligible =
        (formState.type === "str" || formState.type === "list<str>") &&
        newComponent === "dropdown";

      onFormStateChange({
        ...formState,
        component: newComponent,
        values: preserveValues ? formState.values : [],
        range: null,
        listDefault: [],
        ...(stillEligible
          ? {}
          : { valuesMode: "simple" as const, taxonomy: undefined }),
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

  const handleDefaultChange = useCallback(
    (defaultValue: string) => {
      onFormStateChange({ ...formState, default: defaultValue });
    },
    [formState, onFormStateChange]
  );

  const handleListDefaultChange = useCallback(
    (values: (string | number)[]) => {
      onFormStateChange({ ...formState, listDefault: values });
    },
    [formState, onFormStateChange]
  );

  const handleReadOnlyChange = useCallback(
    (readOnly: boolean) => {
      onFormStateChange({ ...formState, read_only: readOnly });
    },
    [formState, onFormStateChange]
  );

  const handleValuesModeChange = useCallback(
    (mode: "simple" | "taxonomy") => {
      if (mode === "taxonomy") {
        onFormStateChange({ ...formState, valuesMode: mode, values: [] });
      } else {
        onFormStateChange({
          ...formState,
          valuesMode: mode,
          taxonomy: undefined,
        });
      }
    },
    [formState, onFormStateChange]
  );

  const handleTaxonomyChange = useCallback(
    (taxonomy: string) => {
      onFormStateChange({ ...formState, taxonomy });
    },
    [formState, onFormStateChange]
  );

  return {
    // Derived state
    isNumericType,
    isIntegerType,
    isListType,
    isFromOntology,
    isTaxonomyEligible,
    whenPreview,
    supportsDefault,
    componentOptions,

    // Visibility flags
    showValues,
    showRange,

    // Validation errors
    valuesError: formErrors.values,
    rangeError: formErrors.range,
    defaultError: formErrors.default,
    taxonomyError: formErrors.taxonomy,
    hasFormError: hasAttributeFormError(formErrors),

    // Handlers
    handleNameChange,
    handleTypeChange,
    handleComponentChange,
    handleValuesChange,
    handleRangeChange,
    handleDefaultChange,
    handleListDefaultChange,
    handleReadOnlyChange,
    handleValuesModeChange,
    handleTaxonomyChange,
  };
}
