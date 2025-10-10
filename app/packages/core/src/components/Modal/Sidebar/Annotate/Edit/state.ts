import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  CLASSIFICATIONS,
  DETECTION,
  DETECTIONS,
} from "@fiftyone/utilities";
import type { PrimitiveAtom } from "jotai";
import { atom } from "jotai";
import { activeSchemas, fieldType, schemaConfig } from "../state";
import { labelsByPath } from "../useLabels";

export const editing = atom<PrimitiveAtom<AnnotationLabel> | null>(null);

const IS_CLASSIFICIATION = new Set([CLASSIFICATION, CLASSIFICATIONS]);
const IS_DETECTION = new Set([DETECTION, DETECTIONS]);
const IS_LIST = new Set([CLASSIFICATIONS, DETECTIONS]);
const IS = {
  [CLASSIFICATION]: IS_CLASSIFICIATION,
  [DETECTION]: IS_DETECTION,
};

export const current = atom((get) => {
  const currentEditing = get(editing);

  if (currentEditing) {
    return get(currentEditing);
  }

  return null;
});

export const currentFields = atom((get) => {
  const type = get(currentType) ?? "";

  const fields = new Array<string>();
  for (const field in get(activeSchemas)) {
    if (IS[type].has(get(fieldType(field)))) {
      fields.push(field);
    }
  }

  return fields.sort();
});

export const currentField = atom((get) => {
  const path = get(current)?.path;
  if (path) {
    return path;
  }

  const disabled = get(disabledFields);
  for (const path of get(currentFields)) {
    if (!disabled.has(path)) {
      return path;
    }
  }

  return null;
});

export const currentSchema = atom((get) => {
  const field = get(currentField);
  if (!field) {
    throw new Error("no current field");
  }

  return get(schemaConfig(field));
});

export const disabledFields = atom((get) => {
  const disabled = new Set<string>();

  const map = get(labelsByPath);
  for (const path of get(currentFields)) {
    if (IS_LIST.has(get(fieldType(path)))) {
      continue;
    }

    if (!map[path]?.length) {
      continue;
    }

    disabled.add(path);
  }

  return disabled;
});

export const currentType = atom((get) => {
  const type = get(current)?.type ?? "";
  for (const [kind, values] of Object.entries(IS)) {
    if (values.has(type)) {
      return kind;
    }
  }

  throw new Error("no type");
});

export const isEditing = atom((get) => get(editing) !== null);
