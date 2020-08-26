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

export const METADATA_FIELDS = [
  { name: "Size (bytes)", key: "size_bytes" },
  { name: "Type", key: "mime_type" },
  {
    name: "Dimensions",
    value: (metadata) => {
      if (!isNaN(metadata.width) && !isNaN(metadata.height)) {
        return `${metadata.width} x ${metadata.height}`;
      }
    },
  },
  { name: "Channels", key: "num_channels" },
];

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

export const formatMetadata = (metadata) => {
  if (!metadata) {
    return [];
  }
  return METADATA_FIELDS.map((field) => ({
    name: field.name,
    value: field.value ? field.value(metadata) : metadata[field.key],
  })).filter(({ value }) => value !== undefined);
};
