import type { RJSFSchema, UiSchema } from "@rjsf/utils";

export interface TranslationResult {
  schema: RJSFSchema;
  uiSchema: UiSchema;
  warnings: string[];
}

export interface TranslationOptions {
  strictMode?: boolean; // If true, throw errors on unsupported features
}

export interface TranslationContext {
  warnings: string[];
  path: string[];
  strictMode: boolean;
}

/**
 * Helper to add warnings
 */
export function addWarning(context: TranslationContext, message: string) {
  context.warnings.push(message);
  if (context.strictMode) {
    throw new Error(message);
  }
}

/**
 * Helper to get empty value for a given type
 */
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
