/**
 * Constants for SchemaManager
 */

import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DICT_FIELD,
  FLOAT_FIELD,
  INT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import { IconName } from "@voxel51/voodo";

// Tab IDs for GUI/JSON toggle
export const TAB_GUI = "gui" as const;
export const TAB_JSON = "json" as const;
export const TAB_IDS = [TAB_GUI, TAB_JSON] as const;
export type TabId = typeof TAB_IDS[number];

// System read-only fields that cannot be edited or scanned
const SYSTEM_READ_ONLY_FIELDS_ARRAY = [
  "created_at",
  "id",
  "last_modified_at",
] as const;

export const SYSTEM_READ_ONLY_FIELD_NAME = "system";

export type SystemReadOnlyField = typeof SYSTEM_READ_ONLY_FIELDS_ARRAY[number];

// Use Set for O(1) lookup
const SYSTEM_READ_ONLY_FIELDS_SET = new Set<string>(
  SYSTEM_READ_ONLY_FIELDS_ARRAY
);

export const isSystemReadOnlyField = (fieldName: string): boolean =>
  SYSTEM_READ_ONLY_FIELDS_SET.has(fieldName);

// =============================================================================
// Attribute Type & Component Constants
// =============================================================================

// Label type options for new field creation (image datasets)
export const LABEL_TYPE_OPTIONS = [
  { id: "detections", data: { label: "Detections" } },
  { id: "classification", data: { label: "Classification" } },
];

// Label type options for 3D datasets
export const LABEL_TYPE_OPTIONS_3D = [
  { id: "detections", data: { label: "3D Detections" } },
  { id: "polylines", data: { label: "3D Polylines" } },
  { id: "classification", data: { label: "Classification" } },
];

// =============================================================================
// New Field Category Constants
// =============================================================================

export type FieldCategory = "label" | "primitive";

export const CATEGORY_LABEL = 0;
export const CATEGORY_PRIMITIVE = 1;

// =============================================================================
// Default Label Attributes
// =============================================================================

// Import AttributeConfig from utils to avoid circular dependency issues
// (utils imports constants for other values, so type must live in utils)
import type { AttributeConfig } from "./utils";

// Base attributes shared by all label types (_HasID mixin + confidence)
export const BASE_LABEL_ATTRIBUTES: AttributeConfig[] = [
  { name: "id", type: "id", component: "text", read_only: true },
  { name: "tags", type: "list<str>", component: "text" },
  { name: "confidence", type: "float", component: "text" },
];

// 2D Detection has 'index' and 'mask_path' fields
export const DEFAULT_DETECTION_ATTRIBUTES_2D: AttributeConfig[] = [
  ...BASE_LABEL_ATTRIBUTES,
  { name: "index", type: "int", component: "text" },
  { name: "mask_path", type: "str", component: "text" },
];

// 3D Detection has 'index' only (no mask_path)
export const DEFAULT_DETECTION_ATTRIBUTES_3D: AttributeConfig[] = [
  ...BASE_LABEL_ATTRIBUTES,
  { name: "index", type: "int", component: "text" },
];

// Classification uses base attributes only
export const DEFAULT_CLASSIFICATION_ATTRIBUTES: AttributeConfig[] =
  BASE_LABEL_ATTRIBUTES;

// Polyline has 'closed', 'filled', and 'index' fields
export const DEFAULT_POLYLINE_ATTRIBUTES: AttributeConfig[] = [
  ...BASE_LABEL_ATTRIBUTES,
  { name: "closed", type: "bool", component: "toggle" },
  { name: "filled", type: "bool", component: "toggle" },
  { name: "index", type: "int", component: "text" },
];

// Get default attributes for a label type based on media type
export const getDefaultAttributesForType = (
  labelType: string,
  is3dMedia: boolean
): AttributeConfig[] => {
  switch (labelType) {
    case "detections":
      return is3dMedia
        ? DEFAULT_DETECTION_ATTRIBUTES_3D
        : DEFAULT_DETECTION_ATTRIBUTES_2D;
    case "polylines":
      return DEFAULT_POLYLINE_ATTRIBUTES;
    case "classification":
    default:
      return DEFAULT_CLASSIFICATION_ATTRIBUTES;
  }
};

