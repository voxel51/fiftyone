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
  { id: "list<str>", data: { label: "String list" } },
];

// Component options by attribute type
export const COMPONENT_OPTIONS: Record<
  string,
  Array<{ id: string; label: string; icon?: IconName }>
> = {
  str: [
    { id: "text", label: "Text" },
    { id: "radio", label: "Radio", icon: IconName.Radio },
    { id: "dropdown", label: "Dropdown", icon: IconName.Search },
  ],
  int: [
    { id: "text", label: "Text" },
    { id: "slider", label: "Slider" },
    { id: "radio", label: "Radio", icon: IconName.Radio },
  ],
  float: [
    { id: "text", label: "Text" },
    { id: "slider", label: "Slider" },
    { id: "radio", label: "Radio", icon: IconName.Radio },
  ],
  bool: [
    { id: "toggle", label: "Toggle" },
    { id: "checkbox", label: "Checkbox", icon: IconName.Checkbox },
  ],
  "list<str>": [
    { id: "checkboxes", label: "Checkboxes", icon: IconName.Checkbox },
    { id: "dropdown", label: "Dropdown", icon: IconName.Search },
  ],
};

// Threshold for auto-switching radio to dropdown
export const RADIO_MAX_VALUES = 5;

// Types that are numeric (values must be numbers)
export const NUMERIC_TYPES = ["int", "float"];

/**
 * Get default component for a type
 */
export const getDefaultComponent = (type: string): string => {
  switch (type) {
    case "str":
      return "text";
    case "int":
    case "float":
      return "text";
    case "bool":
      return "toggle";
    case "list<str>":
      return "checkboxes";
    default:
      return "text";
  }
};

/**
 * Get component based on type, values count, and whether range is set
 * For int/float: auto-selects radio/dropdown based on values count
 */
export const getComponentForContext = (
  type: string,
  component: string,
  valuesCount: number,
  hasRange: boolean
): string => {
  // For numeric types with radio component, auto-switch to dropdown if values > 5
  if (NUMERIC_TYPES.includes(type) && component === "radio") {
    if (valuesCount > RADIO_MAX_VALUES) {
      return "dropdown";
    }
  }

  // For string type, auto-switch based on values count
  if (type === "str") {
    if (valuesCount === 0) return "text";
    if (valuesCount <= RADIO_MAX_VALUES) return "radio";
    return "dropdown";
  }

  return component;
};
