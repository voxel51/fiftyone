export const VALID_OBJECT_TYPES = ["Detection", "Detections"];
export const VALID_CLASS_TYPES = ["Classification", "Classifications"];
export const VALID_LABEL_TYPES = [...VALID_CLASS_TYPES, ...VALID_OBJECT_TYPES];

export const VALID_SCALAR_TYPES = [
  "fiftyone.core.fields.BooleanField",
  "fiftyone.core.fields.FloatField",
  "fiftyone.core.fields.IntField",
  "fiftyone.core.fields.StringField",
];

export const RESERVED_FIELDS = ["metadata", "_id", "tags", "filepath"];

export const stringify = (value) => {
  if (typeof value == "number") {
    value = Number(value.toFixed(3));
  }
  return String(value);
};

export const getLabelText = (label) => {
  if (
    !label._cls ||
    !(
      VALID_LABEL_TYPES.includes(label._cls) ||
      VALID_SCALAR_TYPES.includes(label._cls)
    ) ||
    VALID_OBJECT_TYPES.includes(label._cls)
  ) {
    return undefined;
  }
  if (label._cls == "Classifications") {
    return label.classifications.map(getLabelText).join(", ");
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
  return stringify(value);
};
