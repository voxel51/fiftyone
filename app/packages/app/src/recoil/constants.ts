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

export const HEATMAP = "Heatmap";
export const VALID_CLASS_TYPES = ["Classification", "Classifications"];
export const VALID_MASK_TYPES = ["Heatmap", "Segmentation"];
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

export const LABEL_LISTS = [
  "Classifications",
  "Detections",
  "Keypoints",
  "Polylines",
  "TemporalDetections",
];

export const LABEL_LIST = {
  Classifications: "classifications",
  Detections: "detections",
  Keypoints: "keypoints",
  Polylines: "polylines",
  TemporalDetections: "detections",
};

export const LABEL_DOC_TYPES = VALID_LABEL_TYPES.filter(
  (label) => !LABEL_LISTS.includes(label)
);

export const AGGS = {
  BOUNDS: "Bounds",
  COUNT: "Count",
  COUNT_VALUES: "CountValues",
  DISTINCT: "Distinct",
};

export const BOOLEAN_FIELD = "fiftyone.core.fields.BooleanField";
export const DATE_FIELD = "fiftyone.core.fields.DateField";
export const DATE_TIME_FIELD = "fiftyone.core.fields.DateTimeField";
export const EMBEDDED_DOCUMENT_FIELD =
  "fiftyone.core.fields.EmbeddedDocumentField";
export const FLOAT_FIELD = "fiftyone.core.fields.FloatField";
export const FRAME_NUMBER_FIELD = "fiftyone.core.fields.FrameNumberField";
export const FRAME_SUPPORT_FIELD = "fiftyone.core.fields.FrameSupportField";
export const INT_FIELD = "fiftyone.core.fields.IntField";
export const OBJECT_ID_FIELD = "fiftyone.core.fields.ObjectIdField";
export const STRING_FIELD = "fiftyone.core.fields.StringField";
export const LIST_FIELD = "fiftyone.core.fields.ListField";

export const VALID_LIST_FIELDS = [FRAME_SUPPORT_FIELD, LIST_FIELD];

export const VALID_PRIMITIVE_TYPES = [
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
];

export const VALID_NUMERIC_TYPES = [
  DATE_FIELD,
  DATE_TIME_FIELD,
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

export const LABELS_PATH = "fiftyone.core.labels";

export function withPath(path: string, types: string): string;
export function withPath(path: string, types: string[]): string[];
export function withPath(
  path: string,
  types: string | string[]
): string | string[] {
  if (Array.isArray(types)) {
    return types.map((type) => [path, type].join("."));
  }

  return [path, types].join(".");
}

export const LABELS = withPath(LABELS_PATH, VALID_LABEL_TYPES);
