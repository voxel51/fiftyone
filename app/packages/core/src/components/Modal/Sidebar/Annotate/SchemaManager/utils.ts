/**
 * Utility functions for SchemaManager
 */

import { is3d } from "@fiftyone/utilities";
import type { ListItemProps as BaseListItemProps } from "@voxel51/voodo";
import type { ReactNode } from "react";
import {
  CLASSES_COMPONENT_THRESHOLD,
  componentNeedsRange,
  componentNeedsValues,
  getDefaultComponent,
  LABEL_TYPE_OPTIONS,
  LABEL_TYPE_OPTIONS_3D,
  LIST_TYPES,
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
// Note: When stored in schema, attributes include 'name' field
export interface AttributeConfig {
  name: string;
  type: string;
  component?: string;
  values?: (string | number)[];
  range?: [number, number];
  default?: string | number | (string | number)[]; // Array for list types
  read_only?: boolean;
}

// Class configuration
export interface ClassConfig {
  attributes?: AttributeConfig[];
}

// Schema configuration (for both label types and primitive fields)
export interface SchemaConfigType {
  // For label types (Detection, Classification, etc.)
  classes?: string[];
  attributes?: AttributeConfig[];
  // For primitive fields (and label class config)
  type?: string;
  component?: string;
  values?: (string | number)[];
  range?: [number, number];
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
  default: string;
  listDefault: (string | number)[]; // For list types
  read_only: boolean;
}

// =============================================================================
// Schema Type Guards
// =============================================================================

/** Shape of an attribute item in the array format */
export interface AttributeItem {
  name: string;
  [key: string]: unknown;
}

/** Shape of a label schema with optional attributes (array format) */
export interface LabelSchema {
  attributes?: AttributeItem[];
  [key: string]: unknown;
}

/** Type guard for an attribute item with a 'name' field */
export const isNamedAttribute = (attr: unknown): attr is AttributeItem =>
  !!attr && typeof attr === "object" && "name" in attr;

/** Type guard for a schema object with an 'attributes' array */
export const hasAttributes = (value: unknown): value is LabelSchema =>
  !!value && typeof value === "object" && "attributes" in value;

/**
 * Safely extract attribute names from a schema value.
 * Attributes are stored as an array of objects with 'name' field.
 */
export const getAttributeNames = (value: unknown): Set<string> => {
  if (hasAttributes(value) && Array.isArray(value.attributes)) {
    return new Set(
      value.attributes.filter(isNamedAttribute).map((attr) => attr.name)
    );
  }
  return new Set();
};

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
  listDefault: [],
  read_only: false,
});

/**
 * Convert AttributeConfig to form data for editing
 */
export const toFormData = (config: AttributeConfig): AttributeFormData => {
  const isListType = LIST_TYPES.includes(config.type);

  // Handle default value - could be array for list types
  let defaultStr = "";
  let listDefault: (string | number)[] = [];
  if (config.default !== undefined) {
    if (Array.isArray(config.default)) {
      listDefault = config.default;
    } else if (isListType) {
      // Single value for list type - wrap in array
      listDefault = [config.default];
    } else {
      defaultStr = String(config.default);
    }
  }

  return {
    name: config.name,
    type: config.type,
    // component should come from backend, additional fallback to be safe
    component: config.component || getDefaultComponent(config.type),
    values: config.values?.map(String) || [],
    range: config.range
      ? { min: String(config.range[0]), max: String(config.range[1]) }
      : null,
    default: defaultStr,
    listDefault,
    read_only: config.read_only || false,
  };
};

/**
 * Convert form data to AttributeConfig for saving
 * Converts values to numbers for numeric types
 */
