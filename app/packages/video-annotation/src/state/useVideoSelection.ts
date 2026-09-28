/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEngine, useInteraction } from "@fiftyone/annotation";
import type { LabelType } from "@fiftyone/utilities";
import {
  INSTANCE_TRACK_TYPES,
  KEYFRAME_TYPES,
  sameIds,
  TEMPORAL_TYPES,
} from "./trackTypes";

/** Read selected track ids (engine instanceIds) from interaction state. */
export const useSelectedTrackIds = (): ReadonlySet<string> => {
  const engine = useAnnotationEngine();
  return useInteraction(
    engine,
    (i) => new Set(i.getActive().map((ref) => ref.instanceId)),
    sameIds,
  );
};

/**
 * True iff the selection is non-empty and every active ref's field resolves to
 * a label type in `allowed`. Gates on the schema field type, not on a label's
 * incidental shape.
 */
const useSelectionTypeGate = (allowed: ReadonlySet<LabelType>): boolean => {
  const engine = useAnnotationEngine();
  return useInteraction(engine, (i) => {
    const active = i.getActive();
    return (
      active.length > 0 &&
      active.every((ref) => allowed.has(engine.getLabelType(ref.path)))
    );
  });
};

/** True iff every selected track is keyframeable — gates Mark Keyframe. */
export const useSelectionIsKeyframeable = (): boolean =>
  useSelectionTypeGate(KEYFRAME_TYPES);

/**
 * True iff every selected track is an instance-geometry type (detection or
 * polyline) — gates Split.
 */
export const useSelectionIsInstanceTrack = (): boolean =>
  useSelectionTypeGate(INSTANCE_TRACK_TYPES);

/**
 * The field path of the selected temporal detection, or `null` when the
 * selection isn't a TD. Read from engine interaction — active refs carry their
 * `.path`, and the field's type comes from `engine.getLabelType` — so "New TD"
 * targets the field the user is working in without reaching into the sidebar's
 * editing pointer.
 */
export const useSelectedTemporalDetectionField = (): string | null => {
  const engine = useAnnotationEngine();
  return useInteraction(engine, (i) => {
    const td = i
      .getActive()
      .find((ref) => TEMPORAL_TYPES.has(engine.getLabelType(ref.path)));
    return td?.path ?? null;
  });
};

/**
 * Field path of the single selected instance track (detection or polyline),
 * or `null`. Track surgery must address the track's own frames field;
 * defaulting to the stream's primary field no-ops on a polyline track when
 * detections are primary.
 */
export const useSelectedInstanceTrackField = (): string | null => {
  const engine = useAnnotationEngine();
  return useInteraction(engine, (i) => {
    const track = i
      .getActive()
      .find((ref) => INSTANCE_TRACK_TYPES.has(engine.getLabelType(ref.path)));
    return track?.path ?? null;
  });
};

/** Read hovered track ids (engine instanceIds) from interaction state. */
export const useHoveredTrackIds = (): ReadonlySet<string> => {
  const engine = useAnnotationEngine();
  return useInteraction(
    engine,
    (i) => new Set(i.getHovered().map((ref) => ref.instanceId)),
    sameIds,
  );
};
