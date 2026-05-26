import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  KEYPOINT,
  POLYLINE,
} from "@fiftyone/utilities";
import type {
  BaseOverlay,
  OverlayFactory,
  Scene2D,
} from "@fiftyone/lighter";
import type { PrimitiveAtom } from "jotai";

export type LabelType =
  | typeof CLASSIFICATION
  | typeof DETECTION
  | typeof POLYLINE
  | typeof KEYPOINT;

/** Fields the annotation-context consumers actually read off the schema. */
export interface LabelSchema {
  read_only?: boolean;
  attributes?: unknown[];
  classes?: string[];
  default?: unknown;
  [key: string]: unknown;
}

export interface CreateOptions {
  id?: string;
  field?: string;
  labelValue?: string;
  /** Polyline only: first-vertex seed. Ignored for other types. */
  origin?: [number, number];
}

export interface CreateDeps {
  scene: Scene2D | null;
  addOverlay: (overlay: BaseOverlay, withUndo?: boolean) => void;
  overlayFactory: OverlayFactory;
}

export interface AnnotationContextSelected {
  label: AnnotationLabel | null;
  data: AnnotationLabel["data"] | null;
  field: string | null;
  type: LabelType | null;
  overlay: AnnotationLabel["overlay"] | undefined;
  schema: LabelSchema | null;
  savedData: AnnotationLabel["data"] | null;
  isEditing: boolean;
  isEditingMask: boolean;
  isNew: boolean;
  hasChanges: boolean;
  isFieldReadOnly: boolean;
  /** Non-null when no schema field exists for the requested new type. */
  pendingNewType: LabelType | null;
}

export interface AnnotationContext {
  selected: AnnotationContextSelected;

  setData: (
    data: Partial<AnnotationLabel["data"]>,
    options?: { replace?: boolean }
  ) => void;
  setField: (path: string) => void;
  /** Update savedData without touching the editing pointer (3D flows). */
  setSavedData: (data: AnnotationLabel["data"] | null) => void;
  /** No-op if `id` isn't the current label's id. */
  setEditingMask: (id: string, hasMask: boolean) => void;

  select: (labelAtom: PrimitiveAtom<AnnotationLabel>) => void;
  createNew: (
    type: LabelType,
    overrides?: CreateOptions
  ) => AnnotationLabel | null;
  clear: () => void;
  /** Fresh comparison at call time — safe inside `useEffect`. */
  isEditingAtom: (labelAtom: PrimitiveAtom<AnnotationLabel>) => boolean;

  lastUsed: {
    fieldFor: (type: LabelType) => string | null;
    labelFor: (fieldPath: string) => string | null;
    recordField: (type: LabelType, path: string) => void;
    recordLabel: (path: string, label: string) => void;
  };
}

export interface AnnotationFields {
  fields: string[];
  defaultField: string | null;
  /** Single-cardinality fields that already have a label — can't create more. */
  disabledFields: Set<string>;
}
