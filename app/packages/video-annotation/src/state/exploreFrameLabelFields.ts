/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { FRAMES_PREFIX } from "@fiftyone/annotation";
import * as fos from "@fiftyone/state";
import { LabelType } from "@fiftyone/utilities";
import { PROJECTABLE_FRAME_LABEL_TYPES } from "../streams/framesData";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";

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
 * The per-frame label fields the EXPLORE surface should paint, keyed to their
 * label type — the Explore analogue of `useFrameLabelFields`.
 *
 * That hook derives from the annotation schemas (`activeLabelSchemas`), which
 * are populated by `useLoadSchemas` when the Annotate sidebar opens and by
 * `useEnsureSchemasLoaded` from the Schema Manager. Neither runs in Explore,
 * so the atom stays `null` there and every schema-gated derivation collapses
 * to empty — which is why the engine store registered no fields and the
 * bridge scoped to nothing.
 *
 * Explore's own source of truth is the sidebar's active paths, which is what
 * the video looker painted before this surface replaced it. Read those, keep
 * the `frames.*` namespace the video store owns, and resolve each one's type
 * from the frame field schema.
 */
/**
 * Pure half of {@link useExploreFrameLabelFields}: sidebar active paths plus a
 * frame field schema in, paintable `frames.*` fields out. Separated from the
 * hook so the selection rules are testable without Recoil.
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

export const useExploreFrameLabelFields = (): Record<string, LabelType> => {
  const active = useRecoilValue(fos.activeFields({ modal: true }));
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.FRAME }),
  );

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
