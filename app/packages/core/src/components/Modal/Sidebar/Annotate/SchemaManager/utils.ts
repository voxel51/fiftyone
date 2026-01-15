/**
 * Utility functions for SchemaManager
 */

import type { ListItemProps as BaseListItemProps } from "@voxel51/voodo";
import type { ReactNode } from "react";
import {
  getDefaultComponent,
  NUMBER_TYPES,
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

// Attribute configuration
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
 * Form data for attribute editing
 * Uses strings for values and default (easier form handling)
 * Converted to proper types in toAttributeConfig
 */
export interface AttributeFormData {
  name: string;
  type: string;
  component?: string;
  values?: string[];
  range?: [number, number];
  default?: string;
  read_only?: boolean;
}

/**
 * Create default attribute form data
 */
export const createDefaultAttributeFormData = (): AttributeFormData => ({
  name: "",
  type: "str",
  component: "text",
  values: [],
  range: undefined,
  default: undefined,
  read_only: false,
});

/**
 * Convert AttributeConfig to form data (adds name, ensures component has default)
 * Converts numeric values back to strings for form editing
 */
export const toFormData = (
  name: string,
  config: AttributeConfig
): AttributeFormData => ({
  name,
  type: config.type,
  component:
    config.component ||
    getDefaultComponent(
      config.type,
      config.values?.length ?? 0,
      config.range !== undefined
    ),
  // Convert values to strings for form editing
  values: config.values?.map((v) => String(v)),
  range: config.range,
  // Convert default to string for form editing
  default: config.default !== undefined ? String(config.default) : undefined,
  read_only: config.read_only,
});

/**
 * Convert form data to AttributeConfig (removes name, cleans undefined)
 * Converts values to numbers for numeric types
 */
export const toAttributeConfig = (data: AttributeFormData): AttributeConfig => {
  const isNumericType = NUMBER_TYPES.includes(data.type);

  // Convert string values to numbers for numeric types
  let values: (string | number)[] | undefined;
  if (data.values?.length) {
    values = isNumericType
      ? data.values.map((v) => parseFloat(v)).filter((n) => !isNaN(n))
      : data.values;
  }

  // Convert default to number for numeric types
  let defaultValue: string | number | undefined = data.default || undefined;
  if (defaultValue && isNumericType) {
    const parsed = parseFloat(defaultValue);
    defaultValue = isNaN(parsed) ? undefined : parsed;
  }

  return {
    type: data.type,
    component: data.component || undefined,
    values: values?.length ? values : undefined,
    range: data.range,
    default: defaultValue,
    read_only: data.read_only || undefined,
  };
};