// Convert schema type to field type format (e.g., "str" -> "Str")
export const toFieldType = (schemaType: string): string => {
  if (schemaType.startsWith("list<")) {
    return "List<" + schemaType.slice(5);
  }
  return schemaType.charAt(0).toUpperCase() + schemaType.slice(1);
};

// Attribute type labels keyed by schema type
export const ATTRIBUTE_TYPE_LABELS: Record<string, string> = {
  str: "String",
  int: "Integer",
  float: "Float",
  bool: "Boolean",
  date: "Date",
  datetime: "Datetime",
  dict: "Dictionary",
  "list<str>": "String list",
  "list<int>": "Integer list",
  "list<float>": "Float list",
};

// Derived Select options for the dropdown (voodo Select expects this shape)
export const ATTRIBUTE_TYPE_OPTIONS = Object.entries(ATTRIBUTE_TYPE_LABELS).map(
  ([id, label]) => ({ id, data: { label } })
);
// Component options by type
// Source: https://github.com/voxel51/fiftyone/blob/1b31fce1b7f24af051ffa278a33c5b02dcc2c8e8/fiftyone/core/annotation/constants.py

export const COMPONENT_OPTIONS: Record<
  string,
  Array<{ id: string; label: string; icon: IconName }>
> = {
  // STR_COMPONENTS = {dropdown, radio, text}
  str: [
    { id: "text", label: "Text", icon: IconName.Text },
    { id: "radio", label: "Radio", icon: IconName.Radio },
    { id: "dropdown", label: "Dropdown", icon: IconName.Search },
  ],
  // FLOAT_INT_COMPONENTS = {dropdown, radio, slider, text}
  int: [
    { id: "text", label: "Text", icon: IconName.Text },
    { id: "slider", label: "Slider", icon: IconName.Slider },
    { id: "radio", label: "Radio", icon: IconName.Radio },
    { id: "dropdown", label: "Dropdown", icon: IconName.Search },
  ],
  float: [
    { id: "text", label: "Text", icon: IconName.Text },
    { id: "slider", label: "Slider", icon: IconName.Slider },
    { id: "radio", label: "Radio", icon: IconName.Radio },
    { id: "dropdown", label: "Dropdown", icon: IconName.Search },
  ],
  // BOOL_COMPONENTS = {checkbox, toggle}
  bool: [
    { id: "toggle", label: "Toggle", icon: IconName.Toggle },
    { id: "checkbox", label: "Checkbox", icon: IconName.Checkbox },
  ],
  // DATE_DATETIME_COMPONENTS = {datepicker}
  date: [{ id: "datepicker", label: "Date picker", icon: IconName.DateRange }],
  datetime: [
    { id: "datepicker", label: "Date picker", icon: IconName.DateRange },
  ],
  // DICT_COMPONENTS = {json}
  dict: [{ id: "json", label: "JSON editor", icon: IconName.JSON }],
  // ID_COMPONENTS = {text} - for existing ObjectIdField/UUIDField attributes
  id: [{ id: "text", label: "Text", icon: IconName.Text }],
  // STR_LIST_COMPONENTS = {checkboxes, dropdown, text}
  "list<str>": [
    { id: "checkboxes", label: "Checkboxes", icon: IconName.Checkbox },
    { id: "dropdown", label: "Dropdown", icon: IconName.Search },
    { id: "text", label: "Text", icon: IconName.Text },
  ],
  // FLOAT_INT_LIST_COMPONENTS = {checkboxes, dropdown, text}
  "list<int>": [
    { id: "checkboxes", label: "Checkboxes", icon: IconName.Checkbox },
    { id: "dropdown", label: "Dropdown", icon: IconName.Search },
    { id: "text", label: "Text", icon: IconName.Text },
  ],
  "list<float>": [
    { id: "checkboxes", label: "Checkboxes", icon: IconName.Checkbox },
    { id: "dropdown", label: "Dropdown", icon: IconName.Search },
    { id: "text", label: "Text", icon: IconName.Text },
  ],
};

