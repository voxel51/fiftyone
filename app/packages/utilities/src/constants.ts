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

/** APP CONSTANTS **/

export const APP_MODE = "fiftyone";
export const BOOK_A_DEMO_LINK = "https://voxel51.com/book-a-demo/";
export const BUILT_IN_PANEL_PRIORITY_CONST = 51000;
export const IS_APP_MODE_FIFTYONE = APP_MODE === "fiftyone";
export const LABELS_PATH = "fiftyone.core.labels";
export const NONFINITES = new Set(["-inf", "inf", "nan"]);
export const TRY_IN_BROWSER_LINK = "https://voxel51.com/try-fiftyone/";

/** AGGS */

export const AGGS = {
  BOUNDS: "Bounds",
  COUNT: "Count",
  COUNT_VALUES: "CountValues",
  DISTINCT: "Distinct",
};

/** FIELD STRINGS **/

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
export const KEYPOINTS_POINTS_FIELD = "fiftyone.core.fields.KeypointsField";
export const GROUP = "fiftyone.core.groups.Group";

/** DOCUMENT/LABEL NAME STRINGS **/

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
export const POLYLINE = "Polyline";
export const POLYLINES = "Polylines";
export const REGRESSION = "Regression";
export const SEGMENTATION = "Segmentation";
export const TEMPORAL_DETECTION = "TemporalDetection";
export const TEMPORAL_DETECTIONS = "TemporalDetections";

/** LABEL DOCUMENT TYPE STRINGS **/

export const CLASSIFICATION_LABEL = "fiftyone.core.labels.Classification";
export const CLASSIFICATIONS_LABEL = "fiftyone.core.labels.Classifications";
export const DETECTION_LABEL = "fiftyone.core.labels.Detection";
export const DETECTIONS_LABEL = "fiftyone.core.labels.Detections";
export const GEO_LOCATION_LABEL = "fiftyone.core.labels.GeoLocation";
export const GEO_LOCATIONS_LABEL = "fiftyone.core.labels.GeoLocations";
export const HEATMAP_LABEL = "fiftyone.core.labels.Heatmap";
export const KEYPOINT_LABEL = "fiftyone.core.labels.Keypoint";
export const KEYPOINTS_LABEL = "fiftyone.core.labels.Keypoints";
export const POLYLINE_LABEL = "fiftyone.core.labels.Polyline";
export const POLYLINES_LABEL = "fiftyone.core.labels.Polylines";
export const REGRESSION_FIELD = "fiftyone.core.labels.Regression";
export const SEGMENTATION_LABEL = "fiftyone.core.labels.Segmentation";
export const TEMPORAL_DETECTION_LABEL =
  "fiftyone.core.labels.TemporalDetection";
export const TEMPORAL_DETECTIONS_LABEL =
  "fiftyone.core.labels.TemporalDetections";

/** [DEPRECATED] LABEL_"FIELD" (incorrectly named) **/

export const CLASSIFICATION_FIELD = CLASSIFICATION_LABEL;
export const CLASSIFICATIONS_FIELD = CLASSIFICATIONS_LABEL;
export const DETECTION_FIELD = DETECTION_LABEL;
export const DETECTIONS_FIELD = DETECTIONS_LABEL;
export const GEO_LOCATION_FIELD = GEO_LOCATION_LABEL;
export const GEO_LOCATIONS_FIELD = GEO_LOCATIONS_LABEL;
export const HEATMAP_FIELD = HEATMAP_LABEL;
export const KEYPOINT_FIELD = KEYPOINT_LABEL;
export const KEYPOINTS_FIELD = KEYPOINTS_LABEL;
export const POLYLINE_FIELD = POLYLINE_LABEL;
export const POLYLINES_FIELD = POLYLINES_LABEL;
export const SEGMENTATION_FIELD = SEGMENTATION_LABEL;
export const TEMPORAL_DETECTION_FIELD = TEMPORAL_DETECTION_LABEL;
export const TEMPORAL_DETECTIONS_FIELD = TEMPORAL_DETECTIONS_LABEL;

/** RESERVED **/

const RESERVED_FIELD_KEYS_MAP = {
  tags: "tags",
  filepath: "filepath",
  sampleID: "sample_id",
};

export const RESERVED_FIELD_KEYS = Object.values(RESERVED_FIELD_KEYS_MAP);

/**
 * GROUPINGS
 */

export const LABEL_LISTS = [
  CLASSIFICATIONS,
  DETECTIONS,
  KEYPOINTS,
  POLYLINES,
  TEMPORAL_DETECTIONS,
];

