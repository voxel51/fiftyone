/**
 * The generalized cross-surface LABEL-PATCH signal: a render-only preview of a
 * label edit, carrying the SAME `Partial<LabelData>` shape that
 * `engine.updateLabel` commits. Any surface publishes the fields it is
 * previewing mid-edit (a slider, a text input, a gesture); observers merge
 * `{ ...committed, ...patch }` and render only — the shared dispatch guard
 * forbids writing engine state back during the notification.
 *
 * Preview is the render-only twin of the commit: anything you can commit you
 * can preview, with no per-field code. Keyed by {@link EntityId}.
 */

import type { LabelData } from "@fiftyone/utilities";

import type { AnnotationEngine } from "../core/engine";
import { encodeEntityId } from "../identity/entityId";
import type { LabelRef } from "../identity/ref";

/** Signal-pipe topic for live label-field previews. */
export const LABEL_PATCH_SIGNAL = "label-patch";

/**
 * A sparse patch of the label fields being previewed — the same shape
 * `engine.updateLabel` accepts. Absolute values (the publisher resolves any
 * deltas), so observers merge it over their committed copy without base state.
 */
export type LabelPatchSignal = Partial<LabelData>;

/**
 * Imperative live preview: publish a render-only label patch on the engine
 * signal pipe (no commit). Surface-agnostic — the 2D and 3D bridges both mirror
 * it onto their overlay. Usable outside React; pass the engine instance.
 */
export const publishLabelPreview = (
  engine: AnnotationEngine,
  dataset: string,
  ref: LabelRef,
  patch: LabelPatchSignal
): void => {
  engine.publishSignal<LabelPatchSignal>(
    LABEL_PATCH_SIGNAL,
    encodeEntityId(dataset, ref),
    patch
  );
};