// Types that are numeric (values must be numbers)
export const NUMERIC_TYPES = ["int", "float", "list<int>", "list<float>"];

// Types that don't need/support a default value
export const NO_DEFAULT_TYPES = ["bool", "date", "datetime", "dict", "id"];

// List types
export const LIST_TYPES = ["list<str>", "list<int>", "list<float>"];

// Primitive field types - full Python class names from @fiftyone/utilities
// Used to check if a field is a primitive type (not a label type like Detection)
export const PRIMITIVE_FIELD_CLASSES = new Set([
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DICT_FIELD,
  FLOAT_FIELD,
  INT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
]);

// Map full Python class name to schema type (e.g. "float")
export const FIELD_CLASS_TO_SCHEMA_TYPE: Record<string, string> = {
  [BOOLEAN_FIELD]: "bool",
  [DATE_FIELD]: "date",
  [DATE_TIME_FIELD]: "datetime",
  [DICT_FIELD]: "dict",
  [FLOAT_FIELD]: "float",
  [INT_FIELD]: "int",
  [OBJECT_ID_FIELD]: "id",
  [STRING_FIELD]: "str",
};

// Primitive field types - capitalized short names returned by fieldType atom
// The atom does capitalize(schema.type) where type is "str", "float", etc.
// Note: capitalize() only capitalizes the first letter, so "list<int>" becomes "List<int>"
export const PRIMITIVE_FIELD_TYPES = new Set([
  "Str",
  "Int",
  "Float",
  "Bool",
  "Date",
  "Datetime",
  "Dict",
  "List",
  "List<str>",
  "List<int>",
  "List<float>",
  "Id",
]);

// Map field type (e.g. "Float") to schema type (e.g. "float")
export const FIELD_TYPE_TO_SCHEMA_TYPE: Record<string, string> = {
  Str: "str",
  Int: "int",
  Float: "float",
  Bool: "bool",
  Date: "date",
  Datetime: "datetime",
  Dict: "dict",
  Id: "id",
  // List types (capitalize() only capitalizes first letter)
  "List<str>": "list<str>",
  "List<int>": "list<int>",
  "List<float>": "list<float>",
};

// Get schema type from field type
export const getSchemaTypeFromFieldType = (fieldType: string): string => {
  // Check direct mapping first
  if (FIELD_TYPE_TO_SCHEMA_TYPE[fieldType]) {
    return FIELD_TYPE_TO_SCHEMA_TYPE[fieldType];
  }

  // Handle list patterns like "List<str>", "List<int>", etc.
  const listMatch = fieldType.match(/^List<(.+)>$/i);
  if (listMatch) {
    const innerType = listMatch[1].toLowerCase();
    const innerSchemaType =
      FIELD_TYPE_TO_SCHEMA_TYPE[
        innerType.charAt(0).toUpperCase() + innerType.slice(1)
      ] || "str";
    return `list<${innerSchemaType}>`;
  }

  // Default to "str" for unknown types
  return "str";
};

/**
 * Check if component type needs a range (slider only).
 */
export const componentNeedsRange = (component: string): boolean =>
  component === "slider";

/**
 * Check if component type needs values (radio, dropdown, checkboxes).
 */
export const componentNeedsValues = (component: string): boolean =>
  component === "radio" ||
  component === "dropdown" ||
  component === "checkboxes";

/**
 * Threshold for switching between radio and dropdown components.
 * Mirrors CHECKBOXES_OR_RADIO_THRESHOLD in annotation/constants.py
 */
export const CLASSES_COMPONENT_THRESHOLD = 5;

/**
 * Get default component for a type
 */
export const getDefaultComponent = (type: string): string => {
  switch (type) {
    case "str":
    case "int":
    case "float":
      return "text";
    case "bool":
      return "toggle";
    case "date":
    case "datetime":
      return "datepicker";
    case "dict":
      return "json";
    case "list<str>":
    case "list<int>":
    case "list<float>":
      return "checkboxes";
    default:
      return "text";
  }
};
