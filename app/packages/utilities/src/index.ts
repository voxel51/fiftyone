import { Sample } from "@fiftyone/looker/src/state";
import _ from "lodash";
import mime from "mime";
import { isElectron } from "./electron";

export * from "./color";
export * from "./electron";
export * from "./errors";
export * from "./fetch";
export * from "./Resource";

interface O {
  [key: string]: O | any;
}

export const toCamelCase = (obj: O): O =>
  _.transform(obj, (acc, value, key, target) => {
    const camelKey = _.isArray(target) ? key : safeCamelCase(key);

    acc[
      `${typeof key === "string" && key.startsWith("_") ? "_" : ""}${camelKey}`
    ] = _.isObject(value) ? toCamelCase(value) : value;
  });

function safeCamelCase(key) {
  if (key.match(/[0-9][a-z]/)) return key;
  return _.camelCase(key);
}

export const toSnakeCase = (obj: O): O =>
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
  dbField: string | null;
  description: string | null;
  info: object | null;
  name: string;
  embeddedDocType: string | null;
  subfield: string | null;
  path: string | null;
  searchField: string | null;
  visible: boolean | null;
  isLeaf?: boolean;
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

export interface Stage {
  _cls: string;
  kwargs: [string, object][];
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

export const NONFINITES = new Set(["-inf", "inf", "nan"]);

export const CLASSIFICATION = "Classification";
export const CLASSIFICATIONS = "Classifications";
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

export const LABEL_LISTS_MAP = {
  [CLASSIFICATIONS]: "classifications",
  [DETECTIONS]: "detections",
  [KEYPOINTS]: "keypoints",
  [POLYLINES]: "polylines",
  [TEMPORAL_DETECTIONS]: "detections",
};

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

export const MASK_LABELS = new Set([DETECTION, SEGMENTATION]);

// defined as labels that can have on-disk overlays
export const DENSE_LABELS = new Set([
  SEGMENTATION,
  HEATMAP,
  DETECTION,
  DETECTIONS,
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
export const VALID_MASK_TYPES = ["Heatmap", "Segmentation"];
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
export const DICT_FIELD = "fiftyone.core.fields.DictField";
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

export const LABELS_PATH = "fiftyone.core.labels";

export const PATCHES_FIELDS = withPath(LABELS_PATH, [
  "Detections",
  "Polylines",
]);
export const CLIPS_SAMPLE_FIELDS = withPath(LABELS_PATH, [
  "TemporalDetection",
  "TemporalDetections",
]);
export const CLIPS_FRAME_FIELDS = withPath(LABELS_PATH, [
  "Classifications",
  "Detections",
  "Keypoints",
  "Polylines",
]);

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

export const isNotebook = () => {
  return Boolean(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("context")
  );
};

export const useExternalLink = (href) => {
  let openExternal;
  if (isElectron()) {
    try {
      openExternal = require("electron").shell.openExternal;
    } catch {}
  }

  return openExternal
    ? (e) => {
        e.preventDefault();
        e.stopPropagation();
        openExternal(href);
      }
    : (e) => e.stopPropagation();
};

const isURL = (() => {
  const protocolAndDomainRE = /^(?:\w+:)?\/\/(\S+)$/;

  const localhostDomainRE = /^localhost[\:?\d]*(?:[^\:?\d]\S*)?$/;
  const nonLocalhostDomainRE = /^[^\s\.]+\.\S{2,}$/;

  return (string) => {
    if (string.startsWith("gs://")) {
      return false;
    }

    if (string.startsWith("s3://")) {
      return false;
    }

    if (typeof string !== "string") {
      return false;
    }

    var match = string.match(protocolAndDomainRE);
    if (!match) {
      return false;
    }

    var everythingAfterProtocol = match[1];
    if (!everythingAfterProtocol) {
      return false;
    }

    if (
      localhostDomainRE.test(everythingAfterProtocol) ||
      nonLocalhostDomainRE.test(everythingAfterProtocol)
    ) {
      return true;
    }

    return false;
  };
})();

export const prettify = (
  v: boolean | string | null | undefined | number | number[]
): URL | string => {
  if (typeof v === "string") {
    if (isURL(v)) {
      try {
        return new URL(v);
      } catch {}
    }

    return v;
  } else if (typeof v === "number") {
    return Number(v.toFixed(3)).toLocaleString();
  } else if (v === true) {
    return "True";
  } else if (v === false) {
    return "False";
  } else if ([undefined, null].includes(v)) {
    return "None";
  } else if (Array.isArray(v)) {
    return `[${v.join(", ")}]`;
  }
  return null;
};

export const formatDateTime = (timeStamp: number, timeZone: string): string => {
  const twoDigit = "2-digit";
  const MS = 1000;
  const S = 60 * MS;
  const M = 60 * S;
  const H = 24 * M;

  const options: Intl.DateTimeFormatOptions = {
    timeZone:
      timeZone === "local"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : timeZone,
    year: "numeric",
    day: twoDigit,
    month: twoDigit,
    hour: twoDigit,
    minute: twoDigit,
    second: twoDigit,
  };

  if (!(timeStamp % S)) {
    delete options.second;
  }

  if (!(timeStamp % M)) {
    delete options.minute;
  }

  if (!(timeStamp % H)) {
    delete options.hour;
  }

  return new Intl.DateTimeFormat("en-ZA", options)
    .format(timeStamp)
    .replaceAll("/", "-");
};

export const formatDate = (timeStamp: number): string => {
  const twoDigit = "2-digit";

  const options: Intl.DateTimeFormatOptions = {
    timeZone: "UTC",
    year: "numeric",
    day: twoDigit,
    month: twoDigit,
  };

  return new Intl.DateTimeFormat("en-ZA", options)
    .format(timeStamp)
    .replaceAll("/", "-");
};

type Mutable<T> = {
  -readonly [K in keyof T]: Mutable<T[K]>;
};

export const clone = <T>(data: T): Mutable<T> => {
  return JSON.parse(JSON.stringify(data));
};

export const getMimeType = (sample: Sample) => {
  if (sample.metadata && sample.metadata.mime_type) {
    return sample.metadata.mime_type;
  }

  const mimeFromFilePath = mime.getType(sample.filepath);

  // mime type is null for certain file types like point-clouds
  return mimeFromFilePath ?? null;
};

export const toSlug = (name: string) => {
  /**  Returns the URL-friendly slug for the given string.
   *
   * The following strategy is used to generate slugs:
   *   (based on fiftyone.core.utils `to_slug` function)
   *   -   The characters ``A-Za-z0-9`` are converted to lowercase
   *   -   Whitespace and ``+_.-`` are converted to ``-``
   *   -   All other characters are omitted
   *   -   All consecutive ``-`` characters are reduced to a single ``-``
   *   -   All leading and trailing ``-`` are stripped
   */
  if (name.length < 1) {
    return "";
  }
  const valid_chars = new RegExp("[a-z0-9._+ -]", "g");
  const replace_symbols = new RegExp("[-._+ ]+", "g");
  const trim = new RegExp("-?(?<slug>[0-9a-z][0-9a-z-]*?)-?$");

  let slug = name.toLowerCase();
  let matches = [];
  let match;
  while ((match = valid_chars.exec(slug)) !== null) {
    matches.push(match);
  }
  if (matches.length) {
    slug = matches.join("")?.replace(replace_symbols, "-");
    if (slug.length && slug !== "-") {
      return slug.length ? trim.exec(slug)?.groups?.slug : "";
    }
  }
  return "";
};
