/**
 * Utility functions for SchemaManager
 */

import type { ListItemProps as BaseListItemProps } from "@voxel51/voodo";
import type { ReactNode } from "react";
import {
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
  default?: string | number;
  read_only?: boolean;
}

// Class configuration
export interface ClassConfig {
  attributes?: Record<string, AttributeConfig>;
}

// Schema configuration
export interface SchemaConfigType {
  classes?: string[];
  attributes?: Record<string, AttributeConfig>;
}

// Form state for attribute editing (uses strings for form inputs)
export interface AttributeFormData {
  name: string;
  type: string;
  component: string;
  values: string[];
  range: { min: string; max: string } | null;
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
export const createDefaultFormData = (): AttributeFormData => ({
  name: "",
  type: "str",
  component: "text",
  values: [],
  range: null,
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
  component: config.component || getDefaultComponent(config.type),
  values: config.values?.map(String) || [],
  range: config.range
    ? { min: String(config.range[0]), max: String(config.range[1]) }
    : null,
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

  return {
    type: data.type,
    component: data.component || undefined,
    values: values?.length ? values : undefined,
    range,
    default: defaultValue,
    read_only: data.read_only || undefined,
  };
};

/**
 * Validate attribute form data and return error message if invalid
 * Returns null if form is valid
 */
export const getAttributeFormError = (
  data: AttributeFormData
): string | null => {
  const isNumeric = NUMERIC_TYPES.includes(data.type);

  // Slider requires valid range
  if (isNumeric && data.component === "slider") {
    if (!data.range || data.range.min === "" || data.range.max === "") {
      return "Slider requires min and max range values";
    }
    const min = parseFloat(data.range.min);
    const max = parseFloat(data.range.max);
    if (isNaN(min) || isNaN(max) || min >= max) {
      return "Min must be less than max";
    }
  }

  // Radio and dropdown require values
  if (data.component === "radio" || data.component === "dropdown") {
    if (data.values.length === 0) {
      return "At least one value is required";
    }
  }

  // Checkboxes require values
  if (data.component === "checkboxes") {
    if (data.values.length === 0) {
      return "At least one value is required";
    }
  }

  // Validate default is within range (if range is set)
  if (isNumeric && data.range && data.default) {
    const { min, max } = data.range;
    if (min !== "" && max !== "") {
      const minNum = parseFloat(min);
      const maxNum = parseFloat(max);
      const defaultNum = parseFloat(data.default);
      if (
        !isNaN(defaultNum) &&
        !isNaN(minNum) &&
        !isNaN(maxNum) &&
        minNum < maxNum
      ) {
        if (defaultNum < minNum || defaultNum > maxNum) {
          return `Default must be between ${min} and ${max}`;
        }
      }
    }
  }

  // Validate default is within values (if values are set)
  if (data.values.length > 0 && data.default) {
    if (!data.values.includes(data.default)) {
      return "Default must be within provided values";
    }
  }

  return null;
};
