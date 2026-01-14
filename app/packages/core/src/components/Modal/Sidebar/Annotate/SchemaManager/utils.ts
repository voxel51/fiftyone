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
  values?: string[];
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
