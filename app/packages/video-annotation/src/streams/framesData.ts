import { type FramesData, toSchemaField } from "@fiftyone/annotation";
import {
  type LabelData,
  LabelType,
  LIST_LABEL_CHILD,
  type RawClassification,
  type RawDetection,
  type RawKeypoint,
  type RawPolyline,
  SINGLETON_LABEL_TYPES,
} from "@fiftyone/utilities";

/** The minimal `/frames` document shape this adapter reads. */
export interface FrameDocLike {
  frame_number: number;
  [key: string]: unknown;
}

/** A raw `/frames` list element. */
type RawElement = RawDetection | RawPolyline | RawKeypoint | RawClassification;

/**
 * A raw `/frames` singleton field value. Unlike a list element this arrives
 * with its `_cls` already stamped by the server, so nothing has to be inferred
 * from a registration table.
 *
 * `_id` only: `/frames` ships raw Mongo documents through `foj.stringify`,
 * which turns an ObjectId into a string but never renames the key, so the
 * un-prefixed `id` spelling the list types also carry cannot reach here.
 */
interface RawSingleton {
  _id?: string;
  _cls?: string;
  [key: string]: unknown;
}

/**
 * Singular element `_cls` for each per-frame list label type. The store
 * addresses elements by their track `instance._id` and persists each frame's
 * list by document `_id`, so every element needs the right `_cls` stamped.
 *
 * This map is the authority on which per-frame fields can paint: `toFieldSpecs`
 * skips any type absent here, so a field admitted elsewhere but missing from
 * this map registers into the store and then silently never renders. Callers
 * that need to know the renderable set derive it from these keys rather than
 * restating them — see `PROJECTABLE_FRAME_LABEL_TYPES`.
 *
 * Every entry also needs a `LIST_LABEL_CHILD` child key and a Lighter adapter
 * in `annotation/engine/surfaces/lighter/adapters.ts`; all four below have both.
 *
 * LIST types only. Single-document frame labels (`Segmentation`, `Heatmap`)
 * have no element list to name and carry their own `_cls`, so they register
 * through `SINGLETON_LABEL_TYPES` instead and are folded into
 * {@link PROJECTABLE_FRAME_LABEL_TYPES} alongside these.
 */
export const ELEMENT_CLS: Partial<Record<LabelType, string>> = {
  [LabelType.Detections]: "Detection",
  [LabelType.Polylines]: "Polyline",
  [LabelType.Keypoints]: "Keypoint",
  [LabelType.Classifications]: "Classification",
};

/**
 * The per-frame list label types this pipeline can actually seed and paint —
 * derived from {@link ELEMENT_CLS} so the two cannot drift apart.
 */
export const PROJECTABLE_FRAME_LABEL_TYPES = new Set<LabelType>([
  ...(Object.keys(ELEMENT_CLS) as LabelType[]),
  ...SINGLETON_LABEL_TYPES,
]);

/**
 * Identity for a per-frame SINGLETON label (`Segmentation`, `Heatmap`).
 *
 * A singleton's document `_id` is minted per frame, so addressing by it would
 * make every frame its own track: the bridge would unmount and remount the
 * overlay on every playhead step, re-decoding the mask through a gated mount
 * and painting nothing in between — visible as a mask that strobes during
 * playback. A field holds at most one of these per frame, so the FIELD is the
 * identity, and this id is stable for the whole clip. One handle, reused
 * across frames, with `updateHandle` swapping the mask.
 *
 * Safe because singletons never persist from this surface: `getJsonPatch` and
 * `rebaseFrame` both skip any type without a `LIST_LABEL_CHILD` entry, which
 * is every singleton. The document's own id is preserved as `_docId` for
 * anything that needs to address the stored label.
 */
export const singletonAddressId = (path: string): string => `field:${path}`;

/**
 * Per-field projection plan derived from the registered label types.
 *
 * Two shapes, because the `/frames` payload carries them differently: a list
 * field nests its elements one level down (`detections: { detections: [...] }`)
 * while a singleton IS the field value (`segmentation: { _cls, mask, ... }`)
 * and already carries its own `_cls`.
 */
type FieldSpec =
  | {
      kind: "list";
      /** Sample-schema path the store addresses by (e.g. `frames.detections`). */
      path: string;
      /** In-frame-doc field the `/frames` payload carries (e.g. `detections`). */
      perFrameField: string;
      /** Child key holding the element list (e.g. `detections`, `polylines`). */
      listChild: string;
      /** Singular `_cls` stamped on each element (e.g. `Detection`). */
      cls: string;
    }
  | {
      kind: "singleton";
      path: string;
      perFrameField: string;
    };

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
  labelTypes: Record<string, LabelType>,
): FramesData => {
  const specs = toFieldSpecs(labelTypes);
  const out: FramesData = {};

  for (const doc of docs) {
    const frame: Record<string, LabelData[]> = {};

    for (const spec of specs) {
      if (spec.kind === "singleton") {
        const value = doc[spec.perFrameField] as RawSingleton | undefined;

        // A singleton is held as a zero-or-one element list so the store's
        // shape (path -> LabelData[]) stays uniform. An absent field reads as
        // an empty list, which is how the delta path detects a removal.
        frame[spec.path] = value
          ? [toSingletonLabelData(value, spec.path)]
          : [];
        continue;
      }

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
    if (SINGLETON_LABEL_TYPES.has(type)) {
      specs.push({
        kind: "singleton",
        path,
        perFrameField: toSchemaField(path),
      });
      continue;
    }

    const listChild = LIST_LABEL_CHILD[type];
    const cls = ELEMENT_CLS[type];

    if (!listChild || !cls) {
      continue;
    }

    specs.push({
      kind: "list",
      path,
      perFrameField: toSchemaField(path),
      listChild,
      cls,
    });
  }

  return specs;
};

/**
 * A raw singleton field value as store {@link LabelData}, addressed by its
 * FIELD rather than its per-frame document id — see {@link singletonAddressId}
 * for why. The document's own id is kept as `_docId`.
 */
const toSingletonLabelData = (
  value: RawSingleton,
  path: string,
): LabelData => ({
  ...value,
  _id: singletonAddressId(path),
  _docId: value._id ?? "",
  _cls: value._cls ?? "",
});

/** A raw `/frames` element as store {@link LabelData}: stable `_id`, `_cls`. */
const toLabelData = (el: RawElement, cls: string): LabelData => ({
  ...el,
  _id: el._id ?? el.id ?? "",
  _cls: cls,
});
