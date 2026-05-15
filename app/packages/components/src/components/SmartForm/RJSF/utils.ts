import { RJSFValidationError, UiSchema } from "@rjsf/utils";

/**
 * Filter out empty arrays that weren't in the original data
 * i.e. don't add `tags: []` if `tags` does not already exist on props.data
 */
export function filterEmptyArrays(
  formData: Record<string, unknown>,
  originalData: Record<string, unknown>
) {
  const filteredData = { ...formData };
  Object.entries(filteredData).forEach(([key, value]) => {
    if (!(key in originalData) && Array.isArray(value) && value.length === 0) {
      delete filteredData[key];
    }
  });
  return filteredData;
}

function isWidgetPath(
  property: string,
  uiSchema: UiSchema,
  widget: string
): boolean {
  if (!property) return false;
  // property is in RJSF form has a leading dot, remove it
  const propertyPath = property.replace(/^\./, "");
  const node = uiSchema[propertyPath];
  return node && node["ui:widget"] === widget;
}

function isJsonEditorWidgetPath(property: string, uiSchema: UiSchema): boolean {
  return isWidgetPath(property, uiSchema, "JsonEditorWidget");
}

function isLabelValueWidgetPath(property: string, uiSchema: UiSchema): boolean {
  return isWidgetPath(property, uiSchema, "LabelValueWidget");
}

export function transformErrors(
  errors: RJSFValidationError[],
  uiSchema?: UiSchema,
  formData?: Record<string, unknown>
) {
  const filteredErrors = errors.filter((error) => {
    // Drop type/enum errors whose value is null
    if (
      formData &&
      (error.name === "type" || error.name === "enum") &&
      _valueAt(formData, error.property) === null
    ) {
      return false;
    }
    if (!uiSchema) return true; // can't filter without the schema
    // We don't need to show validation errors on read-only fields.
    if (isLabelValueWidgetPath(error?.property ?? "", uiSchema)) {
      return false;
    }
    // JSON editor controls its own validation errors
    if (isJsonEditorWidgetPath(error?.property ?? "", uiSchema)) {
      return false;
    }
    return true;
  });

  return filteredErrors.map((error) => {
    if (error.name === "enum") {
      error.message = "The current value does not exist in the schema.";
    }
    return error;
  });
}

function _valueAt(data: Record<string, unknown>, property?: string): unknown {
  if (!property) return undefined;
  const path = property.replace(/^\./, "").split(".");
  let value: unknown = data;
  for (const key of path) {
    if (value === null || value === undefined) return value;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
