import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";

export interface TranslationResult {
  schema: RJSFSchema;
  uiSchema: UiSchema;
  warnings: string[];
  formData?: any;
}

export interface TranslationOptions {
  strictMode?: boolean; // If true, throw errors on unsupported features
}

export interface TranslationContext {
  warnings: string[];
  path: string[];
  strictMode: boolean;
}

export function addWarning(context: TranslationContext, message: string) {
  context.warnings.push(message);

  if (context.strictMode) {
    throw new Error(message);
  }
}

export function getEmptyValueForType(type: string): any {
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

/**
 * Type guard to check if a schema is a SchemaIO schema
 *
 * SchemaIO schemas always have a `view` property, while JSON Schemas do not.
 */
export function isSchemaIOSchema(schema: any): schema is SchemaType {
  return (
    schema !== null &&
    typeof schema === "object" &&
    "view" in schema &&
    "type" in schema
  );
}

/**
 * Type guard to check if a schema is a JSON Schema (RJSF)
 */
export function isJSONSchema(schema: any): schema is RJSFSchema {
  return (
    schema !== null &&
    typeof schema === "object" &&
    "type" in schema &&
    !("view" in schema)
  );
}
