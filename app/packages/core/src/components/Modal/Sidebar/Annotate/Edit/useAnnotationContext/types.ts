import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  KEYPOINT,
  POLYLINE,
} from "@fiftyone/utilities";
import type { BaseOverlay, OverlayFactory, Scene2D } from "@fiftyone/lighter";
import type { PrimitiveAtom } from "jotai";
import type { AttributeConfig } from "../../SchemaManager/utils";

export type LabelType =
  | typeof CLASSIFICATION
  | typeof DETECTION
  | typeof POLYLINE
  | typeof KEYPOINT;

/** Fields the annotation-context consumers actually read off the schema. */
export interface LabelSchema {
  read_only?: boolean;
  attributes?: AttributeConfig[];
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

/**
 * Snapshot of the currently-editing label. `null` on the parent context's
 * `selected` field when no label is being edited — for non-label editing
 * states (pending new-type schema flow, primitive editors), see
 * {@link AnnotationContext.isEditing} and {@link AnnotationContext.pendingNewType}.
 */
export interface AnnotationContextSelected {
  /** The wrapper { data, overlay, path, type, isNew? }. */
  label: AnnotationLabel;
  /** Convenience accessor for `label.data`. */
  data: AnnotationLabel["data"];
  /** Field path the current label belongs to. */
  field: string | null;
  /** Canonical type of the current label. */
  type: LabelType | null;
  /** Convenience accessor for `label.overlay`. */
  overlay: AnnotationLabel["overlay"];
  /** Label-schema for `field`, or null when no field is active. */
  schema: LabelSchema | null;
  /** Snapshot of `data` at select/create time — baseline for dirty tracking. */
  savedData: AnnotationLabel["data"] | null;
  /** True while a mask is mid-authoring (paint/eraser/pen). */
  isEditingMask: boolean;
  /** True for labels created in-session and not yet persisted. */
  isNew: boolean;
  /** True when `data` differs from `savedData`. */
  hasChanges: boolean;
  /** True when the current field's schema is marked read-only. */
  isFieldReadOnly: boolean;
}

/**
 * Public API for the annotation editing pointer. Encapsulates the underlying
 * atoms — consumers should never touch them directly.
 */
/** Fresh-snapshot bundle of all editing state — what `readEditing` returns. */
export interface AnnotationEditingState {
  selected: AnnotationContextSelected | null;
  isEditing: boolean;
  pendingNewType: LabelType | null;
}

export interface AnnotationContext {
  /**
   * Reactive snapshot of the editing label, or null when no label is being
   * edited. Updated on each React render. Use `isEditing` / `pendingNewType`
   * to detect non-label editing states (primitive editor or schema flow).
   */
  selected: AnnotationContextSelected | null;
  /**
   * Fresh snapshot of `selected` + `isEditing` + `pendingNewType`. Use
   * inside synchronous event chains (e.g. lighter event handlers) where
   * closure-captured values may be stale because React hasn't re-rendered yet.
   */
  readEditing: () => AnnotationEditingState;
  /** True if a label is being edited, a primitive editor is open, or a pending-new-type schema flow is active. */
  isEditing: boolean;
  /** Non-null when no schema field exists for the requested new type. */
  pendingNewType: LabelType | null;

  /**
   * Update the current label's data. Defaults to a shallow merge; pass
   * `{ replace: true }` to swap the data object wholesale.
   */
  setData: (
    data: Partial<AnnotationLabel["data"]>,
    options?: { replace?: boolean }
  ) => void;
  /** Move the current label to a different schema field. */
  setField: (path: string) => void;
  /** Update savedData without touching the editing pointer (3D flows). */
  setSavedData: (data: AnnotationLabel["data"] | null) => void;
  /**
   * Set the mid-mask-authoring flag for the given label id. No-op if `id`
   * isn't the current label's id — filters out events from other overlays.
   */
  setEditingMask: (id: string, hasMask: boolean) => void;

  /**
   * Point editing at an existing label atom. Snapshots `savedData`, clears
   * any pending new-type flow, and seeds `isEditingMask` from `data.mask` /
   * `data.mask_path`.
   */
  select: (labelAtom: PrimitiveAtom<AnnotationLabel>) => void;
  /**
   * Build a new label of `type` and make it the editing target. Resolves
   * field/class from `overrides` or last-used memory. Returns null and
   * surfaces `pendingNewType` when no schema field is available.
   */
  createNew: (
    type: LabelType,
    overrides?: CreateOptions
  ) => AnnotationLabel | null;
  /** Drop the editing pointer and reset all derived state. */
  clear: () => void;
  /** Fresh comparison at call time — safe inside `useEffect`. */
  isEditingAtom: (labelAtom: PrimitiveAtom<AnnotationLabel>) => boolean;

  /** Per-type field memory and per-field class memory, populated by `clear`. */
  lastUsed: {
    /** Best-guess field for `type`: remembered → most-populated → schema default. */
    fieldFor: (type: LabelType) => string | null;
    /** Best-guess class for `fieldPath`: remembered → most-common → first class. */
    labelFor: (fieldPath: string) => string | null;
    /** Override the remembered field for `type`. */
    recordField: (type: LabelType, path: string) => void;
    /** Override the remembered class for `path`. */
    recordLabel: (path: string, label: string) => void;
  };
}

export interface AnnotationFields {
  fields: string[];
  defaultField: string | null;
  /** Single-cardinality fields that already have a label — can't create more. */
  disabledFields: Set<string>;
}
