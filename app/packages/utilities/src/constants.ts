export const POLYLINE_FIELD = "fiftyone.core.labels.Polyline";
export const POLYLINES_FIELD = "fiftyone.core.labels.Polylines";
export const GEO_LOCATIONS_FIELD = "fiftyone.core.labels.GeoLocations";
export const GEO_LOCATION_FIELD = "fiftyone.core.labels.GeoLocation";
export const SEGMENTATION_FIELD = "fiftyone.core.labels.Segmentation";
export const PANOPTIC_SEGMENTATION_FIELD =
  "fiftyone.core.labels.PanopticSegmentation";
export const HEATMAP_FIELD = "fiftyone.core.labels.Heatmap";
export const CLASSIFICATION_FIELD = "fiftyone.core.labels.Classification";
export const CLASSIFICATIONS_FIELD = "fiftyone.core.labels.Classifications";
export const DETECTION_FIELD = "fiftyone.core.labels.Detection";
export const DETECTIONS_FIELD = "fiftyone.core.labels.Detections";
export const TEMPORAL_DETECTION_FIELD =
  "fiftyone.core.labels.TemporalDetection";
export const TEMPORAL_DETECTIONS_FIELD =
  "fiftyone.core.labels.TemporalDetections";
export const ARRAY_FIELD = "fiftyone.core.fields.ArrayField";
export const BOOLEAN_FIELD = "fiftyone.core.fields.BooleanField";
export const DATE_FIELD = "fiftyone.core.fields.DateField";
export const DATE_TIME_FIELD = "fiftyone.core.fields.DateTimeField";
export const DICT_FIELD = "fiftyone.core.fields.DictField";
export const EMBEDDED_DOCUMENT_FIELD =
  "fiftyone.core.fields.EmbeddedDocumentField";
export const DYNAMIC_EMBEDDED_DOCUMENT_FIELD =
  "fiftyone.core.fields.DynamicEmbeddedDocumentField";
export const DYNAMIC_EMBEDDED_DOCUMENT_PATH =
  "fiftyone.core.odm.embedded_document.DynamicEmbeddedDocument";
export const FLOAT_FIELD = "fiftyone.core.fields.FloatField";
export const FRAME_NUMBER_FIELD = "fiftyone.core.fields.FrameNumberField";
export const FRAME_SUPPORT_FIELD = "fiftyone.core.fields.FrameSupportField";
export const INT_FIELD = "fiftyone.core.fields.IntField";
export const OBJECT_ID_FIELD = "fiftyone.core.fields.ObjectIdField";
export const STRING_FIELD = "fiftyone.core.fields.StringField";
export const LIST_FIELD = "fiftyone.core.fields.ListField";
export const JUST_FIELD = "fiftyone.core.fields.Field";
export const VECTOR_FIELD = "fiftyone.core.fields.VectorField";
export const DETECTION_FILED = "fiftyone.core.labels.Detection";
export const KEYPOINT_FIELD = "fiftyone.core.labels.Keypoint";
export const KEYPOINTS_FIELD = "fiftyone.core.labels.Keypoints";
export const KEYPOINTS_POINTS_FIELD = "fiftyone.core.fields.KeypointsField";
export const REGRESSION_FIELD = "fiftyone.core.labels.Regression";
export const GROUP = "fiftyone.core.groups.Group";
export const BOOK_A_DEMO_LINK = "https://voxel51.com/book-a-demo/";
export const TRY_IN_BROWSER_LINK = "https://voxel51.com/try-fiftyone/";
export const APP_MODE = "fiftyone";
export const IS_APP_MODE_FIFTYONE = APP_MODE === "fiftyone";
export const NONFINITES = new Set(["-inf", "inf", "nan"]);

