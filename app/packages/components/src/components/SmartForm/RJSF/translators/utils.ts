import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import type {
  SchemaType,
  SchemaViewType,
} from "@fiftyone/core/src/plugins/SchemaIO/utils/types";

export type JSONValue = NonNullable<RJSFSchema["default"]>;

/**
 * The parts of a SchemaIO schema the translators read. Views carry
 * component-specific keys, so they keep SchemaIO's open view type.
 */
/** The SchemaIO view keys the SmartForm translators read. */
export type SmartFormView = SchemaViewType & {
  component?: string;
  name?: string;
  label?: string;
  description?: string;
  caption?: string;
  placeholder?: string;
  choices?: { value: JSONValue; label?: string }[];
  taxonomy?: object;
  multiple?: boolean;
  multiSelect?: boolean;
  compact?: boolean;
  color?: string;
  variant?: string;
  orientation?: string;
  align_x?: string;
  align_y?: string;
  gap?: number | string;
  height?: number | string;
  bare?: boolean;
  labeled?: boolean;
  date_only?: boolean;
  allow_clearing?: boolean;
  allow_duplicates?: boolean;
  allow_user_input?: boolean;
  minLabel?: string;
  maxLabel?: string;
  read_only?: boolean;
  readOnly?: boolean;
};

export type SchemaIONode = {
  type?: string;
  default?: unknown;
  required?: boolean;
  min?: number;
  max?: number;
  multipleOf?: number;
  properties?: Record<string, SchemaIONode>;
  additionalProperties?: SchemaIONode;
  items?: SchemaIONode | SchemaIONode[];
  types?: SchemaIONode[];
  view?: SmartFormView;
};

export interface TranslationResult {
  schema: RJSFSchema;
  uiSchema: UiSchema;
  warnings: string[];
  formData?: unknown;
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

export function getEmptyValueForType(type: string): unknown {
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
export function isSchemaIOSchema(schema: unknown): schema is SchemaType {
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
export function isJSONSchema(schema: unknown): schema is RJSFSchema {
  return (
    schema !== null &&
    typeof schema === "object" &&
    "type" in schema &&
    !("view" in schema)
  );
}
