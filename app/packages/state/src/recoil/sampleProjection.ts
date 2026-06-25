/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Field partition: the grid requests exactly the fields its overlay renderers
 * draw (owned by @fiftyone/looker); the modal requests everything except vectors.
 */
import { getRenderFieldPaths } from "@fiftyone/looker";
import {
  GROUP,
  type Schema,
  VECTOR_FIELD,
  type Field,
} from "@fiftyone/utilities";
import { selector } from "recoil";
import { fullSchema } from "./schema";

const dbPath = (field: Field, prefix: string): string => {
  const name = field.dbField || field.name;
  return prefix ? `${prefix}.${name}` : name;
};

// sample-structural fields the response needs beyond the overlay leaves and the
// identifiers the server always keeps (`_ALWAYS` in server/routes/samples.py:
// _id, filepath, _media_type, _group, _group_count); not a rendering concern
const SAMPLE_IDENTIFIERS = [
  "_cls",
  "metadata",
  "tags",
  "support",
  "_sample_id",
  "frame_number",
];

// the group field carries the slice/group identity the modal resolves from a
// clicked sample (useExpandSample reads `<group>._id`)
const groupFieldPaths = (schema: Schema): string[] => {
  const out: string[] = [];
  for (const name of Object.keys(schema)) {
    if (schema[name].embeddedDocType === GROUP) {
      out.push(dbPath(schema[name], ""));
    }
  }
  return out;
};

const vectorPaths = (schema: Schema, prefix: string, out: string[]) => {
  for (const name of Object.keys(schema)) {
    const field = schema[name];
    const path = dbPath(field, prefix);
    if (field.ftype === VECTOR_FIELD) {
      out.push(path);
    } else if (field.fields) {
      vectorPaths(field.fields, path, out);
    }
  }
};

/** The include list the grid sends: the overlay leaves its renderers read + identifiers. */
export const gridSampleFields = selector<string[]>({
  key: "gridSampleFields",
  get: ({ get }) => {
    const schema = get(fullSchema);
    return Array.from(
      new Set([
        ...SAMPLE_IDENTIFIERS,
        ...groupFieldPaths(schema),
        ...getRenderFieldPaths(schema),
      ])
    );
  },
});

/** The exclude list the modal sends: every VectorField path (incl. label logits). */
export const modalSampleExclude = selector<string[]>({
  key: "modalSampleExclude",
  get: ({ get }) => {
    const out: string[] = [];
    vectorPaths(get(fullSchema), "", out);
    return Array.from(new Set(out));
  },
});