export const CLASSIFICATION = "Classification";
export const CLASSIFICATIONS = "Classifications";
export const DYNAMIC_EMBEDDED_DOCUMENT = "DynamicEmbeddedDocument";
export const EMBEDDED_DOCUMENT = "EmbeddedDocument";
export const DETECTION = "Detection";
export const DETECTIONS = "Detections";
export const GEOLOCATION = "GeoLocation";
export const GEOLOCATIONS = "GeoLocations";
export const HEATMAP = "Heatmap";
export const KEYPOINT = "Keypoint";
export const KEYPOINTS = "Keypoints";
export const PANOPTIC_SEGMENTATION = "PanopticSegmentation";
export const POLYLINE = "Polyline";
export const POLYLINES = "Polylines";
export const REGRESSION = "Regression";
export const SEGMENTATION = "Segmentation";
export const TEMPORAL_DETECTION = "TemporalDetection";
export const TEMPORAL_DETECTIONS = "TemporalDetections";

export const LABEL_LISTS_MAP = {
  [CLASSIFICATIONS]: "classifications",
  [DETECTIONS]: "detections",
  [KEYPOINTS]: "keypoints",
  [POLYLINES]: "polylines",
  [TEMPORAL_DETECTIONS]: "detections",
};

const RESERVED_FIELD_KEYS_MAP = {
  tags: "tags",
  filepath: "filepath",
  sampleID: "sample_id",
};

export const RESERVED_FIELD_KEYS = Object.values(RESERVED_FIELD_KEYS_MAP);

export const LABELS_MAP = {
  [CLASSIFICATION]: CLASSIFICATION,
  [CLASSIFICATIONS]: CLASSIFICATIONS,
  [DETECTION]: DETECTION,
  [DETECTIONS]: DETECTIONS,
  [GEOLOCATION]: GEOLOCATION,
  [GEOLOCATIONS]: GEOLOCATIONS,
  [HEATMAP]: HEATMAP,
  [KEYPOINT]: KEYPOINT,
  [KEYPOINTS]: KEYPOINTS,
  [PANOPTIC_SEGMENTATION]: PANOPTIC_SEGMENTATION,
  [POLYLINE]: POLYLINE,
  [POLYLINES]: POLYLINES,
  [SEGMENTATION]: SEGMENTATION,
  [REGRESSION]: REGRESSION,
  [TEMPORAL_DETECTION]: TEMPORAL_DETECTION,
  [TEMPORAL_DETECTIONS]: TEMPORAL_DETECTIONS,
};

export const MASK_LABELS = new Set([DETECTION, SEGMENTATION]);

// defined as labels that can have on-disk overlays
export const DENSE_LABELS = new Set([
  DETECTION,
  DETECTIONS,
  HEATMAP,
  PANOPTIC_SEGMENTATION,
  SEGMENTATION,
]);

export const VALID_OBJECT_TYPES = [
  DETECTION,
  DETECTIONS,
  KEYPOINT,
  KEYPOINTS,
  POLYLINE,
  POLYLINES,
  TEMPORAL_DETECTION,
  TEMPORAL_DETECTIONS,
];

export const VALID_CLASS_TYPES = ["Classification", "Classifications"];
export const VALID_MASK_TYPES = [
  "Heatmap",
  "PanopticSegmentation",
  "Segmentation",
];
export const VALID_LIST_TYPES = [
  "Classifications",
  "Detections",
  "Keypoints",
  "Polylines",
  "TemporalDetections",
];

