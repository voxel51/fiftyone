/**
 * Utility functions for SchemaManager
 */

import type { ListItemProps as BaseListItemProps } from "@voxel51/voodo";
import type { ReactNode } from "react";
import {
  componentNeedsRange,
  componentNeedsValues,
  getDefaultComponent,
  NUMERIC_TYPES,
  SYSTEM_READ_ONLY_FIELD_NAME,
} from "./constants";

// =============================================================================
// Types
// =============================================================================

// Extend ListItemProps to include additionalContent (added to design-system)
export interface ListItemProps extends BaseListItemProps {
  additionalContent?: ReactNode;
}

// RichList item type
export interface RichListItem {
  id: string;
  data: ListItemProps;
}

// Options for creating a RichListItem
export interface RichListItemOptions {
  id: string;
  primaryContent: ReactNode;
  secondaryContent?: ReactNode;
  actions?: ReactNode;
  additionalContent?: ReactNode;
  canSelect?: boolean;
  canDrag?: boolean;
}

// Attribute configuration (matches API)
export interface AttributeConfig {
  type: string;
  component?: string;
  values?: (string | number)[];
  range?: [number, number];
  step?: number;
  default?: string | number;
  read_only?: boolean;
}

// Class configuration
export interface ClassConfig {
  attributes?: Record<string, AttributeConfig>;
}

// Schema configuration (for both label types and primitive fields)
export interface SchemaConfigType {
  // For label types (Detection, Classification, etc.)
  classes?: string[];
  attributes?: Record<string, AttributeConfig>;
  // For primitive fields (and label class config)
  type?: string;
  component?: string;
  values?: (string | number)[];
  range?: [number, number];
  step?: number;
  default?: string | number;
  read_only?: boolean;
}

// Form state for attribute editing (uses strings for form inputs)
export interface AttributeFormData {
  name: string;
  type: string;
  component: string;
  values: string[];
  range: { min: string; max: string } | null;
  step: string;
  default: string;
  read_only: boolean;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a RichListItem with defaults
 */
export const createRichListItem = ({
  id,
  primaryContent,
  secondaryContent,
  actions,
  additionalContent,
  canSelect = false,
  canDrag = false,
}: RichListItemOptions): RichListItem => ({
  id,
  data: {
    canSelect,
    canDrag,
    primaryContent,
    secondaryContent,
    actions,
    additionalContent,
  },
});

/**
 * Get human-readable label for attribute type or component
 * Based on annotation/constants.py
 */
export const getAttributeTypeLabel = (type: string): string => {
  const typeMap: Record<string, string> = {
    // Components
    checkbox: "Checkbox",
    checkboxes: "Checkboxes",
    datepicker: "Date picker",
    dropdown: "Dropdown",
    json: "JSON",
    radio: "Radio group",
    slider: "Slider",
    text: "Text",
    toggle: "Toggle",
    // Types
    bool: "Boolean",
    "list<bool>": "Boolean list",
    date: "Date",
    datetime: "Date/time",
    dict: "Dictionary",
    float: "Float",
    "list<float>": "Float list",
    id: "ID",
    int: "Integer",
    "list<int>": "Integer list",
    str: "String",
    "list<str>": "String list",
  };
  return typeMap[type] || type;
};

/**
 * Validate class name and return error message if invalid
 */
export const getClassNameError = (
  name: string,
  existingClasses: string[],
  currentClass?: string
): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return "Class name cannot be empty";
  const isDuplicate = existingClasses.some(
    (c) => c !== currentClass && c === trimmed
  );
  if (isDuplicate) return "Class name already exists";
  return null;
};

/**
 * Validate attribute name and return error message if invalid
 */
export const getAttributeNameError = (
  name: string,
  existingAttributes: string[],
  currentAttribute?: string
): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return "Attribute name cannot be empty";
  const isDuplicate = existingAttributes.some(
    (a) => a !== currentAttribute && a === trimmed
  );
  if (isDuplicate) return "Attribute name already exists";
  return null;
};

/**
 * Format attribute count text
 */
export const formatAttributeCount = (count: number): string => {
  return `${count} attribute${count !== 1 ? "s" : ""}`;
};

/**
 * Format schema count text
 */
export const formatSchemaCount = (count: number): string => {
  return `${count} schema${count !== 1 ? "s" : ""}`;
};

/**
 * Build secondary content string for field display
 */
export const buildFieldSecondaryContent = (
  fieldType: string,
  attrCount: number,
  isSystemReadOnly: boolean
): string => {
  const typeText = isSystemReadOnly ? SYSTEM_READ_ONLY_FIELD_NAME : fieldType;
  if (!isSystemReadOnly && attrCount > 0) {
    return `${typeText} • ${formatAttributeCount(attrCount)}`;
  }
  return typeText;
};

// =============================================================================
// Attribute Form Helpers
// =============================================================================

/**
 * Create default form data for a new attribute
 */
// Default step value for slider (matches backend DEFAULT_STEP)
export const DEFAULT_STEP = "0.001";