export const toAttributeConfig = (data: AttributeFormData): AttributeConfig => {
  const isNumeric = NUMERIC_TYPES.includes(data.type);
  const isListType = LIST_TYPES.includes(data.type);

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

  // Convert default to appropriate type
  let defaultValue: string | number | (string | number)[] | undefined;
  if (isListType) {
    // For list types, use listDefault array
    if (data.listDefault && data.listDefault.length > 0) {
      defaultValue = data.listDefault;
    }
  } else if (data.default) {
    // For non-list types, convert to number if numeric
    defaultValue = isNumeric ? parseFloat(data.default) : data.default;
    if (typeof defaultValue === "number" && isNaN(defaultValue)) {
      defaultValue = undefined;
    }
  }

  return {
    name: data.name.trim(),
    type: data.type,
    component: data.component || undefined,
    values: values?.length ? values : undefined,
    range,
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
  default: string | null;
}

// =============================================================================
// Shared Validation Functions
// =============================================================================

/**
 * Validate that a values list is non-empty and contains valid entries.
 * Used by both attribute forms and primitive field config.
 */
export const validateValues = (
  values: string[],
  isNumeric: boolean
): string | null => {
  if (values.length === 0) {
    return "At least one value is required";
  }
  if (isNumeric) {
    const invalid = values.find((v) => isNaN(parseFloat(v)));
    if (invalid !== undefined) {
      return "Values must be valid numbers";
    }
  }
  return null;
};

/**
 * Validate a single input value for a values list.
 * Returns an error message or null if valid.
 */
export const validateSingleValue = (
  value: string,
  existingValues: string[],
  isNumeric: boolean,
  isInteger: boolean
): string | null => {
  if (!value.trim()) return null;
  if (isNumeric) {
    const num = parseFloat(value);
    if (isNaN(num)) return "Must be a number";
    if (isInteger && !Number.isInteger(num)) return "Must be an integer";
  }
  if (existingValues.includes(value.trim())) return "Value already exists";
  return null;
};

/**
 * Validate a range (min/max) for slider components.
 */
export const validateRange = (
  range: { min: string; max: string } | null
): string | null => {
  if (!range || range.min === "" || range.max === "") {
    return "Min and max are required";
  }
  const min = parseFloat(range.min);
  const max = parseFloat(range.max);
  if (isNaN(min) || isNaN(max)) {
    return "Min and max must be valid numbers";
  }
  if (min >= max) {
    return "Min must be less than max";
  }
  return null;
};

/**
 * Parse an array of unknown values to numbers where possible.
 */
export const parseNumericValues = (vals: unknown[]): (string | number)[] =>
  vals.map((v) => {
    const num = parseFloat(String(v));
    return isNaN(num) ? v : num;
  }) as (string | number)[];

/**
 * Remove duplicate values by string key, preserving the last occurrence's type.
 */
export const deduplicateValues = (
  vals: (string | number)[]
): (string | number)[] => [
  ...new Map(vals.map((v) => [String(v), v])).values(),
];

/**
 * Validate a scalar default value.
 */
const validateScalarDefault = (
  defaultValue: string,
  isNumeric: boolean,
  range: { min: string; max: string } | null,
  rangeError: string | null,
  values: string[],
  valuesError: string | null,
  needsRange: boolean,
  needsValues: boolean
): string | null => {
  const defaultNum = parseFloat(defaultValue);

  if (isNumeric && isNaN(defaultNum)) {
    return "Default must be a valid number";
  }

  if (needsRange && range && !rangeError) {
    const min = parseFloat(range.min);
    const max = parseFloat(range.max);
    if (defaultNum < min || defaultNum > max) {
      return `Default must be between ${range.min} and ${range.max}`;
    }
  }

  if (needsValues && values.length > 0 && !valuesError) {
    if (!values.includes(defaultValue)) {
      return "Default must be one of the provided values";
    }
  }

  return null;
};

/**
 * Validate a list default value.
 */
const validateListDefault = (
  listDefault: (string | number)[],
  isNumeric: boolean,
  isIntegerList: boolean,
  values: string[],
  valuesError: string | null,
  needsValues: boolean
): string | null => {
  if (!listDefault || listDefault.length === 0) return null;

  if (isNumeric) {
    const invalidValue = listDefault.find((v) => {
      const num = typeof v === "number" ? v : parseFloat(String(v));
      return isNaN(num);
    });
    if (invalidValue !== undefined) {
      return "All default values must be valid numbers";
    }
  }

  if (isIntegerList) {
    const nonIntegerValue = listDefault.find((v) => {
      const num = typeof v === "number" ? v : parseFloat(String(v));
      return !Number.isInteger(num);
    });
    if (nonIntegerValue !== undefined) {
      return "All default values must be integers";
    }
  }

  if (needsValues && values.length > 0 && !valuesError) {
    const invalidDefault = listDefault.find((d) => !values.includes(String(d)));
    if (invalidDefault !== undefined) {
      return "All defaults must be from the provided values";
    }
  }

  return null;
};

/**
 * Validate attribute form data and return field-specific errors.
 * Used for both UI display and canSave logic.
 */
export const getAttributeFormErrors = (
  data: AttributeFormData
): AttributeFormErrors => {
  const isNumeric = NUMERIC_TYPES.includes(data.type);
  const needsValues = componentNeedsValues(data.component);
  const needsRange = isNumeric && componentNeedsRange(data.component);
  const isListType = LIST_TYPES.includes(data.type);

  const valuesError = needsValues
    ? validateValues(data.values, isNumeric)
    : null;

  const rangeError = needsRange ? validateRange(data.range) : null;

  let defaultError: string | null = null;
  if (data.default) {
    defaultError = validateScalarDefault(
      data.default,
      isNumeric,
      data.range,
      rangeError,
      data.values,
      valuesError,
      needsRange,
      needsValues
    );
  }
  if (!defaultError && isListType) {
    defaultError = validateListDefault(
      data.listDefault,
      isNumeric,
      data.type === "list<int>",
      data.values,
      valuesError,
      needsValues
    );
  }

  return {
    values: valuesError,
    range: rangeError,
    default: defaultError,
  };
};

/**
 * Check if form has any validation errors
 */
export const hasAttributeFormError = (errors: AttributeFormErrors): boolean =>
  !!(errors.values || errors.range || errors.default);

// =============================================================================
// Component Reconciliation
// =============================================================================

/**
 * Auto-adjust the component type to match the current classes.
 * - Classes present + component is "text" → switch to "radio" or "dropdown"
 * - Classes removed + component is "radio"/"dropdown" → switch to "text"
 */
export const reconcileComponent = (
  config: SchemaConfigType
): SchemaConfigType => {
  const { classes, component } = config;

  if (classes && classes.length > 0) {
    if (component === "text") {
      return {
        ...config,
        component:
          classes.length > CLASSES_COMPONENT_THRESHOLD ? "dropdown" : "radio",
      };
    }
  } else if (component === "radio" || component === "dropdown") {
    return { ...config, component: "text" };
  }

  return config;
};

// =============================================================================
// Media Type Helpers
// =============================================================================

/**
 * Get label type options based on media type
 */
export const getLabelTypeOptions = (mediaType: string | null | undefined) => {
  if (mediaType && is3d(mediaType)) {
    return LABEL_TYPE_OPTIONS_3D;
  }
  return LABEL_TYPE_OPTIONS;
};

// =============================================================================
// Field Name Validation
// =============================================================================

/**
 * Validate field name and return error message if invalid
 */
export const validateFieldName = (
  fieldName: string,
  existingFields: Record<string, unknown> | null
): string | null => {
  const trimmed = fieldName.trim();
  if (!trimmed) return null;
  if (existingFields && trimmed in existingFields) {
    return "Field name already exists";
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    return "Invalid field name (use letters, numbers, underscores)";
  }
  return null;
};
