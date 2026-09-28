/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useActiveSampleId,
  useAnnotationEngine,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { useCallback, useState } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";

/**
 * Reactive "is the selected track a keyframe at this frame?" predicate
 * powering the Mark Keyframe toolbar icon's filled / outlined state.
 *
 * Returns `true` only when exactly one track is selected AND the engine has a
 * label on that track at `frame` AND that label's `keyframe` is `true`.
 * Returns `false` on no selection, multi-selection, no label at the frame, or
 * before the frame is known (`frame < 1`). The field is the selected track's
 * own (see below), not necessarily the stream's primary one.
 *
 * Reactivity sources:
 * - selection (`selectedIds`) and `frame` drive direct re-evaluation via
 *   React's normal re-render path.
 * - engine writes that could change the answer (a `markKeyframe` toggle, a
 *   propagation pass, a tag edit landing alongside `keyframe`) come through
 *   `annotation:keyframeChanged` and `annotation:labelEdit`. We bump a local
 *   counter on either, which forces this hook's owner to re-render and
 *   re-read the engine.
 *
 * No-ops before the labels stream publishes (no field path yet) and when no
 * sample is active.
 */
export const useFrameKeyframeState = (
  selectedIds: readonly string[],
  frame: number,
): boolean => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();

  // Bumped on engine writes that could flip the keyframe bit at the selected
  // (instance, frame). The value isn't read — only its identity drives the
  // re-render that re-reads the engine below.
  const [, setBump] = useState(0);
  const bump = useCallback(() => setBump((v) => v + 1), []);

  useAnnotationEventHandler("annotation:keyframeChanged", bump);
  useAnnotationEventHandler("annotation:labelEdit", bump);

  if (selectedIds.length !== 1 || !sampleId || !stream || frame < 1) {
    return false;
  }

  const instanceId = selectedIds[0];

  // Resolve the selected track's own field from its active interaction ref — a
  // track can live on a non-primary frame field (e.g. a polyline), and reading
  // the stream's primary field there returns the wrong label (or none), so the
  // toolbar icon's filled state would lie. Mirrors `markKeyframe`'s resolution
  // in `useVideoSurfaceActions`. Falls back to the primary field.
  const activePath = engine.interaction
    .getActive()
    .find((ref) => ref.instanceId === instanceId)?.path;
  const path = activePath ?? stream.labelsPath;

  const det = engine.getLabel({ sample: sampleId, path, instanceId, frame });
  return det?.keyframe === true;
};
