import { type AnnotationLabel } from "@fiftyone/state";
import type { PrimitiveAtom } from "jotai";
import { atom } from "jotai";
import { atomFamily, atomWithReset } from "jotai/utils";
import { activeLabelSchemas, fieldType, labelSchemaData } from "../state";
import { addLabel, labels, labelsByPath } from "../useLabels";

export const CLASSIFICATION = "classification";
export const CLASSIFICATIONS = "classifications";
export const DETECTION = "detection";
export const DETECTIONS = "detections";
export const POLYLINE = "polyline";
export const POLYLINES = "polylines";
export const PRIMITIVE = "primitive";

export const savedLabel = atom<AnnotationLabel["data"] | null>(null);

export const editing = atomWithReset<
  PrimitiveAtom<AnnotationLabel> | LabelType | typeof PRIMITIVE | null
>(null);

export const primitivePath = atomWithReset<string | null>(null);

export const hasChanges = atom((get) => {
  const label = get(currentData);
  const saved = get(savedLabel);

  return saved === null
    ? false
    : JSON.stringify(label) !== JSON.stringify(saved);
});
const IS_CLASSIFICIATION = new Set([CLASSIFICATION, CLASSIFICATIONS]);
const IS_DETECTION = new Set([DETECTION, DETECTIONS]);
const IS_PRIMITIVE = new Set([PRIMITIVE]);
const IS_POLYLINE = new Set([POLYLINE, POLYLINES]);
const IS_LIST = new Set([CLASSIFICATIONS, DETECTIONS, POLYLINES]);
const IS = {
  [CLASSIFICATION]: IS_CLASSIFICIATION,
  [DETECTION]: IS_DETECTION,
  [POLYLINE]: IS_POLYLINE,
  [PRIMITIVE]: IS_PRIMITIVE,
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
    label.overlay?.updateField(path);
    label.overlay?.updateLabel({ _id: label.data._id });
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

  return get(labelSchemaData(field))?.labelSchema;
});

export const currentDisabledFields = atom((get) => {
  return get(disabledFields(get(currentType)));
});

export const disabledFields = atomFamily((type: LabelType) =>
  atom((get) => {
    const disabled = new Set<string>();
    const map = get(labelsByPath);
    for (const path of get(fieldsOfType(type))) {
      if (IS_LIST.has(get(labelSchemaData(path)).type)) {
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
      if (values.has(type.toLowerCase())) {
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
    for (const field of get(activeLabelSchemas) ?? []) {
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
    get(labels).filter((label) => label.overlay.id !== data.overlay.id)
  );
  set(editing, null);
});
