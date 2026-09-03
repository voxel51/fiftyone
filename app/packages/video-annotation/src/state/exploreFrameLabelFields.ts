/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { FRAMES_PREFIX } from "@fiftyone/annotation";
import * as fos from "@fiftyone/state";
import { LabelType } from "@fiftyone/utilities";
import { PROJECTABLE_FRAME_LABEL_TYPES } from "../streams/framesData";
import { useMemo } from "react";
import { useTemporalDetectionFieldPaths } from "./accessors";

/**
 * Label types the per-frame pipeline can actually paint.
 *
 * Derived from `framesData`'s projection rather than restated: `toFieldSpecs`
 * builds a spec only for types it knows the element `_cls` for, and skips the
 * rest. A type admitted here but absent there would register into the
 * `FrameStore` — and into every `pendingPaths` / `frameEquals` walk — while
 * never being seeded and never painting. Deriving makes that drift impossible,
 * so widening support is a one-line change in `ELEMENT_CLS`.
 */
const RENDERABLE = PROJECTABLE_FRAME_LABEL_TYPES;

/**
 * `fiftyone.core.labels.Detections` -> `LabelType.Detections`. The enum's
 * values are exactly the embedded-doc class names, so the last dotted segment
 * is the lookup key.
 */
const toLabelType = (embeddedDocType?: string | null): LabelType | null => {
  if (!embeddedDocType) return null;
  const cls = embeddedDocType.split(".").pop() as LabelType | undefined;
  return cls && RENDERABLE.has(cls) ? cls : null;
};

/**
 * Pure half of {@link useExploreFrameLabelFields}: sidebar active paths plus a
 * frame field schema in, paintable `frames.*` fields out. Separated from the
 * hook so the selection rules are testable without a state provider.
 *
 * @param active - Sidebar active paths, `frames.`-prefixed for frame fields.
 * @param schema - Frame field schema, keyed WITHOUT the `frames.` prefix.
 */
export const toExploreFrameLabelFields = (
  active: readonly string[],
  schema: Record<string, { embeddedDocType?: string | null }> | null,
): Record<string, LabelType> => {
  const fields: Record<string, LabelType> = {};

  for (const path of active) {
    if (!path.startsWith(FRAMES_PREFIX)) continue;

    // The frame schema is keyed without the `frames.` prefix the sidebar
    // paths carry.
    const bare = path.slice(FRAMES_PREFIX.length);
    const type = toLabelType(schema?.[bare]?.embeddedDocType);

    if (type) {
      fields[path] = type;
    }
  }

  return fields;
};

/**
 * The per-frame label fields the EXPLORE surface should paint, keyed to their
 * label type — the Explore analogue of `useFrameLabelFields`.
 *
 * That hook derives from the annotation schemas, which know only the types the
 * editor can create (Detections and Polylines) and only the fields activated
 * in the Schema Manager. Using it in Explore meant `frames.keypoints` and
 * `frames.classifications` never painted, and a field checked in the sidebar
 * but inactive in the Schema Manager never painted either — both of which the
 * video looker drew.
 *
 * It also couples Explore to whether annotation is enabled at all: the modal
 * sidebar calls `useLoadSchemas()` whenever the annotation tab is available,
 * in BOTH modes, so the annotation-derived set is neither reliably empty nor
 * reliably right in Explore. Explore's own source of truth is the sidebar's
 * active paths, which is what the video looker painted from. Read those, keep
 * the `frames.*` namespace the video store owns, and resolve each one's type
 * from the frame field schema.
 */
export const useExploreFrameLabelFields = (): Record<string, LabelType> => {
  const active = fos.useActiveFields({ modal: true });
  const schema = fos.useFrameSchema();

  return useMemo(
    () => toExploreFrameLabelFields(active, schema),
    [active, schema],
  );
};

/**
 * The same fields as a set of paths — the bridge's projection scope. These stay
 * `frames.`-prefixed (the form the sidebar and the store both address by), NOT
 * the `bare` form stripped above for the frame schema lookup.
 */
export const useExploreFrameLabelPaths = (): ReadonlySet<string> => {
  const fields = useExploreFrameLabelFields();
  return useMemo(() => new Set(Object.keys(fields)), [fields]);
};

/**
 * The sample-level TemporalDetections fields Explore should paint.
 *
 * A TemporalDetection is sample-level, not `frames.*`, so it is a separate
 * question from every hook above — {@link useExploreFrameLabelFields} only
 * ever answers for the per-frame namespace. `useTemporalOverlaySync` (the
 * canvas side of a TD) and its Annotate counterpart both gate on
 * `useVisibleLabelSchemas()` (annotation-active ∩ explore-active), which is
 * the same annotation-schema derivation `useExploreFrameLabelFields`'s own doc
 * comment explains stays empty in Explore: `useLoadSchemas()` only runs when
 * the Annotate sidebar has been opened this session. A TD field checked in
 * the Explore sidebar of a session that never opened Annotate therefore paints
 * nothing.
 *
 * The fix mirrors the per-frame one: read the sidebar's own active paths
 * rather than the annotation schema, narrowed to the fields the dataset schema
 * says are actually TemporalDetections.
 */
export const useExploreTemporalDetectionFieldPaths =
  (): ReadonlySet<string> => {
    const active = fos.useActiveFields({ modal: true });
    const tdFields = useTemporalDetectionFieldPaths();

    return useMemo(() => {
      const tdSet = new Set(tdFields);
      return new Set(active.filter((path) => tdSet.has(path)));
    }, [active, tdFields]);
  };
