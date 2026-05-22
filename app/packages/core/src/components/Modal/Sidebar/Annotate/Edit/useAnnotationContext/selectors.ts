import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  CLASSIFICATIONS,
  DETECTION,
  DETECTIONS,
  KEYPOINT,
  KEYPOINTS,
  POLYLINE,
  POLYLINES,
} from "@fiftyone/utilities";
import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { capitalize } from "lodash";
import {
  fieldType,
  isFieldReadOnly,
  labelSchemaData,
  visibleLabelSchemas,
} from "../../state";
import { labelsByPath } from "../../useLabels";
import { activePrimitiveAtom } from "../useActivePrimitive";
import { buildNewLabelData } from "./createNew";
import { editing, type LabelType, savedLabel } from "./atoms";

const IS_CLASSIFICATION = new Set([CLASSIFICATION, CLASSIFICATIONS]);
const IS_DETECTION = new Set([DETECTION, DETECTIONS]);
const IS_POLYLINE = new Set([POLYLINE, POLYLINES]);
const IS_KEYPOINT = new Set([KEYPOINT, KEYPOINTS]);
const IS_LIST = new Set([CLASSIFICATIONS, DETECTIONS, POLYLINES, KEYPOINTS]);
const IS = {
  [CLASSIFICATION]: IS_CLASSIFICATION,
  [DETECTION]: IS_DETECTION,
  [POLYLINE]: IS_POLYLINE,
  [KEYPOINT]: IS_KEYPOINT,
};

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
  (get, set, data: Partial<AnnotationLabel["data"]>, replace?: boolean) => {
    const currentEditing = get(editing);
    if (currentEditing && typeof currentEditing !== "string") {
      const c = get(currentEditing);
      return set(currentEditing, {
        ...c,
        data: replace ? data : { ...c.data, ...data },
      });
    }
  }
);

export const currentFields = atom((get) => get(fieldsOfType(get(currentType))));

export const currentField = atom(
  (get) => get(current)?.path,
  (get, set, path: string) => {
    const currentLabel = get(current);
    if (!currentLabel || currentLabel.path === path) {
      return;
    }

    const oldData = currentLabel.data;
    const data = buildNewLabelData(path, currentLabel.type, {
      id: oldData?._id,
    });
    data.bounding_box = oldData?.bounding_box;

    currentLabel.overlay?.updateField(path);
    currentLabel.overlay?.updateLabel(data);

    set(current, { ...currentLabel, path, data });
  }
);

export const currentFieldIsReadOnlyAtom = atom((get) => {
  const field = get(currentField);
  if (!field) return false;
  return isFieldReadOnly(get(labelSchemaData(field)));
});

export const currentOverlay = atom((get) => get(current)?.overlay);

/**
 * The label schema for the current field, or `null` when no field is active.
 *
 * Null-safe: callers can read this unconditionally rather than guarding on
 * `currentField` first.
 */
export const currentSchema = atom((get) => {
  const field = get(currentField);
  if (!field) return null;
  return get(labelSchemaData(field))?.label_schema ?? null;
});

export const currentDisabledFields = atom((get) =>
  get(disabledFields(get(currentType)))
);

export const disabledFields = atomFamily((type: LabelType) =>
  atom((get) => {
    const disabled = new Set<string>();
    const map = get(labelsByPath);

    for (const path of get(fieldsOfType(type))) {
      const rawType = get(labelSchemaData(path)).type;
      const schemaType = capitalize(rawType);
      const isListType = IS_LIST.has(schemaType);
      const hasLabels = map[path]?.length > 0;

      if (isListType || !hasLabels) continue;
      disabled.add(path);
    }

    return disabled;
  })
);

export const currentType = atom<LabelType | null>((get) => {
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
  return null;
});

export const isEditing = atom((get) => {
  if (get(activePrimitiveAtom) !== null) return true;
  return get(editing) !== null;
});

export const isNew = atom(
  (get) => typeof get(editing) === "string" || get(current)?.isNew
);

export const fieldsOfType = atomFamily((type: LabelType | null) =>
  atom((get) => {
    const fields = new Array<string>();
    if (!type) return fields;

    for (const field of get(visibleLabelSchemas) ?? []) {
      if (IS[type].has(get(fieldType(field)))) {
        const fieldSchema = get(labelSchemaData(field));
        if (!isFieldReadOnly(fieldSchema)) {
          fields.push(field);
        }
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

export const hasChanges = atom((get) => {
  const data = get(currentData);
  const saved = get(savedLabel);
  return saved === null ? false : JSON.stringify(data) !== JSON.stringify(saved);
});
