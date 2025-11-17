import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import { getEmptyValueForType } from "./utils";

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