export const VALID_LABEL_TYPES = [
  ...VALID_CLASS_TYPES,
  ...VALID_OBJECT_TYPES,
  ...VALID_MASK_TYPES,
  "Regression",
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

export const LABEL_LIST_PATH = Object.fromEntries(
  Object.entries(LABEL_LIST).map(([docType, field]) => [
    withPath("fiftyone.core.labels", docType),
    field,
  ])
);

export const NOT_VISIBLE_LIST = [
  "DictField",
  "ArrayField",
  "VectorField",
  "FrameNumberField",
];

export const LABEL_DOC_TYPES = VALID_LABEL_TYPES.filter(
  (label) => !LABEL_LISTS.includes(label)
);

export const AGGS = {
  BOUNDS: "Bounds",
  COUNT: "Count",
  COUNT_VALUES: "CountValues",
  DISTINCT: "Distinct",
};

export const VALID_LIST_FIELDS = [FRAME_SUPPORT_FIELD, LIST_FIELD];

export const VALID_NON_LIST_LABEL_TYPES = [
  CLASSIFICATION_FIELD,
  DETECTION_FIELD,
  GEO_LOCATION_FIELD,
  KEYPOINT_FIELD,
  HEATMAP_FIELD,
  PANOPTIC_SEGMENTATION_FIELD,
  POLYLINE_FIELD,
  REGRESSION_FIELD,
  SEGMENTATION_FIELD,
  TEMPORAL_DETECTION_FIELD,
];

export const VALID_LIST_LABEL_FIELDS = [
  DETECTIONS_FIELD,
  CLASSIFICATIONS_FIELD,
  KEYPOINTS_FIELD,
  TEMPORAL_DETECTIONS_FIELD,
  GEO_LOCATIONS_FIELD,
  POLYLINES_FIELD,
];

export const DISABLED_LABEL_FIELDS_VISIBILITY = [
  ...VALID_NON_LIST_LABEL_TYPES,
  ...VALID_LIST_LABEL_FIELDS,
];

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

export const VALID_DISTRIBUTION_TYPES = [
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
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

// list fields may not have a subfield type, so null, undefined is included
export const UNSUPPORTED_FILTER_TYPES = [
  ARRAY_FIELD,
  DICT_FIELD,
  VECTOR_FIELD,
  null,
  undefined,
];

export const SKIP_FIELD_TYPES = [...UNSUPPORTED_FILTER_TYPES, JUST_FIELD];

export const DYNAMIC_GROUP_FIELDS = [
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  INT_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
];

export const LABELS_PATH = "fiftyone.core.labels";

export const PATCHES_FIELDS = withPath(LABELS_PATH, [
  "Detections",
  "Polylines",
]);
export const CLIPS_SAMPLE_FIELDS = withPath(LABELS_PATH, [
  "TemporalDetections",
]);
export const CLIPS_FRAME_FIELDS = withPath(LABELS_PATH, [
  "Classifications",
  "Detections",
  "Keypoints",
  "Polylines",
]);

export const DISABLED_PATHS = ["id", "filepath", "tags", "metadata"];

const BASE_DISABLED_PATHS = ["id", "tags", "label", "confidence"];

export const DETECTION_DISABLED_SUB_PATHS = [
  ...BASE_DISABLED_PATHS,
  "bounding_box",
  "mask",
  "index",
];

export const POLYLINE_DISABLED_SUB_PATHS = [
  ...BASE_DISABLED_PATHS,
  "points",
  "closed",
  "filled",
  "index",
];

export const CLASSIFICATION_DISABLED_SUB_PATHS = [
  ...BASE_DISABLED_PATHS,
  "logits",
];

export const REGRESSION_DISABLED_SUB_PATHS = [
  "id",
  "tags",
  "value",
  "confidence",
];

export const KEYPOINT_DISABLED_SUB_PATHS = [
  ...BASE_DISABLED_PATHS,
  "points",
  "index",
];

export const PANOPTIC_SEGMENTATION_DISABLED_SUB_PATHS = [
  "id",
  "tags",
  "mask",
  "mask_path",
];

export const SEGMENTATION_DISABLED_SUB_PATHS = [
  "id",
  "tags",
  "mask",
  "mask_path",
];

export const HEATMAP_DISABLED_SUB_PATHS = [
  "id",
  "tags",
  "map",
  "map_path",
  "range",
];

export const TEMPORAL_DETECTION_DISABLED_SUB_PATHS = [
  ...BASE_DISABLED_PATHS,
  "support",
];

export const GEOLOCATION_DISABLED_SUB_PATHS = [
  "id",
  "tags",
  "point",
  "line",
  "polygon",
];

export const GEOLOCATIONS_DISABLED_SUB_PATHS = [
  "id",
  "tags",
  "point",
  "line",
  "polygons",
];
export const BUILT_IN_PANEL_PRIORITY_CONST = 51000;

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
export const VALID_KEYPOINTS = withPath(LABELS_PATH, [KEYPOINT, KEYPOINTS]);
