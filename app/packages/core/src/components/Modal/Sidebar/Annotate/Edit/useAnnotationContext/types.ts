import type { AnnotationEngine, LabelRef } from "@fiftyone/annotation";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  KEYPOINT,
  POLYLINE,
} from "@fiftyone/utilities";
import type { BaseOverlay, OverlayFactory, Scene2D } from "@fiftyone/lighter";
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
  /**
   * Engine + sample so the Classification create path can write the new label
   * through to the engine immediately — Classification has no draw gesture
   * (no `lighter:overlay-establish` ever fires), so without an explicit
   * engine.updateLabel here the new label lives only in the sidebar's jotai
   * draft and never reaches the underlying sample / labels list.
   */
  engine: AnnotationEngine;
  sample: string;
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
  /**
   * Engine identity captured from the interaction anchor at select time —
   * the namespace write sites address the engine with (full `frames.<field>`
   * path, track `instanceId`, present `frame`). Null when the selection had no
   * anchor (externally-managed editing atoms); write sites then fall back to
   * `field` + `data._id`.
   */
  ref: LabelRef | null;
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
    options?: { replace?: boolean },
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
   * `data.mask_path`. `ref` is the engine identity from the interaction anchor
   * (carried through to `selected.ref` for the form's write sites); omit it for
   * externally-managed atoms without an anchor.
   */
  select: (labelAtom: PrimitiveAtom<AnnotationLabel>, ref?: LabelRef) => void;
  /**
   * Build a new label of `type` and make it the editing target. Resolves
   * field/class from `overrides` or last-used memory. Returns null and
   * surfaces `pendingNewType` when no schema field is available.
   */
  createNew: (
    type: LabelType,
    overrides?: CreateOptions,
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
