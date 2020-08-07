export const VALID_LABEL_TYPES = [
  "Classification",
  "BooleanAttribute",
  "CategoricalAttribute",
  "Detection",
];

export const VALID_SCALAR_TYPES = ["NumericAttribute"];

export const getLabelText = (label) => {
  if (
    !label._cls ||
    !(
      VALID_LABEL_TYPES.includes(label._cls) ||
      VALID_SCALAR_TYPES.includes(label._cls)
    )
  ) {
    return undefined;
  }
  let value = undefined;
  for (const prop of ["label", "value"]) {
    if (label.hasOwnProperty(prop)) {
      value = label[prop];
      break;
    }
  }
  if (value === undefined) {
    return undefined;
  }
  if (typeof value == "number") {
    value = Number(value.toFixed(3));
  }
  return String(value);
};
