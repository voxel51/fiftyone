import type {
  NumberSchemaType,
  SchemaType,
} from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import { BOOLEAN_FIELD, STRING_FIELD } from "@fiftyone/utilities";
import { ComponentType, FieldType } from "../useSchemaManager";

export interface PrimitiveSchema {
  type: FieldType;
  component?: ComponentType;
  choices?: unknown[];
  values?: string[] | number[];
  range?: [number, number];
  readOnly?: boolean;
}

const getLabel = (value?: unknown): string => {
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  if (value === null || value === undefined) {
    return "None";
  }

  return value as string;
};

/**
 * Creates a disabled text input for read-only fields.
 * For array values, the data should be formatted as comma-separated before passing to the component.
 */
export const createReadOnly = (name: string): SchemaType => {
  return {
    type: "string",
    view: {
      name: "LabelValueView",
      label: name,
      component: "LabelValueView",
    },
  };
};

export const createInput = (
  name: string,
  { ftype, multipleOf }: { ftype: string; multipleOf: number }
): SchemaType => {
  const type =
    ftype === STRING_FIELD
      ? "string"
      : ftype === BOOLEAN_FIELD
      ? "boolean"
      : "number";

  const schema: SchemaType = {
    type,
    view: {
      name: "PrimitiveView",
      label: name,
      component: "PrimitiveView",
    },
  };

  if (typeof multipleOf === "number" && type === "number") {
    (schema as NumberSchemaType).multipleOf = multipleOf;
  }

  return schema;
};

export const createSlider = (
  name: string,
  range: [number, number],
  options?: {
    bare?: boolean;
    labeled?: boolean;
    minLabel?: string;
    maxLabel?: string;
  }
): SchemaType => {
  const {
    bare = false,
    labeled = true,
    minLabel = "",
    maxLabel = "",
  } = options || {};
  return {
    type: "number",
    min: range[0],
    max: range[1],
    view: {
      name: "SliderView",
      label: name,
      component: "SliderView",
      bare,
      labeled,
      minLabel,
      maxLabel,
    },
  };
};

export const createRadio = (
  name: string,
  choices: string[] | number[],
  type: string = "string"
) => {
  return {
    type,
    view: {
      name: "RadioGroup",
      label: name,
      component: "RadioView",
      choices: choices.map((choice: string | number) => ({
        label: getLabel(choice),
        value: choice,
      })),
    },
  };
};

export const createTags = (name: string, choices: string[] | number[]) => {
  return {
    type: "array",
    items: {
      type: "string",
    },
    view: {
      name: "AutocompleteView",
      label: name,
      component: "AutocompleteView",
      allow_user_input: true,
      choices: choices.map((choice) => ({
        name: "Choice",
        label: getLabel(choice),
        value: choice,
      })),
    },
  };
};

export const createSelect = (
  name: string,
  choices: string[] | number[],
  type: string = "string"
) => {
  return {
    type,
    view: {
      name: "SelectWidget",
      label: name,
      component: "SelectWidget",
      choices: choices.map((choice) => ({
        name: "Choice",
        label: getLabel(choice),
        value: choice,
      })),
    },
  };
};

export const createCheckbox = (name: string) => {
  return {
    type: "boolean",
    view: {
      name: "CheckboxView",
      label: name,
      component: "CheckboxView",
    },
  };
};

export const createToggle = (name: string) => {
  return {
    type: "boolean",
    view: {
      name: "ToggleView",
      label: name,
      component: "ToggleView",
    },
  };
};

export const createText = (name: string, type: string): SchemaType => {
  return {
    type,
    view: {
      name: "TextWidget",
      component: "TextWidget",
      label: name,
    },
  };
};

export const createDatePicker = (
  name: string,
  dateOnly: boolean
): SchemaType => {
  return {
    type: "string",
    view: {
      name: "DatePickerView",
      component: "DatePickerView",
      label: name,
      date_only: dateOnly,
    },
  };
};

export const createJsonInput = (name: string): SchemaType => {
  return {
    type: "string",
    view: {
      name: "JsonEditorView",
      component: "JsonEditorView",
      label: name,
    },
  };
};

/**
 * Creates an array schema for numeric lists: list<float> and list<int>
 */
export const createNumericList = (
  name: string,
  choices: string[] | number[]
) => {
  return {
    type: "array",
    items: {
      type: "number",
    },
    view: {
      name: "AutocompleteView",
      label: name,
      component: "AutocompleteView",
      allow_user_input: true,
      choices: choices.map((choice) => ({
        name: "Choice",
        label: getLabel(choice),
        value: choice,
      })),
    },
  };
};

/**
 * Ruleset for rendering primitive fields based on their schema
 */
export function generatePrimitiveSchema(
  name: string,
  schema: PrimitiveSchema
): SchemaType | undefined {
  if (schema.readOnly) {
    return createReadOnly(name);
  }

  if (schema.type === "list<float>" || schema.type === "list<int>") {
    return createNumericList(name, schema?.values || []);
  }

  if (schema.type === "list<str>") {
    return createTags(name, schema.values || []);
  }

  if (schema.type === "bool") {
    if (schema.component === "checkbox") {
      return createCheckbox(name);
    }
    return createToggle(name);
  }

  if (schema.type === "str") {
    if (schema.component === "dropdown") {
      return createSelect(name, schema.values || []);
    } else if (schema.component === "radio") {
      return createRadio(name, schema.values || []);
    }
    return createText(name, "string");
  }

  if (schema.type === "float" || schema.type === "int") {
    if (schema.component === "slider" && schema.range) {
      return createSlider(name, schema.range);
    } else if (schema.component === "dropdown") {
      return createSelect(name, schema.values || [], "number");
    } else if (schema.component === "radio") {
      return createRadio(name, schema.values || [], "number");
    }
    return createText(name, "number");
  }

  if (schema.type === "date") {
    return createDatePicker(name, true);
  }

  if (schema.type === "datetime") {
    return createDatePicker(name, false);
  }

  if (schema.type === "dict") {
    return createJsonInput(name);
  }

  console.warn(`Unknown schema type: ${schema.type}, ${schema.component}`);
  return createReadOnly(name);
}

/**
 * Special handling for label types that need to be parsed differently.
 * Currently labelSchema will default to text for a label that has no
 * classes. This function remaps this to dropdown (which will have no values).
 * @param component - The label component from the schema
 * @returns The parsed component type
 */
export function parseLabelComponent(component?: ComponentType): ComponentType {
  if (!component) return "dropdown";
  if (component === "text") return "dropdown";
  return component;
}
