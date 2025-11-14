import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";

export interface TranslationResult {
  schema: RJSFSchema;
  uiSchema: UiSchema;
  warnings: string[];
}

export interface TranslationOptions {
  strictMode?: boolean; // If true, throw errors on unsupported features
}

/**
 * Translates a SchemaIO schema to JSON Schema (RJSF) and UI Schema
 */
export function translateSchema(
  schemaIO: SchemaType,
  options: TranslationOptions = {}
): TranslationResult {
  const warnings: string[] = [];
  const context: TranslationContext = {
    warnings,
    path: [],
    strictMode: options.strictMode ?? false,
  };

  const schema = translateToJSONSchema(schemaIO, context);
  const uiSchema = translateToUISchema(schemaIO, context);

  return { schema, uiSchema, warnings };
}

interface TranslationContext {
  warnings: string[];
  path: string[];
  strictMode: boolean;
}

/**
 * Translates SchemaIO type to JSON Schema
 */
function translateToJSONSchema(
  schemaIO: any,
  context: TranslationContext
): RJSFSchema {
  const schema: RJSFSchema = {};
  const { type, default: defaultValue, required } = schemaIO;

  // Handle basic types
  switch (type) {
    case "string":
      schema.type = "string";
      break;
    case "number":
    case "integer":
      schema.type = "number";
      if (schemaIO.min !== undefined) schema.minimum = schemaIO.min;
      if (schemaIO.max !== undefined) schema.maximum = schemaIO.max;
      if (schemaIO.multipleOf !== undefined)
        schema.multipleOf = schemaIO.multipleOf;
      break;
    case "boolean":
      schema.type = "boolean";
      break;
    case "null":
      schema.type = "null";
      break;
    case "object":
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
    case "array":
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
    case "oneOf":
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
 * Translates SchemaIO view to UI Schema
 */
function translateToUISchema(
  schemaIO: any,
  context: TranslationContext
): UiSchema {
  const uiSchema: UiSchema = {};
  const view = schemaIO.view;

  if (!view) return uiSchema;

  const component = view.component || view.name;

  // Handle different view types
  switch (component) {
    case "FieldView":
      // Basic text input - use default RJSF widget
      if (view.placeholder) {
        uiSchema["ui:placeholder"] = view.placeholder;
      }
      if (view.read_only || view.readOnly) {
        uiSchema["ui:readonly"] = true;
      }
      break;

    case "CheckboxView":
      uiSchema["ui:widget"] = "checkbox";
      break;

    case "DropdownView":
    case "Dropdown":
      if (view.choices && Array.isArray(view.choices)) {
        // For dropdowns with choices, we need to set enum in schema
        // but we handle UI representation here
        uiSchema["ui:widget"] = "select";
        if (view.placeholder) {
          uiSchema["ui:placeholder"] = view.placeholder;
        }
      }
      break;

    case "RadioView":
    case "RadioGroup":
      uiSchema["ui:widget"] = "radio";
      break;

    case "AutocompleteView":
      // RJSF doesn't have native autocomplete, map to select or custom widget
      uiSchema["ui:widget"] = "select";
      addWarning(
        context,
        `AutocompleteView mapped to select widget at: ${context.path.join(".")}`
      );
      break;

    case "ColorView":
      uiSchema["ui:widget"] = "color";
      break;

    case "CodeView":
    case "JSONView":
      uiSchema["ui:widget"] = "textarea";
      uiSchema["ui:options"] = {
        rows: 10,
      };
      addWarning(
        context,
        `${component} mapped to textarea at: ${context.path.join(
          "."
        )}. Consider custom widget for syntax highlighting.`
      );
      break;

    case "FileView":
      uiSchema["ui:widget"] = "file";
      addWarning(
        context,
        `FileView may require custom widget configuration at: ${context.path.join(
          "."
        )}`
      );
      break;

    case "TabsView":
      uiSchema["ui:widget"] = "radio";
      if (view.variant) {
        uiSchema["ui:options"] = { inline: true };
      }
      addWarning(
        context,
        `TabsView mapped to radio buttons at: ${context.path.join(".")}`
      );
      break;

    case "ObjectView":
      // Handle object properties recursively
      if (schemaIO.properties) {
        for (const [key, value] of Object.entries(schemaIO.properties)) {
          const propContext = {
            ...context,
            path: [...context.path, key],
          };
          uiSchema[key] = translateToUISchema(value, propContext);
        }
      }
      break;

    case "ListView":
      // Array list view
      if (schemaIO.items && !Array.isArray(schemaIO.items)) {
        uiSchema.items = translateToUISchema(schemaIO.items, {
          ...context,
          path: [...context.path, "items"],
        });
      }
      break;

    case "TupleView":
      // Tuple view with fixed items
      if (schemaIO.items && Array.isArray(schemaIO.items)) {
        uiSchema.items = schemaIO.items.map((item: any, index: number) =>
          translateToUISchema(item, {
            ...context,
            path: [...context.path, `items[${index}]`],
          })
        );
      }
      break;

    case "MapView":
      // Key-value pairs
      uiSchema["ui:options"] = {
        addable: true,
        orderable: false,
        removable: true,
      };
      addWarning(
        context,
        `MapView requires custom implementation at: ${context.path.join(".")}`
      );
      break;

    case "OneOfView":
      // Handle oneOf selector
      if (schemaIO.types) {
        uiSchema["ui:options"] = {
          discriminator: true,
        };
      }
      break;

    case "ProgressView":
    case "LinkView":
    case "DashboardView":
    case "FileExplorerView":
    case "LazyFieldView":
    case "MenuView":
    case "ButtonView":
    case "NoticeView":
    case "MarkdownView":
    case "PlotlyView":
      // These are custom SchemaIO components without direct RJSF equivalents
      addWarning(
        context,
        `Custom component "${component}" requires custom widget implementation at: ${context.path.join(
          "."
        )}`
      );
      break;
  }

  // Handle common view properties
  if (view.read_only || view.readOnly) {
    uiSchema["ui:readonly"] = true;
  }

  if (view.placeholder) {
    uiSchema["ui:placeholder"] = view.placeholder;
  }

  // Add help text from caption or description
  if (view.caption) {
    uiSchema["ui:help"] = view.caption;
  } else if (view.description && !uiSchema["ui:help"]) {
    uiSchema["ui:help"] = view.description;
  }

  // Hide submit button by default
  uiSchema["ui:submitButtonOptions"] = {
    norender: true,
  };

  return uiSchema;
}

/**
 * Helper to add warnings
 */
function addWarning(context: TranslationContext, message: string) {
  context.warnings.push(message);
  if (context.strictMode) {
    throw new Error(message);
  }
}

/**
 * Post-processes JSON Schema to add enum/enumNames from choices
 */
export function addChoicesToSchema(
  schema: RJSFSchema,
  schemaIO: any
): RJSFSchema {
  const view = schemaIO.view;

  if (view?.choices && Array.isArray(view.choices)) {
    schema.enum = view.choices.map((choice: any) => choice.value);
    schema.enumNames = view.choices.map(
      (choice: any) => choice.label || choice.value
    );
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

/**
 * Complete translation with choice processing
 */
export function translateSchemaComplete(
  schemaIO: SchemaType,
  options: TranslationOptions = {}
): TranslationResult {
  const result = translateSchema(schemaIO, options);
  result.schema = addChoicesToSchema(result.schema, schemaIO);
  return result;
}

/**
 * Converts SchemaIO data format to RJSF formData format
 *
 * SchemaIO may use null for empty values, while RJSF expects actual empty values
 * (empty strings, empty arrays, etc.)
 */
export function convertSchemaIODataToRJSF(data: any, schema: SchemaType): any {
  if (data === null || data === undefined) {
    // Return appropriate empty value based on schema type
    return getEmptyValueForType(schema.type);
  }

  const { type } = schema;

  switch (type) {
    case "object":
      if (typeof data !== "object" || Array.isArray(data)) {
        return {};
      }

      const result: any = {};
      if (schema.properties) {
        // Process each property recursively
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in data) {
            result[key] = convertSchemaIODataToRJSF(
              data[key],
              propSchema as SchemaType
            );
          }
        }
      } else {
        // No schema properties defined, copy data as-is
        Object.assign(result, data);
      }
      return result;

    case "array":
      if (!Array.isArray(data)) {
        return [];
      }

      if (schema.items) {
        // Handle tuple-style arrays (items is an array)
        if (Array.isArray(schema.items)) {
          return data.map((item, index) => {
            const itemSchema = schema.items[index] || schema.items[0];
            return convertSchemaIODataToRJSF(item, itemSchema);
          });
        } else {
          // Regular array with single item type
          return data.map((item) =>
            convertSchemaIODataToRJSF(item, schema.items as SchemaType)
          );
        }
      }
      return data;

    case "oneOf":
      // For oneOf, we can't know which schema to use without examining the data
      // Return data as-is and let RJSF handle it
      return data;

    case "string":
    case "number":
    case "boolean":
    case "integer":
    default:
      // For primitive types, return the value as-is
      // null will be converted to appropriate empty value by caller
      return data;
  }
}

/**
 * Converts RJSF formData back to SchemaIO data format
 *
 * RJSF may have empty strings/arrays, which SchemaIO expects as null
 * (depending on context and user interaction)
 */
export function convertRJSFDataToSchemaIO(
  formData: any,
  schema: SchemaType,
  options: { coerceEmpty?: boolean } = {}
): any {
  const { coerceEmpty = false } = options;

  if (formData === null || formData === undefined) {
    return null;
  }

  const { type } = schema;

  switch (type) {
    case "object":
      if (typeof formData !== "object" || Array.isArray(formData)) {
        return null;
      }

      const result: any = {};
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in formData) {
            result[key] = convertRJSFDataToSchemaIO(
              formData[key],
              propSchema as SchemaType,
              options
            );
          }
        }
      } else {
        Object.assign(result, formData);
      }
      return Object.keys(result).length > 0 ? result : null;

    case "array":
      if (!Array.isArray(formData)) {
        return null;
      }

      // Coerce empty arrays to null if requested
      if (coerceEmpty && formData.length === 0) {
        return null;
      }

      if (schema.items) {
        if (Array.isArray(schema.items)) {
          return formData.map((item, index) => {
            const itemSchema = schema.items[index] || schema.items[0];
            return convertRJSFDataToSchemaIO(item, itemSchema, options);
          });
        } else {
          return formData.map((item) =>
            convertRJSFDataToSchemaIO(item, schema.items as SchemaType, options)
          );
        }
      }
      return formData;

    case "string":
      // Coerce empty strings to null if requested
      if (coerceEmpty && formData === "") {
        return null;
      }
      return formData;

    case "number":
    case "boolean":
    case "integer":
    default:
      return formData;
  }
}

/**
 * Helper to get empty value for a given type
 */
function getEmptyValueForType(type: string): any {
  switch (type) {
    case "string":
      return "";
    case "number":
    case "integer":
      return undefined;
    case "boolean":
      return false;
    case "object":
      return {};
    case "array":
      return [];
    case "null":
      return null;
    default:
      return undefined;
  }
}
