export function getSubsetDef(scenario, subset) {
  const { type, field, subsets_code } = scenario;
  if (type === "view") {
    return { type, view: subset };
  } else if (type === "sample_field") {
    return { type: "field", field, value: subset };
  } else if (type === "label_attribute" && typeof field === "string") {
    // todo: may want to move this to backend for single place of parsing
    const fieldParts = field.split(".");
    const fieldName = fieldParts[fieldParts.length - 1];
    return { type: "attribute", field: fieldName, value: subset };
  } else if (type === "custom_code") {
    return { type, code: subsets_code, subset };
  }
}
