import type {
  NumberSchemaType,
  SchemaType,
} from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import { BOOLEAN_FIELD, STRING_FIELD } from "@fiftyone/utilities";

export interface PrimitiveSchema {
  type: string;
  component?: string;
  choices?: unknown[];
  values?: string[];
  range?: [number, number];
}

const getLabel = (value?: string) => {
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  if (value === null || value === undefined) {
    return "None";
  }

  return value;
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

export const createSlider = (name: string, range: [number, number]) => {
  return {
    type: "number",
    min: range[0],
    max: range[1],
    view: {
      name: "SliderView",
      label: name,
      component: "SliderView",
    },
  };
};

export const createRadio = (name: string, choices: unknown[]) => {
  return {
    type: "string",
    view: {
      name: "RadioGroup",
      label: name,
      component: "RadioView",
      choices: choices.map((choice: unknown) => ({
        label: getLabel(choice as string),
        value: choice,
      })),
    },
  };
};

export const createTags = (name: string, choices: string[]) => {
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
    required: true,
  };
};

export const createSelect = (name: string, choices: string[]) => {
  return {
    type: "string",
    view: {
      name: "DropdownView",
      label: name,
      component: "DropdownView",
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

/**
 * Creates an array schema for numeric lists (float_list, int_list)
 */
export const createNumericList = (name: string, choices: string[]) => {
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
    required: true,
  };
};

/**
 * Ruleset for rendering primitive fields based on their schema
 */
export function parsePrimitiveSchema(
  name: string,
  schema: PrimitiveSchema
): SchemaType | undefined {
  if (schema.type === "list<float>" || schema.type === "list<int>") {
    return createNumericList(name, schema.values || []);
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
    if (schema.range) {
      return createSlider(name, schema.range);
    }
    return createText(name, "number");
  }
  return undefined;
}
