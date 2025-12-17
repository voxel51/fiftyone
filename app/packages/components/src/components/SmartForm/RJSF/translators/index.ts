import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import {
  type TranslationResult,
  type TranslationOptions,
  type TranslationContext,
} from "./utils";
import { translateToJSONSchema, addChoicesToSchema } from "./schema";
import { translateToUISchema } from "./ui";

export type { TranslationResult, TranslationOptions, TranslationContext };
export {
  addWarning,
  getEmptyValueForType,
  isSchemaIOSchema,
  isJSONSchema,
} from "./utils";

export { translateToJSONSchema, addChoicesToSchema } from "./schema";
export { translateToUISchema } from "./ui";

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

  const schema = addChoicesToSchema(
    translateToJSONSchema(schemaIO, context),
    schemaIO
  );
  const uiSchema = translateToUISchema(schemaIO, context);

  return { schema, uiSchema, warnings };
}
