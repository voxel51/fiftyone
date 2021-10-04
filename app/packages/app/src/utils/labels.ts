export const VALID_OBJECT_TYPES = [
  "Detection",
  "Detections",
  "Keypoint",
  "Keypoints",
  "Polyline",
  "Polylines",
  "TemporalDetection",
  "TemporalDetections",
];

export const VALID_CLASS_TYPES = ["Classification", "Classifications"];
export const VALID_MASK_TYPES = ["Segmentation"];
export const VALID_LIST_TYPES = [
  "Classifications",
  "Detections",
  "Keypoints",
  "Polylines",
  "TemporalDetections",
];

export const PATCHES_FIELDS = ["Detections", "Polylines"];

export const CLIPS_SAMPLE_FIELDS = ["TemporalDetection", "TemporalDetections"];
export const CLIPS_FRAME_FIELDS = [
  "Classifications",
  "Detections",
  "Keypoints",
  "Polylines",
];

export const VALID_LABEL_TYPES = [
  ...VALID_CLASS_TYPES,
  ...VALID_OBJECT_TYPES,
  ...VALID_MASK_TYPES,
];

export const HIDDEN_LABEL_ATTRS = {
  Classification: ["logits"],
  Detection: ["bounding_box", "attributes", "mask"],
  Polyline: ["points", "attributes"],
  Keypoint: ["points", "attributes"],
  Segmentation: ["mask"],
};

export const OBJECT_TYPES = [
  "Detection",
  "Detections",
  "Keypoints",
  "Keypoint",
  "Polylines",
  "Polyline",
];

export const FILTERABLE_TYPES = [
  "Classification",
  "Classifications",
  "Detection",
  "Detections",
  "Keypoints",
  "Keypoint",
  "Polylines",
  "Polyline",
  "TemporalDetection",
  "TemporalDetections",
];

export const CONFIDENCE_LABELS = [
  "Classification",
  "Classifications",
  "Detection",
  "Detections",
  "Keypoint",
  "Keypoints",
  "Polyline",
  "Polylines",
  "TemporalDetection",
  "TemporalDetections",
];

export const SUPPORT_LABELS = ["TemporalDetection", "TemporalDetections"];

export const LABEL_LISTS = [
  "Classifications",
  "Detections",
  "Keypoints",
  "Polylines",
  "TemporalDetections",
];

export const UNSUPPORTED_IMAGE = ["TemporalDetection", "TemporalDetections"];

export const LABEL_LIST = {
  Classifications: "classifications",
  Detections: "detections",
  Keypoints: "keypoints",
  Polylines: "polylines",
  TemporalDetections: "detections",
};

export const AGGS = {
  BOUNDS: "Bounds",
  COUNT: "Count",
  COUNT_VALUES: "CountValues",
  DISTINCT: "Distinct",
};

export const BOOLEAN_FIELD = "fiftyone.core.fields.BooleanField";
export const FLOAT_FIELD = "fiftyone.core.fields.FloatField";
export const FRAME_NUMBER_FIELD = "fiftyone.core.fields.FrameNumberField";
export const FRAME_SUPPORT_FIELD = "fiftyone.core.fields.FrameSupportField";
export const INT_FIELD = "fiftyone.core.fields.IntField";
export const OBJECT_ID_FIELD = "fiftyone.core.fields.ObjectIdField";
export const STRING_FIELD = "fiftyone.core.fields.StringField";
export const LIST_FIELD = "fiftyone.core.fields.ListField";

export const VALID_LIST_FIELDS = [FRAME_SUPPORT_FIELD, LIST_FIELD];

export const VALID_SCALAR_TYPES = [
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
];

export const VALID_NUMERIC_TYPES = [
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
];

export const RESERVED_FIELDS = [
  "_id",
  "_rand",
  "_media_type",
  "metadata",
  "tags",
  "frames",
];
export const RESERVED_DETECTION_FIELDS = [
  "label",
  "index",
  "bounding_box",
  "confidence",
  "attributes",
  "mask",
  "target",
];

export const METADATA_FIELDS = [
  { name: "Size (bytes)", key: "size_bytes" },
  { name: "Type", key: "mime_type" },
  { name: "Media type", key: "_media_type" },
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

export const labelTypeHasColor = (labelType) => {
  return !VALID_MASK_TYPES.includes(labelType);
};

export const labelTypeIsFilterable = (labelType) => {
  return FILTERABLE_TYPES.includes(labelType);
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

  for (let i = 0; i < labelNames.length; i++) {
    const name = labelNames[i];
    const type = labelTypes[i];
    if (VALID_LABEL_TYPES.includes(type)) {
      labelNameGroups.labels.push({ name, type });
    }
  }
  for (const field in fieldSchema) {
    if (RESERVED_FIELDS.includes(field)) {
      continue;
    } else if (labelNames.includes(field)) {
      continue;
    } else if (VALID_SCALAR_TYPES.includes(fieldSchema[field].ftype)) {
      labelNameGroups.scalars.push({ name: field });
    } else {
      labelNameGroups.unsupported.push({ name: field });
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
