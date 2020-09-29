export const VALID_OBJECT_TYPES = ["Detection", "Detections"];
export const VALID_CLASS_TYPES = ["Classification", "Classifications"];
export const VALID_LIST_TYPES = ["Classifications", "Detections"];
export const VALID_LABEL_TYPES = [...VALID_CLASS_TYPES, ...VALID_OBJECT_TYPES];

export const VALID_SCALAR_TYPES = [
  "fiftyone.core.fields.BooleanField",
  "fiftyone.core.fields.FloatField",
  "fiftyone.core.fields.IntField",
  "fiftyone.core.fields.StringField",
];

export const VALID_NUMERIC_TYPES = [
  "fiftyone.core.fields.FloatField",
  "fiftyone.core.fields.IntField",
];

export const RESERVED_FIELDS = [
  "metadata",
  "_id",
  "tags",
  "filepath",
  "frames",
];
export const RESERVED_DETECTION_FIELDS = [
  "label",
  "bounding_box",
  "confidence",
  "attributes",
];

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

export function makeLabelNameGroups(fieldSchema, labelNames, labelTypes) {
  const labelNameGroups = {
    labels: [],
    scalars: [],
    unsupported: [],
  };
  for (const name of labelNames) {
    if (VALID_LABEL_TYPES.includes(labelTypes[name])) {
      labelNameGroups.labels.push({ name, type: labelTypes[name] });
    } else if (VALID_SCALAR_TYPES.includes(fieldSchema[name])) {
      labelNameGroups.scalars.push({ name });
    } else {
      labelNameGroups.unsupported.push({ name });
    }
  }
  return labelNameGroups;
}

export type Attrs = {
  [name: string]: {
    name: string;
    value: string;
  };
};

const _formatAttributes = (obj) =>
  Object.fromEntries(
    Object.entries(obj)
      .filter(
        ([key, value]) =>
          !key.startsWith("_") &&
          !RESERVED_DETECTION_FIELDS.includes(key) &&
          ["string", "number", "boolean"].includes(typeof value)
      )
      .map(([key, value]) => [key, stringify(value)])
  );

export const getDetectionAttributes = (detection: object): Attrs => {
  return {
    ..._formatAttributes(detection),
    ..._formatAttributes(
      Object.fromEntries(
        Object.entries(detection.attributes).map(([key, value]) => [
          key,
          value.value,
        ])
      )
    ),
  };
};

export const convertAttributesToETA = (attrs: Attrs): object[] => {
  return Object.entries(attrs).map(([name, value]) => ({ name, value }));
};

const PARSERS = {
  Classification: [
    "attrs",
    (name, obj) => {
      return {
        type: "eta.core.data.CategoricalAttribute",
        name,
        confidence: obj.confidence,
        value: obj.label,
      };
    },
  ],
  Detection: [
    "objects",
    (name, obj) => {
      const bb = obj.bounding_box;
      const attrs = convertAttributesToETA(getDetectionAttributes(obj));
      return {
        type: "eta.core.objects.DetectedObject",
        name,
        label: `${obj.label}`,
        confidence: obj.confidence,
        bounding_box: bb
          ? {
              top_left: { x: bb[0], y: bb[1] },
              bottom_right: { x: bb[0] + bb[2], y: bb[1] + bb[3] },
            }
          : {
              top_left: { x: 0, y: 0 },
              bottom_right: { x: 0, y: 0 },
            },
        attrs: { attrs },
      };
    },
  ],
};

export const loadOverlay = (sample, fieldSchema) => {
  const imgLabels = { attrs: { attrs: [] }, objects: { objects: [] } };
  const sampleFields = Object.keys(sample).sort();
  for (const sampleField of sampleFields) {
    if (RESERVED_FIELDS.includes(sampleField)) {
      continue;
    }
    const field = sample[sampleField];
    if (field === null || field === undefined) continue;
    if (["Classification", "Detection"].includes(field._cls)) {
      const [key, fn] = PARSERS[field._cls];
      imgLabels[key][key].push(fn(sampleField, field));
    } else if (["Classifications", "Detections"].includes(field._cls)) {
      for (const object of field[field._cls.toLowerCase()]) {
        const [key, fn] = PARSERS[object._cls];
        imgLabels[key][key].push(fn(sampleField, object));
      }
      continue;
    } else if (VALID_SCALAR_TYPES.includes(fieldSchema[sampleField])) {
      imgLabels.attrs.attrs.push({
        name: sampleField,
        value: stringify(field),
      });
    }
  }
  return imgLabels;
};
