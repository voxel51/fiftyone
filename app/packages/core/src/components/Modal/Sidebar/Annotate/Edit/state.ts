import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  CLASSIFICATIONS,
  DETECTION,
  DETECTIONS,
  POLYLINE,
  POLYLINES,
} from "@fiftyone/utilities";
import type { PrimitiveAtom } from "jotai";
import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { activeSchemas, fieldType, schemaConfig } from "../state";
import { addLabel, labels, labelsByPath } from "../useLabels";

export const editing = atom<PrimitiveAtom<AnnotationLabel> | LabelType | null>(
  null
);
export const savedLabel = atom<AnnotationLabel["data"] | null>(null);

export const hasChanges = atom((get) => {
  const label = get(currentData);
  const saved = get(savedLabel);

  console.log(saved, label);
  return saved === null
    ? false
    : JSON.stringify(label) !== JSON.stringify(saved);
});
const IS_CLASSIFICIATION = new Set([CLASSIFICATION, CLASSIFICATIONS]);
const IS_DETECTION = new Set([DETECTION, DETECTIONS]);
const IS_POLYLINE = new Set([POLYLINE, POLYLINES]);
const IS_LIST = new Set([CLASSIFICATIONS, DETECTIONS, POLYLINES]);
const IS = {
  [CLASSIFICATION]: IS_CLASSIFICIATION,
  [DETECTION]: IS_DETECTION,
  [POLYLINE]: IS_POLYLINE,
};

export type LabelType =
  | typeof CLASSIFICATION
  | typeof DETECTION
  | typeof POLYLINE;

export const current = atom(
  (get) => {
    const currentEditing = get(editing);

    if (currentEditing && typeof currentEditing !== "string") {
      return get(currentEditing);
    }

    return null;
  },
  (get, set, label: AnnotationLabel) => {
    const currentEditing = get(editing);

    if (currentEditing && typeof currentEditing !== "string") {
      set(currentEditing, label);
    }
  }
);

export const currentData = atom(
  (get) => get(current)?.data ?? null,
  (get, set, data: Partial<AnnotationLabel["data"]>) => {
    const currentEditing = get(editing);

    if (currentEditing && typeof currentEditing !== "string") {
      const current = get(currentEditing);
      return set(currentEditing, {
        ...current,
        data: { ...current.data, ...data },
      });
    }
  }
);

export const currentFields = atom((get) => get(fieldsOfType(get(currentType))));

export const currentField = atom(
  (get) => {
    return get(current)?.path;
  },
  (get, set, path: string) => {
    const label = get(current);
    if (!label) {
      return;
    }
    label.overlay.updateField(path);
    label.overlay.updateLabel({ _id: label.data._id });
    set(current, { ...label, path, data: { _id: label.data._id } });
  }
);

export const currentOverlay = atom((get) => {
  return get(current)?.overlay;
});

export const currentSchema = atom((get) => {
  const field = get(currentField);
  if (!field) {
    throw new Error("no current field");
  }

  return get(schemaConfig(field));
});

export const currentDisabledFields = atom((get) => {
  return get(disabledFields(get(currentType)));
});

export const disabledFields = atomFamily((type: LabelType) =>
  atom((get) => {
    const disabled = new Set<string>();
    const map = get(labelsByPath);
    for (const path of get(fieldsOfType(type))) {
      if (IS_LIST.has(get(fieldType(path)))) {
        continue;
      }

      if (!map[path]?.length) {
        continue;
      }

      disabled.add(path);
    }

    return disabled;
  })
);

export const currentType = atom<LabelType>((get) => {
  const value = get(editing);

  if (typeof value === "string") {
    return value;
  }

  const type = get(current)?.type;
  if (type) {
    for (const [kind, values] of Object.entries(IS)) {
      if (values.has(type)) {
        return kind as LabelType;
      }
    }
  }

  throw new Error("no type");
});

export const isEditing = atom((get) => get(editing) !== null);

export const isNew = atom((get) => {
  return typeof get(editing) === "string" || get(current)?.isNew;
});

const fieldsOfType = atomFamily((type: LabelType) =>
  atom((get) => {
    const fields = new Array<string>();
    for (const field in get(activeSchemas)) {
      if (IS[type].has(get(fieldType(field)))) {
        fields.push(field);
      }
    }

    return fields.sort();
  })
);

export const defaultField = atomFamily((type: LabelType) =>
  atom((get) => {
    const disabled = get(disabledFields(type));
    for (const path of get(fieldsOfType(type))) {
      if (!disabled.has(path)) {
        return path;
      }
    }

    return null;
  })
);

export const addValue = atom(undefined, (get, set) => {
  const data = get(current);

  if (!data) {
    throw new Error("no current label");
  }

  const { isNew, ...value } = data;

  if (isNew) {
    set(addLabel, value);
  }
});

export const deleteValue = atom(null, (get, set) => {
  const data = get(current);

  if (!data) {
    throw new Error("no current label");
  }

  set(
    labels,
    get(labels).filter((label) => label.data._id !== data.data._id)
  );
  set(editing, null);
});
