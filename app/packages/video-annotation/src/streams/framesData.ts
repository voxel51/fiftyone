import type { FramesData } from "@fiftyone/annotation";
import type {
  LabelData,
  RawDetection,
  RawDetectionsField,
} from "@fiftyone/utilities";

/** The minimal `/frames` document shape this adapter reads. */
export interface FrameDocLike {
  frame_number: number;
  [key: string]: unknown;
}

/**
 * Map the nested `/frames` payload into the flat {@link FramesData} the
 * {@link FrameStore} seeds from.
 *
 * Each `/frames` document carries a `Detections`-shaped field
 * (`{ detections: [...] }`) under the frame-relative field name
 * (`perFrameField`, e.g. `detections`). The store addresses by the
 * sample-schema path (`frames.detections`) and holds the element list directly,
 * so this flattens `{ frame_number, <field>: { detections } }` to
 * `{ [frame_number]: { "frames.<field>": elements } }`.
 *
 * Elements are passed through whole (mask, attributes, confidence, … survive
 * the round trip); only `_id`/`_cls` are normalized so the store can address by
 * the track's `instance._id` and persist each frame's list by document `_id`.
 */
export const parseFramesData = (
  docs: Iterable<FrameDocLike>,
  perFrameField: string
): FramesData => {
  const path = `frames.${perFrameField}`;
  const out: FramesData = {};

  for (const doc of docs) {
    const field = doc[perFrameField] as RawDetectionsField | undefined;
    const detections = field?.detections ?? [];

    out[doc.frame_number] = { [path]: detections.map(toLabelData) };
  }

  return out;
};

/** A raw `/frames` detection as store {@link LabelData}: stable `_id`, `_cls`. */
const toLabelData = (det: RawDetection): LabelData => ({
  ...det,
  _id: det._id ?? det.id ?? "",
  _cls: "Detection",
});
