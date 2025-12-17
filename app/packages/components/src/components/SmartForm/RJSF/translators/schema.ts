import type { RJSFSchema } from "@rjsf/utils";
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import { addWarning, type TranslationContext } from "./utils";
import { SmartFormInputs } from "../../types";

/**
 * Translates SchemaIO type to JSON Schema
 *
 * Note: Uses `any` for schemaIO parameter due to recursive processing of
 * dynamic schema structures with varying shapes.
 */
export function translateToJSONSchema(
  schemaIO: any,
  context: TranslationContext
): RJSFSchema {
  const schema: RJSFSchema = {};
  const { type, default: defaultValue, required } = schemaIO;

  // Handle basic types
  switch (type) {
    case SmartFormInputs.String:
      schema.type = "string";
      break;
    case SmartFormInputs.Number:
    case SmartFormInputs.Integer:
      schema.type = "number";
      if (schemaIO.min !== undefined) schema.minimum = schemaIO.min;
      if (schemaIO.max !== undefined) schema.maximum = schemaIO.max;
      if (schemaIO.multipleOf !== undefined)
        schema.multipleOf = schemaIO.multipleOf;
      break;
    case SmartFormInputs.Boolean:
      schema.type = "boolean";
      break;
    case SmartFormInputs.Null:
      schema.type = "null";
      break;
    case SmartFormInputs.Object:
      schema.type = "object";
      if (schemaIO.properties) {
        schema.properties = {};
        const requiredFields: string[] = [];

        for (const [key, value] of Object.entries(schemaIO.properties)) {
          const propContext = {
            ...context,
            path: [...context.path, key],
          };
          schema.properties[key] = translateToJSONSchema(value, propContext);

          // Collect required fields
          if ((value as any).required === true) {
            requiredFields.push(key);
          }
        }

        if (requiredFields.length > 0) {
          schema.required = requiredFields;
        }
      }

      // Handle additionalProperties (MapView)
      if (schemaIO.additionalProperties) {
        const propContext = {
          ...context,
          path: [...context.path, "additionalProperties"],
        };
        schema.additionalProperties = translateToJSONSchema(
          schemaIO.additionalProperties,
          propContext
        );
      }
      break;
    case SmartFormInputs.Array:
      schema.type = "array";
      if (schemaIO.items) {
        // Handle tuple-style arrays (items is an array)
        if (Array.isArray(schemaIO.items)) {
          schema.items = schemaIO.items.map((item: any, index: number) => {
            const itemContext = {
              ...context,
              path: [...context.path, `items[${index}]`],
            };
            return translateToJSONSchema(item, itemContext);
          });
          schema.minItems = schemaIO.items.length;
          schema.maxItems = schemaIO.items.length;
        } else {
          // Regular array with single item type
          const itemContext = {
            ...context,
            path: [...context.path, "items"],
          };
          schema.items = translateToJSONSchema(schemaIO.items, itemContext);
        }
      }
      break;
    case SmartFormInputs.OneOf:
      if (schemaIO.types && Array.isArray(schemaIO.types)) {
        schema.oneOf = schemaIO.types.map((typeSchema: any, index: number) => {
          const oneOfContext = {
            ...context,
            path: [...context.path, `oneOf[${index}]`],
          };
          return translateToJSONSchema(typeSchema, oneOfContext);
        });
      }
      break;
    default:
      addWarning(
        context,
        `Unsupported type "${type}" at path: ${context.path.join(".")}`
      );
  }

  // Add default value if present
  if (defaultValue !== undefined && defaultValue !== null) {
    schema.default = defaultValue;
  }

  // Add title and description from view
  if (schemaIO.view) {
    if (schemaIO.view.label) {
      schema.title = schemaIO.view.label;
    }
    if (schemaIO.view.description) {
      schema.description = schemaIO.view.description;
    }
  }

  return schema;
}

/**
 * Post-processes JSON Schema to add enum/enumNames from choices
 */
export function addChoicesToSchema(
  schema: RJSFSchema,
  schemaIO: SchemaType
): RJSFSchema {
  const view = schemaIO.view;
  const component = view?.component || view?.name;

  if (view?.choices && Array.isArray(view.choices)) {
    const enumValues = view.choices.map((choice: any) => choice.value);
    const enumNames = view.choices.map(
      (choice: any) => choice.label || choice.value
    );

    // For array types (multi-select AutocompleteView), add items definition
    if (schema.type === "array") {
      if (enumValues.length > 0) {
        schema.items = {
          type: "string",
          enum: enumValues,
          enumNames: enumNames,
        };

        schema.examples = enumValues;
      }
    } else {
      // For non-array types, add enum directly to schema
      schema.enum = enumValues;
      schema.enumNames = enumNames;
    }
  } else if (
    schema.type === "array" &&
    !schema.items &&
    component === "AutocompleteView"
  ) {
    // For AutocompleteView arrays with no choices, add a default string items definition
    // This allows freeSolo mode to work
    schema.items = {
      type: "string",
    };
  }

  // Recursively process properties
  if (schema.type === "object" && schema.properties && schemaIO.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      schema.properties[key] = addChoicesToSchema(
        propSchema as RJSFSchema,
        schemaIO.properties[key]
      );
    }
  }

  // Process array items
  if (schema.type === "array" && schema.items && schemaIO.items) {
    if (Array.isArray(schema.items) && Array.isArray(schemaIO.items)) {
      schema.items = schema.items.map((itemSchema, index) =>
        addChoicesToSchema(itemSchema as RJSFSchema, schemaIO.items[index])
      );
    } else if (!Array.isArray(schema.items) && !Array.isArray(schemaIO.items)) {
      schema.items = addChoicesToSchema(
        schema.items as RJSFSchema,
        schemaIO.items
      );
    }
  }

  return schema;
}