export const createDefaultFormData = (): AttributeFormData => ({
  name: "",
  type: "str",
  component: "text",
  values: [],
  range: null,
  step: "",
  default: "",
  read_only: false,
});

/**
 * Convert AttributeConfig to form data for editing
 */
export const toFormData = (
  name: string,
  config: AttributeConfig
): AttributeFormData => ({
  name,
  type: config.type,
  // component should come from backend, additional fallback to be safe
  component: config.component || getDefaultComponent(config.type),
  values: config.values?.map(String) || [],
  range: config.range
    ? { min: String(config.range[0]), max: String(config.range[1]) }
    : null,
  step: config.step !== undefined ? String(config.step) : "",
  default: config.default !== undefined ? String(config.default) : "",
  read_only: config.read_only || false,
});

/**
 * Convert form data to AttributeConfig for saving
 * Converts values to numbers for numeric types
 */
export const toAttributeConfig = (data: AttributeFormData): AttributeConfig => {
  const isNumeric = NUMERIC_TYPES.includes(data.type);

  // Convert values to numbers for numeric types
  let values: (string | number)[] | undefined;
  if (data.values.length > 0) {
    values = isNumeric
      ? data.values.map((v) => parseFloat(v)).filter((n) => !isNaN(n))
      : data.values;
  }

  // Convert range to tuple
  let range: [number, number] | undefined;
  if (data.range && data.range.min !== "" && data.range.max !== "") {
    const min = parseFloat(data.range.min);
    const max = parseFloat(data.range.max);
    if (!isNaN(min) && !isNaN(max)) {
      range = [min, max];
    }
  }

  // Convert default to number for numeric types
  let defaultValue: string | number | undefined;
  if (data.default) {
    defaultValue = isNumeric ? parseFloat(data.default) : data.default;
    if (typeof defaultValue === "number" && isNaN(defaultValue)) {
      defaultValue = undefined;
    }
  }

  // Convert step to number (only relevant for slider, optional)
  let step: number | undefined;
  if (data.step) {
    const stepNum = parseFloat(data.step);
    if (!isNaN(stepNum) && stepNum > 0) {
      step = stepNum;
    }
  }

  return {
    type: data.type,
    component: data.component || undefined,
    values: values?.length ? values : undefined,
    range,
    step,
    default: defaultValue,
    read_only: data.read_only || undefined,
  };
};

/**
 * Field-specific validation errors for attribute form
 */
export interface AttributeFormErrors {
  values: string | null;
  range: string | null;
  step: string | null;
  default: string | null;
}

/**
 * Validate attribute form data and return field-specific errors.
 * Used for both UI display and canSave logic.
 */
export const getAttributeFormErrors = (
  data: AttributeFormData
): AttributeFormErrors => {
  const errors: AttributeFormErrors = {
    values: null,
    range: null,
    step: null,
    default: null,
  };

  const isNumeric = NUMERIC_TYPES.includes(data.type);
  const needsValues = componentNeedsValues(data.component);
  const needsRange = isNumeric && componentNeedsRange(data.component);

  // Values validation
  if (needsValues && data.values.length === 0) {
    errors.values = "At least one value is required";
  }

  // Range validation (for slider)
  if (needsRange) {
    if (!data.range || data.range.min === "" || data.range.max === "") {
      errors.range = "Min and max are required";
    } else {
      const min = parseFloat(data.range.min);
      const max = parseFloat(data.range.max);
      if (isNaN(min) || isNaN(max)) {
        errors.range = "Min and max must be valid numbers";
      } else if (min >= max) {
        errors.range = "Min must be less than max";
      }
    }
  }

  // Step validation (for slider, optional but must be valid if provided)
  if (needsRange && data.step && !errors.range) {
    const stepNum = parseFloat(data.step);
    if (isNaN(stepNum) || stepNum <= 0) {
      errors.step = "Step must be a positive number";
    } else if (data.range) {
      const min = parseFloat(data.range.min);
      const max = parseFloat(data.range.max);
      const rangeSize = max - min;
      if (stepNum >= rangeSize) {
        errors.step = "Step must be smaller than the range";
      }
    }
  }

  // Default validation (only if there's a default value)
  if (data.default) {
    // Check against range
    if (needsRange && data.range && !errors.range) {
      const min = parseFloat(data.range.min);
      const max = parseFloat(data.range.max);
      const defaultNum = parseFloat(data.default);
      if (!isNaN(defaultNum) && (defaultNum < min || defaultNum > max)) {
        errors.default = `Default must be between ${data.range.min} and ${data.range.max}`;
      }
    }

    // Check against values
    if (needsValues && data.values.length > 0 && !errors.values) {
      if (!data.values.includes(data.default)) {
        errors.default = "Default must be one of the provided values";
      }
    }
  }

  return errors;
};

/**
 * Check if form has any validation errors
 */
export const hasAttributeFormError = (errors: AttributeFormErrors): boolean =>
  !!(errors.values || errors.range || errors.step || errors.default);