export const CLIPS_SAMPLE_FIELDS = [TEMPORAL_DETECTIONS_LABEL];
export const CLIPS_FRAME_FIELDS = [
  CLASSIFICATIONS_LABEL,
  DETECTIONS_LABEL,
  KEYPOINTS_LABEL,
  POLYLINES_LABEL,
];
export const DYNAMIC_GROUP_FIELDS = [
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  INT_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
];
export const NOT_VISIBLE_LIST = [
  "DictField",
  "ArrayField",
  "VectorField",
  "FrameNumberField",
];
export const PATCHES_FIELDS = [DETECTIONS_LABEL, POLYLINES_LABEL];
export const VALID_CLASS_TYPES = [CLASSIFICATION, CLASSIFICATIONS];
export const VALID_MASK_TYPES = [HEATMAP, SEGMENTATION];
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
export const VALID_LABEL_TYPES = [
  ...VALID_CLASS_TYPES,
  ...VALID_OBJECT_TYPES,
  ...VALID_MASK_TYPES,
  REGRESSION,
];
export const LABELS = withPath(LABELS_PATH, VALID_LABEL_TYPES);
export const VALID_LIST_TYPES = [
  CLASSIFICATIONS,
  DETECTIONS,
  KEYPOINTS,
  POLYLINES,
  TEMPORAL_DETECTIONS,
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
export const VALID_LIST_FIELDS = [FRAME_SUPPORT_FIELD, LIST_FIELD];
export const VALID_LIST_LABEL_FIELDS = [
  DETECTIONS_FIELD,
  CLASSIFICATIONS_FIELD,
  KEYPOINTS_FIELD,
  TEMPORAL_DETECTIONS_FIELD,
  GEO_LOCATIONS_FIELD,
  POLYLINES_FIELD,
];
export const VALID_KEYPOINTS = [KEYPOINT_LABEL, KEYPOINTS_LABEL];
export const VALID_NON_LIST_LABEL_TYPES = [
  DETECTION_FIELD,
  CLASSIFICATION_FIELD,
  KEYPOINT_FIELD,
  TEMPORAL_DETECTION_FIELD,
  REGRESSION_FIELD,
  HEATMAP_FIELD,
  SEGMENTATION_FIELD,
  GEO_LOCATION_FIELD,
  POLYLINE_FIELD,
];
export const VALID_NUMERIC_TYPES = [
  DATE_FIELD,
  DATE_TIME_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
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
export const UNSUPPORTED_FILTER_TYPES = [
  ARRAY_FIELD,
  DICT_FIELD,
  VECTOR_FIELD,
  null,
  undefined,
];
export const SKIP_FIELD_TYPES = [...UNSUPPORTED_FILTER_TYPES, JUST_FIELD];
export const DISABLED_LABEL_FIELDS_VISIBILITY = [
  ...VALID_NON_LIST_LABEL_TYPES,
  ...VALID_LIST_LABEL_FIELDS,
];

export const LABEL_DOC_TYPES = VALID_LABEL_TYPES.filter(
  (label) => !LABEL_LISTS.includes(label)
);

/** DENSE */

export const DENSE_LABEL_EMBEDDED_DOC_TYPES = [
  DETECTION_LABEL,
  DETECTIONS_LABEL,
  SEGMENTATION_LABEL,
  HEATMAP_LABEL,
];

export const DENSE_LABELS = new Set([
  SEGMENTATION,
  HEATMAP,
  DETECTION,
  DETECTIONS,
]);

export const MASK_LABELS = new Set([DETECTION, SEGMENTATION]);

/** LABEL MAPS */

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
  [POLYLINE]: POLYLINE,
  [POLYLINES]: POLYLINES,
  [SEGMENTATION]: SEGMENTATION,
  [REGRESSION]: REGRESSION,
  [TEMPORAL_DETECTION]: TEMPORAL_DETECTION,
  [TEMPORAL_DETECTIONS]: TEMPORAL_DETECTIONS,
};

export const LABEL_LISTS_MAP = {
  [CLASSIFICATIONS]: "classifications",
  [DETECTIONS]: "detections",
  [KEYPOINTS]: "keypoints",
  [POLYLINES]: "polylines",
  [TEMPORAL_DETECTIONS]: "detections",
};
export const LABEL_LIST = LABEL_LISTS_MAP;

export const LABEL_LIST_PATH = Object.fromEntries(
  Object.entries(LABEL_LIST).map(([docType, field]) => [
    withPath("fiftyone.core.labels", docType),
    field,
  ])
);

/** FIELD VISBILITY */

const BASE_DISABLED_PATHS = ["id", "tags", "label", "confidence"];
export const DISABLED_PATHS = ["id", "filepath", "tags", "metadata"];
export const CLASSIFICATION_DISABLED_SUB_PATHS = [
  ...BASE_DISABLED_PATHS,
  "logits",
];
export const DETECTION_DISABLED_SUB_PATHS = [
  ...BASE_DISABLED_PATHS,
  "bounding_box",
  "mask",
  "index",
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
export const HEATMAP_DISABLED_SUB_PATHS = [
  "id",
  "tags",
  "map",
  "map_path",
  "range",
];
export const KEYPOINT_DISABLED_SUB_PATHS = [
  ...BASE_DISABLED_PATHS,
  "points",
  "index",
];
export const POLYLINE_DISABLED_SUB_PATHS = [
  ...BASE_DISABLED_PATHS,
  "points",
  "closed",
  "filled",
  "index",
];
export const REGRESSION_DISABLED_SUB_PATHS = [
  "id",
  "tags",
  "value",
  "confidence",
];
export const SEGMENTATION_DISABLED_SUB_PATHS = [
  "id",
  "tags",
  "mask",
  "mask_path",
];
export const TEMPORAL_DETECTION_DISABLED_SUB_PATHS = [
  ...BASE_DISABLED_PATHS,
  "support",
];
