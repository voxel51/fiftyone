/**
 * Constants for SchemaManager
 */

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

// Attribute type options for dropdown

export const ATTRIBUTE_TYPE_OPTIONS = [
  { id: "str", data: { label: "String" } },
  { id: "int", data: { label: "Integer" } },
  { id: "float", data: { label: "Float" } },
  { id: "bool", data: { label: "Boolean" } },
  { id: "date", data: { label: "Date" } },
  { id: "datetime", data: { label: "Datetime" } },
  { id: "dict", data: { label: "Dictionary" } },
  { id: "id", data: { label: "ID" } },
  { id: "list<str>", data: { label: "String list" } },
  { id: "list<int>", data: { label: "Integer list" } },
  { id: "list<float>", data: { label: "Float list" } },
];
// Component options by type (matches annotation/constants.py)
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
  // ID_COMPONENTS = {text}
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

// Threshold for auto-switching radio to dropdown
export const RADIO_MAX_VALUES = 5;

// Types that are numeric (values must be numbers)
export const NUMERIC_TYPES = ["int", "float", "list<int>", "list<float>"];

// Types that don't need/support a default value
export const NO_DEFAULT_TYPES = ["bool", "date", "datetime", "dict"];

// List types
export const LIST_TYPES = ["list<str>", "list<int>", "list<float>"];

/**
 * Get default component for a type
 */
export const getDefaultComponent = (type: string): string => {
  switch (type) {
    case "str":
    case "int":
    case "float":
    case "id":
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
