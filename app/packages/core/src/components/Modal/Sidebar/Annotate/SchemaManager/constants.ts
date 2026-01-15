/**
 * Constants for SchemaManager
 */

import { IconName } from "@voxel51/voodo";

// Tab IDs for GUI/JSON toggle
export const TAB_GUI = "gui" as const;
export const TAB_JSON = "json" as const;
export const TAB_IDS = [TAB_GUI, TAB_JSON] as const;
export type TabId = typeof TAB_IDS[number];

// =============================================================================
// Attribute Type & Component Constants (matches annotation/constants.py)
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
  { id: "list<str>", data: { label: "String list" } },
  { id: "list<int>", data: { label: "Integer list" } },
  { id: "list<float>", data: { label: "Float list" } },
  { id: "list<bool>", data: { label: "Boolean list" } },
];

// Component options by type - matches annotation/constants.py
// STR_COMPONENTS = {dropdown, radio, text}
// FLOAT_INT_COMPONENTS = {dropdown, radio, slider, text}
// BOOL_COMPONENTS = {checkbox, toggle}
// DATE_DATETIME_COMPONENTS = {datepicker}
// DICT_COMPONENTS = {json}
// STR_LIST_COMPONENTS = {checkboxes, dropdown, text}
// FLOAT_INT_LIST_COMPONENTS = {checkboxes, dropdown, text}
// BOOL_LIST_COMPONENTS = {checkboxes, dropdown, text}
// Component options by type - order matches grammar spec
export const COMPONENT_OPTIONS_BY_TYPE: Record<
  string,
  Array<{ id: string; data: { label: string; icon?: IconName } }>
> = {
  // str: text|radio|dropdown
  str: [
    { id: "text", data: { label: "Text" } },
    { id: "radio", data: { label: "Radio", icon: IconName.Radio } },
    { id: "dropdown", data: { label: "Dropdown", icon: IconName.Search } },
  ],
  // int: text|slider|radio|dropdown
  int: [
    { id: "text", data: { label: "Text" } },
    { id: "slider", data: { label: "Slider" } },
    { id: "radio", data: { label: "Radio", icon: IconName.Radio } },
    { id: "dropdown", data: { label: "Dropdown", icon: IconName.Search } },
  ],
  // float: text|slider|radio|dropdown
  float: [
    { id: "text", data: { label: "Text" } },
    { id: "slider", data: { label: "Slider" } },
    { id: "radio", data: { label: "Radio", icon: IconName.Radio } },
    { id: "dropdown", data: { label: "Dropdown", icon: IconName.Search } },
  ],
  // bool: toggle|checkbox
  bool: [
    { id: "toggle", data: { label: "Toggle" } },
    { id: "checkbox", data: { label: "Checkbox", icon: IconName.Checkbox } },
  ],
  // date: datepicker
  date: [{ id: "datepicker", data: { label: "Datepicker" } }],
  // datetime: datepicker
  datetime: [{ id: "datepicker", data: { label: "Datepicker" } }],
  // dict: json
  dict: [{ id: "json", data: { label: "JSON" } }],
  // list<str>: text|checkboxes|dropdown
  "list<str>": [
    { id: "text", data: { label: "Text" } },
    {
      id: "checkboxes",
      data: { label: "Checkboxes", icon: IconName.Checkbox },
    },
    { id: "dropdown", data: { label: "Dropdown", icon: IconName.Search } },
  ],
  // list<int>: text|checkboxes|dropdown
  "list<int>": [
    { id: "text", data: { label: "Text" } },
    {
      id: "checkboxes",
      data: { label: "Checkboxes", icon: IconName.Checkbox },
    },
    { id: "dropdown", data: { label: "Dropdown", icon: IconName.Search } },
  ],
  // list<float>: text|checkboxes|dropdown
  "list<float>": [
    { id: "text", data: { label: "Text" } },
    {
      id: "checkboxes",
      data: { label: "Checkboxes", icon: IconName.Checkbox },
    },
    { id: "dropdown", data: { label: "Dropdown", icon: IconName.Search } },
  ],
  // list<bool>: text|checkboxes|dropdown
  "list<bool>": [
    { id: "text", data: { label: "Text" } },
    {
      id: "checkboxes",
      data: { label: "Checkboxes", icon: IconName.Checkbox },
    },
    { id: "dropdown", data: { label: "Dropdown", icon: IconName.Search } },
  ],
};

// Types that support range input
export const RANGE_TYPES = ["int", "float"];

// Types that don't show values list
export const NO_VALUES_TYPES = ["bool", "date", "datetime", "dict"];

// Numeric types - values should be stored as numbers, not strings
export const NUMBER_TYPES = ["int", "float", "list<int>", "list<float>"];

// Threshold for radio vs dropdown selection
export const RADIO_MAX_VALUES = 5;

// List types
export const LIST_TYPES = [
  "list<str>",
  "list<int>",
  "list<float>",
  "list<bool>",
];

// Get default component based on type, values count, and range
export const getDefaultComponent = (
  type: string,
  valuesCount: number,
  hasRange: boolean
): string => {
  switch (type) {
    case "str":
      // text (N=0) | radio (0<N<=RADIO_MAX_VALUES) | dropdown (N>RADIO_MAX_VALUES)
      if (valuesCount === 0) return "text";
      if (valuesCount <= RADIO_MAX_VALUES) return "radio";
      return "dropdown";

    case "int":
    case "float":
      // If values provided, use radio/dropdown (values take precedence)
      if (valuesCount > 0) {
        if (valuesCount <= RADIO_MAX_VALUES) return "radio";
        return "dropdown";
      }
      // No values: text (no range) | slider (with range)
      return hasRange ? "slider" : "text";

    case "bool":
      return "toggle";

    case "date":
    case "datetime":
      return "datepicker";

    case "dict":
      return "json";

    case "list<str>":
      // text (N=0) | checkboxes (0<N<=RADIO_MAX_VALUES) | dropdown (N>RADIO_MAX_VALUES)
      if (valuesCount === 0) return "text";
      if (valuesCount <= RADIO_MAX_VALUES) return "checkboxes";
      return "dropdown";

    case "list<int>":
    case "list<float>":
    case "list<bool>":
      // Always text for these list types
      return "text";

    default:
      return "text";
  }
};

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
