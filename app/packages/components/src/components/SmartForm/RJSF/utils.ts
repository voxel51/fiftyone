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

function isJsonEditorWidgetPath(property: string, uiSchema: UiSchema): boolean {
  if (!property) return false;
  // property is in RJSF form has a leading dot, remove it
  const propertyPath = property.replace(/^\./, "");
  const node = uiSchema[propertyPath];
  return node && node["ui:widget"] === "JsonEditorWidget";
}

export function transformErrors(
  errors: RJSFValidationError[],
  uiSchema?: UiSchema
) {
  const filteredErrors = errors.filter((error) => {
    if (!uiSchema) return true; // can't filter without the schema
    // JSON editor controls its own validation errors
    return !isJsonEditorWidgetPath(error?.property ?? "", uiSchema);
  });

  return filteredErrors.map((error) => {
    if (error.name === "enum") {
      error.message = "The current value does not exist in the schema.";
    }
    return error;
  });
}
