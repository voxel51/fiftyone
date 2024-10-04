import {
  CLASSIFICATIONS,
  EMBEDDED_DOCUMENT_FIELD,
  type Field,
  LABELS_PATH,
  LIST_FIELD,
  type Schema,
  TEMPORAL_DETECTIONS,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "@fiftyone/utilities";
import type { Sample } from "../..";

const FRAMES = "frames";
const FRAMES_SAMPLE = "fiftyone.core.frames.FrameSample";

type Data = { [key: string]: unknown };

export const getBubbles = (
  path: string,
  data: Data,
  input: Schema
): [Field, unknown[]] => {
  const out = parseSample(path.split("."), data, input);

  let field: Field = null;
  for (const key of out.keys.slice(0, 2)) {
    field = out.schema?.[key];
    if (!field) {
      return [null, null];
    }

    if (
      field &&
      field.ftype === LIST_FIELD &&
      field.subfield === EMBEDDED_DOCUMENT_FIELD
    ) {
      if (Object.keys(field.fields).length) {
        for (const value of Object.values(field.fields)) {
          if (value.path === path && value.ftype === LIST_FIELD) {
            if (!VALID_PRIMITIVE_TYPES.includes(value.subfield)) {
              return [null, null];
            }
          } else if (
            value.path === path &&
            !VALID_PRIMITIVE_TYPES.includes(value.ftype)
          ) {
            return [null, null];
          }
        }
      } else {
        return [null, null];
      }
    }

    if (field.embeddedDocType === withPath(LABELS_PATH, CLASSIFICATIONS)) {
      out.values = unwind(field.dbField, out.values).flatMap(
        (value) => value.classifications || []
      ) as Sample[];
      break;
    }

    if (field.embeddedDocType === withPath(LABELS_PATH, TEMPORAL_DETECTIONS)) {
      out.values = unwind(field.dbField, out.values).flatMap(
        (value) => value.detections || []
      ) as Sample[];
      break;
    }

    if (out.values?.length && field) {
      out.values = unwind(field.dbField, out.values) || [];
    }

    out.schema = field ? field.fields : null;
  }

  return [field, out.values as Sample[]];
};

export const getField = (keys: string[], schema: Schema) => {
  let field: Field = schema[keys[0]];
  for (const key of keys.slice(1, -1)) {
    const next = field.fields?.[key];
    if (!next?.fields) {
      return null;
    }

    field = next;
  }

  return field.fields?.[keys[keys.length - 1]];
};

export const parseSample = (keys: string[], sample: Data, schema: Schema) => {
  if (keys[0] === FRAMES && schema?.frames?.embeddedDocType === FRAMES_SAMPLE) {
    return {
      values: sample?.frames[0] as Sample[],
      schema: schema.frames.fields,
      keys: keys.slice(1),
    };
  }

  return {
    values: [sample] as Data[],
    schema,
    keys,
  };
};

export const unwind = (name: string, value: Data | Data[], depth = 0) => {
  if (Array.isArray(value)) {
    const next = depth + 1;
    return depth < 2 ? value.map((val) => unwind(name, val), next).flat(3) : [];
  }

  const v = value[name];
  if (v !== undefined && v !== null) {
    return [v].flat(3);
  }

  if (name === "_id" && value.id) {
    return [value.id].flat(3);
  }

  return [];
};
