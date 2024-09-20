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

const unwind = (name: string, value: Sample | Sample[], depth = 0) => {
  if (Array.isArray(value)) {
    return depth < 2 ? value.map((val) => unwind(name, val), depth + 1) : [];
  }

  const v = value[name];
  if (v !== undefined && v !== null) {
    return [v];
  }

  if (name === "_id" && value.id) {
    return [value.id];
  }

  return [];
};

const parseSample = (keys: string[], sample: Sample, schema: Schema) => {
  if (keys[0] === FRAMES && schema?.frames?.embeddedDocType === FRAMES_SAMPLE) {
    return {
      values: sample?.frames[0] as Sample[],
      schema: schema.frames.fields,
      keys: keys.slice(1),
    };
  }

  return {
    values: [sample],
    schema,
    keys,
  };
};

export const getBubbles = (
  path: string,
  sample: Sample,
  input: Schema
): [Field, Sample[]] => {
  const out = parseSample(path.split("."), sample, input);

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
      out.values = out.values.flatMap(
        (value) => value.classifications || []
      ) as Sample[];
      break;
    }

    if (field.embeddedDocType === withPath(LABELS_PATH, TEMPORAL_DETECTIONS)) {
      out.values = out.values.flatMap(
        (value) => value.detections || []
      ) as Sample[];
      break;
    }

    if (out.values?.length && field) {
      out.values = (unwind(field.dbField, out.values) || []).flat(2);
      break;
    }

    out.schema = field ? field.fields : null;
  }

  return [field, out.values];
};

export const getField = (keys: string[], schema: Schema) => {
  let field: Field = schema[keys[0]];
  for (const key of keys.slice(1, -1)) {
    const next = field.fields[key];
    if (!next?.fields) {
      return null;
    }

    field = next;
  }

  return field.fields[keys[keys.length - 1]];
};
