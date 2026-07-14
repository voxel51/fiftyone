/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useActiveSampleId,
  useAnnotationEngine,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { frameAt } from "@fiftyone/playback";
import { useCallback, useState } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";

/**
 * Reactive "is the selected track a keyframe at this playhead?" predicate
 * powering the Mark Keyframe toolbar icon's filled / outlined state.
 *
 * Returns `true` only when exactly one track is selected AND the engine has a
 * detection on that track at the playhead frame AND that detection's
 * `keyframe` is `true`. Returns `false` on no selection, multi-selection, or
 * no detection at the current frame.
 *
 * Reactivity sources:
 * - selection (`selectedIds`) and playhead (`time`) drive direct re-evaluation
 *   via React's normal re-render path.
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
  time: number,
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

  if (selectedIds.length !== 1 || !sampleId || !stream || !stream.fps) {
    return false;
  }

  const instanceId = selectedIds[0];
  const frame = frameAt(time, stream.fps, stream.totalFrames ?? undefined);
  const path = `frames.${stream.labelsField}`;

  const det = engine.getLabel({ sample: sampleId, path, instanceId, frame });
  return det?.keyframe === true;
};
