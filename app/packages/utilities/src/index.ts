import _ from "lodash";

export const toCamelCase = (obj: object): object =>
  _.transform(obj, (acc, value, key, target) => {
    const camelKey = _.isArray(target) ? key : _.camelCase(key);

    acc[
      `${typeof key === "string" && key.startsWith("_") ? "_" : ""}${camelKey}`
    ] = _.isObject(value) ? toCamelCase(value) : value;
  });

export const toSnakeCase = (obj: object): object =>
  _.transform(obj, (acc, value, key, target) => {
    const snakeKey = _.isArray(target) ? key : _.snakeCase(key);

    acc[snakeKey] = _.isObject(value) ? toSnakeCase(value) : value;
  });

export const move = <T>(
  array: Array<T>,
  moveIndex: number,
  toIndex: number
): Array<T> => {
  const item = array[moveIndex];
  const length = array.length;
  const diff = moveIndex - toIndex;

  if (diff > 0) {
    // move left
    return [
      ...array.slice(0, toIndex),
      item,
      ...array.slice(toIndex, moveIndex),
      ...array.slice(moveIndex + 1, length),
    ];
  } else if (diff < 0) {
    // move right
    const targetIndex = toIndex + 1;
    return [
      ...array.slice(0, moveIndex),
      ...array.slice(moveIndex + 1, targetIndex),
      item,
      ...array.slice(targetIndex, length),
    ];
  }
  return array;
};

type KeyValue<T> = {
  [key: string]: T;
};

export const removeKeys = <T>(
  obj: KeyValue<T>,
  keys: Iterable<string>,
  startsWith: boolean = false
): KeyValue<T> => {
  const set = new Set(keys);
  const values = Array.from(keys);

  return Object.fromEntries(
    Object.entries(obj).filter(
      startsWith
        ? ([key]) => values.every((k) => !key.startsWith(k))
        : ([key]) => !set.has(key)
    )
  );
};

interface BaseField {
  ftype: string;
  dbField: string;
  name: string;
  embeddedDocType: string;
  subfield: string;
}

export interface StrictField extends BaseField {
  fields?: StrictField[];
}

export interface Field extends BaseField {
  fields: Schema;
}

export interface Schema {
  [key: string]: Field;
}

export const meetsFieldType = (
  field: Field,
  {
    ftype,
    embeddedDocType,
    acceptLists = true,
  }: {
    ftype: string | string[];
    embeddedDocType?: string | string[];
    acceptLists?: boolean;
  }
) => {
  if (!Array.isArray(ftype)) {
    ftype = [ftype];
  }

  if (!ftype.includes(EMBEDDED_DOCUMENT_FIELD) && embeddedDocType) {
    throw new Error("invalid parameters");
  }

  if (!Array.isArray(embeddedDocType)) {
    embeddedDocType = [embeddedDocType];
  }

  if (
    ftype.some(
      (f) => field.ftype === f || (field.subfield === f && acceptLists)
    )
  ) {
    return embeddedDocType.some((doc) => field.embeddedDocType === doc || !doc);
  }

  return false;
};

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
