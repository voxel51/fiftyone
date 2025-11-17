import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import {
  type TranslationResult,
  type TranslationOptions,
  type TranslationContext,
} from "./utils";
import { translateToJSONSchema, addChoicesToSchema } from "./schema";
import { translateToUISchema } from "./ui";

// Re-export types and utilities
export type {
  TranslationResult,
  TranslationOptions,
  TranslationContext,
};
export { addWarning, getEmptyValueForType } from "./utils";

// Re-export translator functions
export { translateToJSONSchema, addChoicesToSchema } from "./schema";
export { translateToUISchema } from "./ui";
export {
  convertSchemaIODataToRJSF,
  convertRJSFDataToSchemaIO,
} from "./data";

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
