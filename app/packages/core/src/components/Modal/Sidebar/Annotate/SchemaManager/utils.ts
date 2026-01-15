/**
 * Utility functions for SchemaManager
 */

import type { ListItemProps as BaseListItemProps } from "@voxel51/voodo";
import type { ReactNode } from "react";
import { SYSTEM_READ_ONLY_FIELD_NAME } from "./constants";

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
  values?: string[];
  range?: [number, number];
  default?: string;
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
// Attribute Form State Types and Helpers
// =============================================================================

/**
 * Form state for attribute editing
 */
export interface AttributeFormState {
  name: string;
  attributeType: string;
  componentType: string;
  values: string[];
  range: [number, number] | null;
  defaultValue: string;
  readOnly: boolean;
}

/**
 * Create default attribute form state
 */
export const createDefaultAttributeFormState = (): AttributeFormState => ({
  name: "",
  attributeType: "str",
  componentType: "text",
  values: [],
  range: null,
  defaultValue: "",
  readOnly: false,
});

/**
 * Default components for each data type
 */
const DEFAULT_COMPONENTS: Record<string, string> = {
  str: "text",
  int: "text",
  float: "text",
  bool: "toggle",
  date: "datepicker",
  datetime: "datepicker",
  dict: "json",
  "list<str>": "text",
  "list<int>": "text",
  "list<float>": "text",
  "list<bool>": "text",
};

/**
 * Parse attribute config type and component to form state values
 */
export const parseAttributeType = (
  type: string,
  component?: string
): { attributeType: string; componentType: string } => {
  // Type is the actual data type (str, list<str>, int, etc.)
  const attributeType = type;
  const componentType = component || DEFAULT_COMPONENTS[type] || "text";
  return { attributeType, componentType };
};

/**
 * Convert AttributeConfig to form state
 */
export const attributeConfigToFormState = (
  name: string,
  config: AttributeConfig
): AttributeFormState => {
  const { attributeType, componentType } = parseAttributeType(
    config.type,
    config.component
  );
  return {
    name,
    attributeType,
    componentType,
    values: config.values || [],
    range: config.range || null,
    defaultValue: config.default || "",
    readOnly: config.read_only || false,
  };
};

/**
 * Convert form state to AttributeConfig
 */
export const formStateToAttributeConfig = (
  state: AttributeFormState
): AttributeConfig => ({
  type: state.attributeType,
  component: state.componentType || undefined,
  values: state.values.length > 0 ? state.values : undefined,
  range: state.range || undefined,
  default: state.defaultValue || undefined,
  read_only: state.readOnly || undefined,
});
