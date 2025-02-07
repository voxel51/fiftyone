import type { Sample } from "@fiftyone/looker";
import _ from "lodash";
import mime from "mime";
import {
  DATE_FIELD,
  DATE_TIME_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  FRAME_SUPPORT_FIELD,
} from "./constants";
import type { Field } from "./schema";

export * from "./buffer-manager";
export * from "./color";
export * from "./constants";
export * as constants from "./constants";
export * from "./errors";
export * from "./fetch";
export * from "./order";
export * from "./paths";
export * from "./Resource";
export * from "./schema";
export { default as sizeBytesEstimate } from "./size-bytes-estimate";
export * as styles from "./styles";
export * from "./type-check";

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
  startsWith = false
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

export const isNotebook = () => {
  return Boolean(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("context")
  );
};

export const useExternalLink = (href) => {
  return (e) => e.stopPropagation();
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

    const match = string.match(protocolAndDomainRE);
    if (!match) {
      return false;
    }

    const everythingAfterProtocol = match[1];
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

export type Primitive =
  | number
  | null
  | string
  | undefined
  | { datetime: number };

export const formatPrimitive = ({
  ftype,
  timeZone,
  value,
}: {
  ftype: string;
  timeZone: string;
  value: Primitive;
}) => {
  if (value === null || value === undefined) return null;

  switch (ftype) {
    case FRAME_SUPPORT_FIELD:
      return `[${value[0]}, ${value[1]}]`;
    case DATE_FIELD:
      // @ts-ignore
      return formatDate(value?.datetime as number);
    case DATE_TIME_FIELD:
      // @ts-ignore
      return formatDateTime(value?.datetime as number, timeZone);
  }

  // @ts-ignore
  return prettify(value);
};

export const makePseudoField = (path: string): Field => ({
  name: path.split(".").slice(1).join("."),
  ftype: "",
  subfield: null,
  description: "",
  info: null,
  fields: {},
  dbField: null,
  path: path,
  embeddedDocType: null,
});

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
  const matches = [];
  let match;
  while ((match = valid_chars.exec(slug)) !== null) {
    matches.push(match);
  }
  if (matches.length) {
    slug = matches.join("")?.replace(replace_symbols, "-");
    if (slug.length && slug !== "-") {
      return slug.length ? trim.exec(slug)?.groups?.slug || "" : "";
    }
  }
  return "";
};

export function pluralize(
  number: number,
  singular: string | JSX.Element,
  plural: string | JSX.Element
) {
  return number === 1 ? singular : plural;
}

// vite-plugin-relay inexplicably removes import.meta.env
// @fiftyone/utilities does not use the plugin, so this helper
// is defined
export const env = (): ImportMetaEnv => {
  return import.meta.env;
};

export function humanReadableBytes(bytes: number): string {
  if (!bytes) return "";

  const units: string[] = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  if (bytes === 0) return "0 Byte";

  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + units[i];
}

export enum COLOR_BY {
  "VALUE" = "value",
  "INSTANCE" = "instance",
  "FIELD" = "field",
}
