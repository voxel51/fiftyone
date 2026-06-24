import { type FramesData, toSchemaField } from "@fiftyone/annotation";
import {
  type LabelData,
  LabelType,
  LIST_LABEL_CHILD,
  type RawDetection,
  type RawPolyline,
} from "@fiftyone/utilities";

/** The minimal `/frames` document shape this adapter reads. */
export interface FrameDocLike {
  frame_number: number;
  [key: string]: unknown;
}

/** A raw `/frames` list element (detection or polyline). */
type RawElement = RawDetection | RawPolyline;

/**
 * Singular element `_cls` for each per-frame list label type. The store
 * addresses elements by their track `instance._id` and persists each frame's
 * list by document `_id`, so every element needs the right `_cls` stamped.
 */
const ELEMENT_CLS: Partial<Record<LabelType, string>> = {
  [LabelType.Detections]: "Detection",
  [LabelType.Polylines]: "Polyline",
};

/** Per-field projection plan derived from the registered label types. */
interface FieldSpec {
  /** Sample-schema path the store addresses by (e.g. `frames.detections`). */
  path: string;
  /** In-frame-doc field the `/frames` payload carries (e.g. `detections`). */
  perFrameField: string;
  /** Child key holding the element list (e.g. `detections`, `polylines`). */
  listChild: string;
  /** Singular `_cls` stamped on each element (e.g. `Detection`). */
  cls: string;
}

/**
 * Map the nested `/frames` payload into the flat {@link FramesData} the
 * {@link FrameStore} seeds from, across every registered per-frame label
 * field.
 *
 * Each `/frames` document carries one embedded-list field per label type
 * under its frame-relative name (`detections: { detections: [...] }`,
 * `polylines: { polylines: [...] }`, …). The store addresses by the
 * sample-schema path (`frames.detections`) and holds the element list
 * directly, so this flattens `{ frame_number, <field>: { <child>: [...] } }`
 * to `{ [frame_number]: { "frames.<field>": elements } }` for each field in
 * `labelTypes`.
 *
 * Every registered path is written for every frame (defaulting to an empty
 * list) so a frame with no labels reads as honestly empty — the delta path
 * relies on that to detect removals. Elements pass through whole (mask,
 * `mask_path`, points, attributes, … survive the round trip); only `_id`/
 * `_cls` are normalized.
 *
 * @param docs - Cached `/frames` documents to project.
 * @param labelTypes - Registered per-frame label fields → their list type
 *   (the same map the {@link FrameStore} is constructed with).
 */
export const parseFramesData = (
  docs: Iterable<FrameDocLike>,
  labelTypes: Record<string, LabelType>
): FramesData => {
  const specs = toFieldSpecs(labelTypes);
  const out: FramesData = {};

  for (const doc of docs) {
    const frame: Record<string, LabelData[]> = {};

    for (const spec of specs) {
      const field = doc[spec.perFrameField] as
        | Record<string, RawElement[] | undefined>
        | undefined;
      const elements = field?.[spec.listChild] ?? [];
      frame[spec.path] = elements.map((el) => toLabelData(el, spec.cls));
    }

    out[doc.frame_number] = frame;
  }

  return out;
};

/** Resolve each registered list field into a concrete projection plan. */
const toFieldSpecs = (labelTypes: Record<string, LabelType>): FieldSpec[] => {
  const specs: FieldSpec[] = [];

  for (const [path, type] of Object.entries(labelTypes)) {
    const listChild = LIST_LABEL_CHILD[type];
    const cls = ELEMENT_CLS[type];

    if (!listChild || !cls) {
      continue;
    }

    specs.push({ path, perFrameField: toSchemaField(path), listChild, cls });
  }

  return specs;
};

/** A raw `/frames` element as store {@link LabelData}: stable `_id`, `_cls`. */
const toLabelData = (el: RawElement, cls: string): LabelData => ({
  ...el,
  _id: el._id ?? el.id ?? "",
  _cls: cls,
});
