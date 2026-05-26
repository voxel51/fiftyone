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
import {
  editingLabelAtom,
  type LabelType,
  pendingNewTypeAtom,
  savedLabel,
} from "./atoms";

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
  }
);

export const currentData = atom(
  (get) => get(current)?.data ?? null,
  (get, set, data: Partial<AnnotationLabel["data"]>, replace?: boolean) => {
    const labelAtom = get(editingLabelAtom);
    if (labelAtom) {
      const c = get(labelAtom);
      // The patched data always matches `c.data`'s sub-type at runtime —
      // consumers only ever patch fields valid for the current label —
      // but TS can't narrow the discriminated union across the spread.
      const nextData = replace ? data : { ...c.data, ...data };
      return set(labelAtom, { ...c, data: nextData } as AnnotationLabel);
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

    // `_id` and `bounding_box` live on label data at runtime (Mongo ObjectId
    // and detection bbox), but neither is declared in the looker TS types.
    // Cast through the known runtime shape to access them safely.
    type WithRuntimeFields = { _id?: string; bounding_box?: number[] };
    const oldData = currentLabel.data as AnnotationLabel["data"] &
      WithRuntimeFields;
    const data = buildNewLabelData(path, currentLabel.type, {
      id: oldData._id,
    }) as AnnotationLabel["data"] & WithRuntimeFields;

    // Carry bbox across field swaps (no-op for non-Detection types).
    data.bounding_box = oldData.bounding_box;

    // Overlay shape varies per label type; the intersection collapses to
    // `never` for updateLabel's parameter. Cast at the call site.
    const overlay = currentLabel.overlay as
      | {
          updateField?(path: string): void;
          updateLabel?(label: AnnotationLabel["data"]): void;
        }
      | undefined;
    overlay?.updateField?.(path);
    overlay?.updateLabel?.(data);

    set(current, { ...currentLabel, path, data } as AnnotationLabel);
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
  (get) => get(pendingNewTypeAtom) !== null || get(current)?.isNew
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
