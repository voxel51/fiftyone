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
import {
  fieldType,
  isFieldReadOnly,
  labelSchemaData,
  visibleLabelSchemas,
} from "../../state";
import { labelsByPath } from "../../useLabels";
import { activePrimitiveAtom } from "../useActivePrimitive";
import { buildNewLabelData } from "./createNew";
import {
  currentEditingMaskAtom,
  editingLabelAtom,
  pendingNewTypeAtom,
  savedLabel,
  savedLabelPath,
} from "./atoms";
import type { LabelType } from "./types";

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
    const labelAtom = get(editingLabelAtom);
    return labelAtom ? get(labelAtom) : null;
  },
  (get, set, label: AnnotationLabel) => {
    const labelAtom = get(editingLabelAtom);
    if (labelAtom) {
      set(labelAtom, label);
    }
  },
);

export const currentData = atom(
  (get) => get(current)?.data ?? null,
  (get, set, data: Partial<AnnotationLabel["data"]>, replace?: boolean) => {
    const labelAtom = get(editingLabelAtom);
    if (labelAtom) {
      const c = get(labelAtom);
      const nextData = replace ? data : { ...c.data, ...data };
      return set(labelAtom, { ...c, data: nextData } as AnnotationLabel);
    }
  },
);

export const currentField = atom(
  (get) => get(current)?.path,
  (get, set, path: string) => {
    const currentLabel = get(current);
    if (!currentLabel || currentLabel.path === path) {
      return;
    }

    // _id and bounding_box exist at runtime but aren't in the looker types.
    type WithRuntimeFields = { _id?: string; bounding_box?: number[] };
    const oldData = currentLabel.data as AnnotationLabel["data"] &
      WithRuntimeFields;
    const newData = buildNewLabelData(path, currentLabel.type, {
      id: oldData._id,
    }) as AnnotationLabel["data"] & WithRuntimeFields;
    const data = {
      ...newData,
      ...oldData,
    } as AnnotationLabel["data"] & WithRuntimeFields;

    const overlay = currentLabel.overlay as
      | {
          updateField?(path: string): void;
          updateLabel?(label: AnnotationLabel["data"]): void;
        }
      | undefined;
    overlay?.updateField?.(path);
    overlay?.updateLabel?.(data);

    set(current, { ...currentLabel, path, data } as AnnotationLabel);
  },
);

export const currentFieldIsReadOnlyAtom = atom((get) => {
  const field = get(currentField);
  if (!field) return false;
  return isFieldReadOnly(get(labelSchemaData(field)));
});

export const currentOverlay = atom((get) => get(current)?.overlay);

/** Label schema for the current field, or `null` when no field is active. */
export const currentSchema = atom((get) => {
  const field = get(currentField);
  if (!field) return null;
  return get(labelSchemaData(field))?.label_schema ?? null;
});

export const disabledFields = atomFamily((type: LabelType | null) =>
  atom((get) => {
    const disabled = new Set<string>();
    if (!type) return disabled;
    const map = get(labelsByPath);

    for (const path of get(fieldsOfType(type))) {
      const isListType = IS_LIST.has(get(fieldType(path)));
      const hasLabels = map[path]?.length > 0;

      if (isListType || !hasLabels) continue;
      disabled.add(path);
    }

    return disabled;
  }),
);

export const currentType = atom<LabelType | null>((get) => {
  const pending = get(pendingNewTypeAtom);
  if (pending) return pending;

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
  return get(editingLabelAtom) !== null || get(pendingNewTypeAtom) !== null;
});

export const isNew = atom(
  (get) => get(pendingNewTypeAtom) !== null || get(current)?.isNew,
);

export const isEditingMask = atom((get) => get(currentEditingMaskAtom));

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
  }),
);

export const defaultField = atomFamily((type: LabelType | null) =>
  atom((get) => {
    if (!type) return null;
    const disabled = get(disabledFields(type));
    for (const path of get(fieldsOfType(type))) {
      if (!disabled.has(path)) {
        return path;
      }
    }
    return null;
  }),
);

export const hasChanges = atom((get) => {
  const saved = get(savedLabel);
  if (saved === null) return false;
  const data = get(currentData);
  const path = get(currentField) ?? null;
  const savedPath = get(savedLabelPath);
  if (path !== savedPath) return true;
  return JSON.stringify(data) !== JSON.stringify(saved);
});
